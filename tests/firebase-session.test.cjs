const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
test('reuse only the Firebase connection matching the freshly validated web session',async()=>{
 const auth={currentUser:{uid:'session-a'}};let signs=0,persistence=0;
 const {connectFirebaseSession}=load('lib/firebase-session.ts',{'@/lib/firebase':{auth},'firebase/auth':{inMemoryPersistence:{},setPersistence:async()=>{persistence++;},signInWithCustomToken:async()=>{signs++;}}});
 await connectFirebaseSession('token-a','session-a');assert.equal(signs,0);assert.equal(persistence,0);
 await connectFirebaseSession('token-b','session-b');assert.equal(signs,1);
 auth.currentUser=null;await connectFirebaseSession('token-a','session-a');assert.equal(signs,2);
 await connectFirebaseSession('token-without-uid');assert.equal(signs,3);
});
