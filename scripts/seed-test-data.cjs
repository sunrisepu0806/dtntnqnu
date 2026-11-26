// Deliberately hard-coded to the demo emulator. Never reads a credential file.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {randomBytes,scryptSync}=require('node:crypto');
async function main(){
 const app=initializeApp({projectId:'demo-webdtntn'}),db=getFirestore(app);
 // Easy-login accounts are exclusive to the local demo emulator.
 for(const [id,role,name,to] of [
  ['1','Quản trị viên','Admin local',''],
  ['2','Tổ trưởng','Tổ trưởng test · Tổ 1','Tổ 1'],
  ['3','Trưởng ban Sự kiện','Trưởng ban Sự kiện test',''],
  ['4','Trưởng ban Truyền thông','Trưởng ban Truyền thông test',''],
  ['5','Quét mã','Quét mã test',''],
 ]){
  const ref=db.doc(`admin_accounts/${id}`);
  if((await ref.get()).exists)continue;
  const accountSalt=randomBytes(16).toString('hex');
  await ref.create({mssv:id,name,role,to_id:to,passwordHash:`scrypt:${accountSalt}:${scryptSync('1',accountSalt,64).toString('hex')}`,authVersion:randomBytes(16).toString('hex')});
  console.log(`Created local demo account: ${id} (${role})`);
 }
 if((await db.doc('test_metadata/seed').get()).exists){console.log('Local sample data already exists; keeping your changes.');await deleteApp(app);return;}
 const salt=randomBytes(16).toString('hex'),passwordHash=`scrypt:${salt}:${scryptSync('ThuNghiem123!',salt,64).toString('hex')}`;
 const batch=db.batch();
 for(const [id,role,name,to] of [['9000000001','Quản trị viên','Admin mẫu',''],['9000000002','Tổ trưởng','Tổ trưởng mẫu','Tổ 1'],['9000000003','Trưởng ban Truyền thông','Trưởng ban Truyền thông mẫu',''],['9000000004','Trưởng ban Sự kiện','Trưởng ban Sự kiện mẫu','']])batch.set(db.doc(`admin_accounts/${id}`),{mssv:id,role,name,to_id:to,passwordHash,authVersion:'demo-v1'});
 for(let i=1;i<=300;i++){
  const id=String(8000000000+i),group=String((i-1)%5+1),department=i%2?'su-kien':'truyen-thong';
  batch.set(db.doc(`users/${id}`),{mssv:id,name:`Thành viên mẫu ${i}`,to_id:`to_${group}`,ban_id:[department==='su-kien'?'bansukien':'bantruyenthong'],accessGroup:group,accessDepartment:department,mangChuyenMon:department==='su-kien'?'Hậu cần':i%4?'Content – Viết bài':'Kỹ thuật – Hậu cần',soBuoiDiemDanh:0,groupSessions:0,departmentSessions:0});
 }
 for(const [id,flow,department,name] of [['demo-group','group','','Hoạt động tổ mẫu'],['demo-event','department','su-kien','Hoạt động Sự kiện mẫu'],['demo-media','department','truyen-thong','Hoạt động Truyền thông mẫu']])batch.set(db.doc(`activities/${id}`),{name,flow,accessDepartment:department,isActive:true,date:'2026-10-23',createdBy:'9000000001',sessions:[{id:'2026-10-23-1',date:'2026-10-23',name:'Sáng'},{id:'2026-10-24-2',date:'2026-10-24',name:'Chiều'}]});
 batch.set(db.doc('test_metadata/seed'),{createdAt:Timestamp.now(),sample:true});
 await batch.commit();await deleteApp(app);console.log('Created 300 fictional members, 4 test accounts and 3 multi-session activities.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
