require('@next/env').loadEnvConfig(process.cwd());
const {initializeApp,cert}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
(async()=>{
 const db=getFirestore(initializeApp({credential:cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)}));
 const snap=await db.collection('attendance_requests').select('status','submittedBy','createdBy').get();
 const counts={}; const senders=new Set();
 for(const d of snap.docs){const r=d.data();counts[r.status]=(counts[r.status]||0)+1;senders.add(r.submittedBy||'(missing name)');}
 console.log(JSON.stringify({total:snap.size,counts,senders:[...senders]}));
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
