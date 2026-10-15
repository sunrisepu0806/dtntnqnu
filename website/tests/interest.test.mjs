import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInterest, createStore } from '../server/interest.mjs';
const id='a55d22a1-3826-4f20-8ce1-3a7e0c01882f';
async function run(req, store) {
  let result; const headers={};
  const res={setHeader(k,v){headers[k]=v;},end(text){result={status:this.statusCode,body:JSON.parse(text),headers};}};
  await handleInterest({headers:{host:'example.com',origin:'https://example.com'},...req},res,()=>store);
  return result;
}
test('cross-origin POST cannot write',async()=>{
  const result=await run({method:'POST',headers:{host:'example.com',origin:'https://other.example'},body:{visitorId:id}},{add(){throw Error('must not run');}});
  assert.equal(result.status,403);
});
test('bad input returns 400; valid cookie overrides supplied ID',async()=>{
  assert.equal((await run({method:'POST',body:'{bad json'},{})).status,400);
  let stored;
  const result=await run({method:'POST',headers:{host:'example.com',origin:'https://example.com',cookie:`qnu_visitor=${id}`},body:{visitorId:'invalid'}},{async add(value){stored=value;return {count:1,interested:true};}});
  assert.equal(stored,id); assert.equal(result.status,200);assert.match(result.headers['Set-Cookie'],/HttpOnly.*Secure/);
});
test('database unavailable never returns a fake zero',async()=>{
  const result=await run({method:'GET'},{read(){throw Error('offline');}});
  assert.equal(result.status,503);assert.equal(result.body.count,undefined);
});
test('atomic marker and increment reject duplicate writes without a second count',async()=>{
  let exists=false,count=0;
  const mock=async(url,options)=>{
    if(options.method==='POST'){
      const {writes}=JSON.parse(options.body);
      assert.equal(writes.length,2);
      assert.equal(writes[0].currentDocument.exists,false);
      assert.equal(writes[1].updateTransforms[0].increment.integerValue,'1');
      if(exists)return Response.json({error:{status:'ALREADY_EXISTS'}},{status:409});
      exists=true;count++;return Response.json({});
    }
    if(url.includes('/visitors/'))return exists?Response.json({name:'marker'}):new Response('',{status:404});
    return Response.json({fields:{count:{integerValue:String(count)}}});
  };
  const store=createStore({NEXT_PUBLIC_FIREBASE_PROJECT_ID:'test',NEXT_PUBLIC_FIREBASE_API_KEY:'test'},mock);
  const results=await Promise.all([store.add(id),store.add(id)]);
  assert.equal(count,1);assert.ok(results.every(r=>r.count===1&&r.interested));
});
