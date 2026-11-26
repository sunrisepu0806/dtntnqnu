const fs = require('node:fs');
const { test, before, after } = require('node:test');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, Timestamp } = require('firebase/firestore');
let env;
const actors = {
 admin: {role:'Quản trị viên',group:'',department:''},
 scanner: {role:'Quét mã',group:'',department:''},
 group1: {role:'Tổ trưởng',group:'1',department:''},
 group2: {role:'Tổ trưởng',group:'2',department:''},
 events: {role:'Trưởng ban Sự kiện',group:'',department:'su-kien'},
 media: {role:'Trưởng ban Truyền thông',group:'',department:'truyen-thong'},
};
before(async()=>{
 const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8185').split(':');
 env=await initializeTestEnvironment({projectId:'demo-webdtntn-tests',firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.candidate.rules','utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const [id,actor] of Object.entries(actors)) {
   await setDoc(doc(db,'admin_accounts',id),{...actor,authVersion:'v1',passwordHash:'private'});
   await setDoc(doc(db,'web_sessions',id),{...actor,accountId:id,authVersion:'v1',expiresAt:Timestamp.fromMillis(Date.now()+3600000)});
  }
  for(const [id,group,department] of [['u1','1','su-kien'],['u2','2','truyen-thong']]) {
   await setDoc(doc(db,'users',id),{name:id,accessGroup:group,accessDepartment:department,soBuoiDiemDanh:0});
   await setDoc(doc(db,'attendance',id),{studentId:id,accessGroup:group});
   await setDoc(doc(db,'department_tasks',id),{studentId:id,accessDepartment:department});
  }
  await setDoc(doc(db,'activities','a'),{name:'Activity',isActive:true});
  await setDoc(doc(db,'group_checklists','to_1'),{u1:{a:true}});
  await setDoc(doc(db,'group_checklists','to_2'),{u2:{a:true}});
 });
});
after(async()=>{if(env)await env.cleanup()});
const db=id=>env.authenticatedContext(id).firestore();
test('member edits preserve ID, counters and creation date; duplicate creates are rejected', async () => {
 const { load } = require('./helpers.cjs');
 const { saveMember } = load('lib/member-write.ts');
 const store = db('admin');
 const fields = { name: 'Test', accessGroup: '1', accessDepartment: 'su-kien' };
 await saveMember(store, { studentId: 'test-member', initialSessions: 4, fields });
 const original = (await getDoc(doc(store, 'users', 'test-member'))).data();
 await require('node:assert/strict').rejects(saveMember(store, { studentId: 'test-member', initialSessions: 0, fields }));
 await require('node:assert/strict').rejects(saveMember(store, { studentId: 'renamed', existingId: 'test-member', originalStudentId: 'test-member', initialSessions: 0, fields }));
 await saveMember(store, { studentId: 'test-member', existingId: 'test-member', originalStudentId: 'test-member', initialSessions: 0,
   fields: { ...fields, name: 'Edited', soBuoiDiemDanh: 999, role: 'Quản trị viên' } });
 const edited = (await getDoc(doc(store, 'users', 'test-member'))).data();
 const assert = require('node:assert/strict');
 assert.equal(edited.name, 'Edited'); assert.equal(edited.soBuoiDiemDanh, 4);
 assert.equal(edited.role, 'Thành viên'); assert.equal(edited.createdAt.toMillis(), original.createdAt.toMillis());
 await assertFails(deleteDoc(doc(store, 'users', 'test-member')));
});
test('anonymous and fabricated admin claims cannot read or write private data',async()=>{
 for(const ctx of [env.unauthenticatedContext(),env.authenticatedContext('fake',{role:'Quản trị viên',isAdmin:true})]){
  const store=ctx.firestore();
  for(const col of ['admin_accounts','web_sessions','users','attendance']) {
   await assertFails(getDocs(collection(store,col)));
   await assertFails(setDoc(doc(store,col,'attack'),{role:'Quản trị viên'}));
  }
 }
});
test('no browser role can read credentials or change its own authorization',async()=>{
 for(const id of Object.keys(actors)) {
  for(const col of ['admin_accounts','web_sessions']) {
   await assertFails(getDoc(doc(db(id),col,id)));
   await assertFails(setDoc(doc(db(id),col,id),{role:'Quản trị viên'}));
  }
 }
});
test('group leaders can query only their group and edit only their checklist',async()=>{
 const store=db('group1');
 await assertSucceeds(getDocs(query(collection(store,'users'),where('accessGroup','==','1'))));
 await assertFails(getDocs(collection(store,'users')));
 await assertFails(getDoc(doc(store,'users','u2')));
 await assertSucceeds(getDocs(query(collection(store,'attendance'),where('accessGroup','==','1'))));
 await assertFails(getDocs(query(collection(store,'attendance'),where('accessGroup','==','2'))));
 await assertSucceeds(setDoc(doc(store,'group_checklists','to_1'),{u1:{a:false}},{merge:true}));
 await assertFails(setDoc(doc(store,'group_checklists','to_2'),{u2:{a:false}},{merge:true}));
 await assertFails(updateDoc(doc(store,'users','u1'),{soBuoiDiemDanh:999}));
});
test('department leaders read only their department and cannot directly award points',async()=>{
 const store=db('events');
 await assertSucceeds(getDocs(query(collection(store,'users'),where('accessDepartment','==','su-kien'))));
 await assertSucceeds(getDocs(query(collection(store,'department_tasks'),where('accessDepartment','==','su-kien'))));
 await assertFails(getDocs(collection(store,'users')));
 await assertFails(getDoc(doc(store,'users','u2')));
 await assertFails(updateDoc(doc(store,'users','u1'),{soBuoiDiemDanh:3}));
 await assertFails(setDoc(doc(store,'department_tasks','fake'),{accessDepartment:'su-kien'}));
});
test('scanner reads needed data but all attendance writes must use server API',async()=>{
 const store=db('scanner');
 for(const col of ['users','attendance'])await assertSucceeds(getDocs(collection(store,col)));
 await assertFails(setDoc(doc(store,'attendance','fake'),{studentId:'u1'}));
 await assertFails(updateDoc(doc(store,'users','u1'),{soBuoiDiemDanh:1}));
 await assertFails(deleteDoc(doc(store,'users','u1')));
});
test('admin manages business data but cannot reintroduce plaintext credentials',async()=>{
 const store=db('admin');
 await assertSucceeds(getDocs(collection(store,'users')));
 await assertSucceeds(setDoc(doc(store,'users','new'),{name:'New',accessGroup:'1',accessDepartment:'su-kien'}));
 await assertFails(updateDoc(doc(store,'users','new'),{passwork:'12345'}));
 await assertFails(updateDoc(doc(store,'users','new'),{passwordHash:'hash'}));
 await assertFails(deleteDoc(doc(store,'users','new')));
 await assertSucceeds(setDoc(doc(store,'posts_activities','news'),{title:'News'}));
});
test('logout, expiry, account deletion and role change immediately revoke database access',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  const store=ctx.firestore();
  await deleteDoc(doc(store,'web_sessions','group2'));
  await updateDoc(doc(store,'web_sessions','media'),{expiresAt:Timestamp.fromMillis(Date.now()-1000)});
  await updateDoc(doc(store,'admin_accounts','events'),{authVersion:'v2'});
  await deleteDoc(doc(store,'admin_accounts','scanner'));
 });
 for(const id of ['group2','media','events','scanner'])await assertFails(getDoc(doc(db(id),'activities','a')));
});

test('registration profiles are private and activity deletion is server-only',async()=>{
 const anonymous=env.unauthenticatedContext().firestore();
 await assertFails(getDocs(collection(anonymous,'activity_registrations')));
 await assertSucceeds(getDocs(collection(db('admin'),'activity_registrations')));
 await assertFails(deleteDoc(doc(db('admin'),'activities','a')));
});
