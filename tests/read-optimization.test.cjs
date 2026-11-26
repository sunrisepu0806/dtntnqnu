const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
class AttendanceError extends Error{constructor(message,status=400){super(message);this.status=status;}}

test('count-only approvals use aggregation and preserve owner/flow/status scope',async()=>{
 const filters=[];let counts=0;
 const query={where:(...filter)=>{filters.push(filter);return query;},count:()=>({get:async()=>{counts++;return{data:()=>({count:1234})};}}),get:()=>{throw Error('Must not download approval rows');}};
 const session={user:{role:'Tổ trưởng'},accountRef:{id:'leader'}};
 const {GET}=load('app/api/attendance/requests/route.ts',{
  'next/server':{NextResponse:Response},'firebase-admin/firestore':{FieldPath:{documentId:()=>''}},
  '@/lib/server-session':{readSession:async()=>session},'@/lib/firebase-admin':{adminDb:()=>({collection:()=>query})},
  '@/lib/attendance-service':{AttendanceError},
 });
 const response=await GET(new Request('http://localhost/api?countOnly=true&status=pending&flow=group'));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{count:1234});assert.equal(counts,1);
 assert.ok(filters.some(f=>f[0]==='createdBy'&&f[2]==='leader'));
 assert.ok(filters.some(f=>f[0]==='status'&&f[2]==='pending'));
 assert.ok(filters.some(f=>f[0]==='kind'&&f[2]==='attendance'));
});

test('approval pages read one lookahead row and continue within the selected scope',async()=>{
 const filters=[],limits=[],cursors=[];
 const documents=['a','b','c','d'].map(id=>({id,data:()=>({status:'pending'})}));
 let after='',limit=0;
 const query={
  where:(...f)=>{filters.push(f);return query;},orderBy:()=>query,
  startAfter:id=>{after=id;cursors.push(id);return query;},limit:n=>{limit=n;limits.push(n);return query;},
  get:async()=>{const docs=documents.filter(d=>d.id>after).slice(0,limit);return {docs,size:docs.length};},
 };
 const {GET}=load('app/api/attendance/requests/route.ts',{
  'next/server':{NextResponse:Response},'firebase-admin/firestore':{FieldPath:{documentId:()=>''}},
  '@/lib/server-session':{readSession:async()=>({user:{role:'Tổ trưởng'},accountRef:{id:'leader'}})},
  '@/lib/firebase-admin':{adminDb:()=>({collection:()=>query})},'@/lib/attendance-service':{AttendanceError},
 });
 const url='http://localhost/api?activityId=selected&flow=group&limit=2';
 const first=await (await GET(new Request(url))).json();
 assert.deepEqual(first.rows.map(r=>r.id),['a','b']);assert.equal(first.nextCursor,'b');
 const second=await (await GET(new Request(url+'&cursor='+first.nextCursor))).json();
 assert.deepEqual(second.rows.map(r=>r.id),['c','d']);assert.equal(second.nextCursor,null);
 assert.deepEqual(limits,[3,3]);assert.deepEqual(cursors,['b']);
 assert.ok(filters.some(f=>f[0]==='activityId'&&f[2]==='selected'));
 assert.ok(filters.some(f=>f[0]==='createdBy'&&f[2]==='leader'));
 assert.equal((await GET(new Request('http://localhost/api?limit=501'))).status,400);
});
test('unauthenticated count requests never query Firestore',async()=>{
 const {GET}=load('app/api/attendance/requests/route.ts',{'next/server':{NextResponse:Response},'firebase-admin/firestore':{},'@/lib/server-session':{readSession:async()=>null},'@/lib/firebase-admin':{adminDb:()=>{throw Error('Unexpected read');}},'@/lib/attendance-service':{AttendanceError}});
 assert.equal((await GET(new Request('http://localhost/api?countOnly=true'))).status,401);
});

test('filtered ledger skips the other flow and filters activity in Firestore',async()=>{
 const queries=[],filters=[];
 const {GET}=load('app/api/attendance/ledger/route.ts',{
  'next/server':{NextResponse:Response},'@/lib/server-session':{readSession:async()=>({user:{role:'Quản trị viên'}})},
  '@/lib/firebase-admin':{adminDb:()=>({collection:name=>{queries.push(name);const q={where:(...f)=>{filters.push(f);return q;},limit:()=>q,get:async()=>({size:0,docs:[]})};return q;}})},
  '@/lib/attendance-service':{AttendanceError},'@/lib/specialties':{specialtyLabel:v=>v},
 });
 const response=await GET(new Request('http://localhost/api?flow=group&activityId=selected'));
 assert.equal(response.status,200);assert.deepEqual(queries,['attendance']);
 assert.deepEqual(filters,[['activityId','==','selected']]);
});
