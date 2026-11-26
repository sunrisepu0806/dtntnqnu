const {DatabaseSync} = require('node:sqlite');
const {randomBytes, createHash, scryptSync} = require('node:crypto');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.join(os.homedir(),'.qnu-portal-lab');
fs.mkdirSync(root,{recursive:true});
const db = new DatabaseSync(process.env.QNU_LAB_DB || path.join(root,'pilot.sqlite'));
db.exec(`PRAGMA busy_timeout=5000;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,salt TEXT,hash TEXT,admin INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY,title TEXT,day TEXT,slot TEXT,points INTEGER,code TEXT UNIQUE,expires INTEGER);
CREATE TABLE IF NOT EXISTS attendance(shift TEXT,uid TEXT,points INTEGER,at TEXT,actor TEXT,source TEXT,PRIMARY KEY(shift,uid));
CREATE TABLE IF NOT EXISTS terms(id TEXT PRIMARY KEY,at TEXT,actor TEXT);
CREATE TABLE IF NOT EXISTS dues(term TEXT,uid TEXT,amount INTEGER,at TEXT,actor TEXT,PRIMARY KEY(term,uid));
CREATE TABLE IF NOT EXISTS fund_receivers(ref TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fund_members(uid TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,uid TEXT,batch TEXT,kind TEXT,size TEXT,price INTEGER,status TEXT,readyAt TEXT,receivedAt TEXT,receivedBy TEXT,createdAt TEXT,actor TEXT,UNIQUE(uid,batch,kind));
CREATE TABLE IF NOT EXISTS payments(ref TEXT PRIMARY KEY,amount INTEGER,at TEXT,actor TEXT);
CREATE TABLE IF NOT EXISTS events(action TEXT,target TEXT,at TEXT,actor TEXT);`);
const all=(s,...v)=>db.prepare(s).all(...v), one=(s,...v)=>db.prepare(s).get(...v),run=(s,...v)=>db.prepare(s).run(...v);
const now=()=>new Date().toISOString(), token=()=>randomBytes(24).toString('hex'), digest=v=>createHash('sha256').update(v).digest('hex');
function fail(msg,status=400){throw Object.assign(new Error(msg),{status})}
function str(v,max=100){if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('Vui lòng kiểm tra thông tin đã nhập.');return v.trim()}
function num(v,max){if(v==null||v===''||!Number.isSafeInteger(+v)||+v<0||+v>max)fail('Số tiền hoặc số điểm không hợp lệ.');return +v}
function account(id,name,pw,admin=0){const salt=token();run('INSERT INTO users VALUES(?,?,?,?,?)',id,name,salt,scryptSync(pw,salt,32).toString('hex'),admin)}
if (!one('SELECT id FROM users LIMIT 1')) transaction(() => {
  if (one('SELECT id FROM users LIMIT 1')) return;
  account('admin','Quản trị thử','QnuTest2026',1);
  for (let i=1;i<=80;i++) account(String(8000000000+i),'Thành viên mẫu '+i,'QnuTest2026');
  for (const [id, slot] of [['demo-am','Sáng'],['demo-pm','Chiều']]) {
    run('INSERT INTO shifts VALUES(?,?,?,?,?,NULL,0)',id,'Hoạt động tình nguyện','2026-11-21',slot,2);
  }
});
const kinds=['Áo','Thẻ','Dây đeo'];
function order(uid,batch,kind,size){if(!kinds.includes(kind))fail('Chọn vật phẩm.');run("INSERT OR IGNORE INTO items(uid,batch,kind,size,status,createdAt,actor) VALUES(?,?,?,?,'Đang chuẩn bị',?,?)",uid,batch,kind,kind==='Áo'?str(size,12):'',now(),'admin')}
function verifyMember(id){if(!one('SELECT id FROM users WHERE id=? AND admin=0',id))fail('MSSV chưa được tiếp nhận.')}
const semesterFee = 50000;
const money = amount => amount.toLocaleString('vi-VN') + ' đ';

function transaction(work, readOnly = false) {
  db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validStudentId(value) {
  const id = str(value, 30);
  if (!/^\d+$/.test(id)) fail('MSSV chỉ gồm chữ số.');
  return id;
}

function termKey(value, validate = false) {
  const text = str(value, 40).normalize('NFKC').trim().replace(/\s+/g, ' ');
  const match = text.match(/^(?:hk|học kỳ|học kì)\s*([12])\s*[-·:]?\s*(\d{4})\s*[-–—/]\s*(\d{4})$/iu);
  if (!match) return text.toLocaleLowerCase('vi');
  if (+match[3] !== +match[2] + 1) {
    if (validate) fail('Năm học phải gồm hai năm liên tiếp.');
    return text.toLocaleLowerCase('vi');
  }
  return 'HK' + match[1] + ' ' + match[2] + '–' + match[3];
}

function semester(value, uid) {
  const terms = all('SELECT id FROM terms ORDER BY at, id');
  const key = termKey(value, !terms.some(term => term.id === value));
  const aliases = terms.filter(term => termKey(term.id) === key);
  if (uid && aliases.length > 1) {
    const found = one(`SELECT d.term FROM dues d LEFT JOIN payments p ON p.ref='fund/'||d.term||'/'||d.uid
      WHERE d.uid=? AND d.term IN (SELECT value FROM json_each(?)) ORDER BY p.at IS NULL,d.at LIMIT 1`, uid, JSON.stringify(aliases.map(term=>term.id)));
    if (found) return found.term;
  }
  return aliases[0]?.id || (key.startsWith('HK') ? key : str(value, 40));
}

function academicOrder(value) {
  const match = termKey(value).match(/^HK([12]) (\d{4})–\d{4}$/);
  return match ? Number(match[2])*2 + Number(match[1]) : 0;
}

function previousFundMembers(value) {
  const target = academicOrder(value);
  const previous = all('SELECT DISTINCT term FROM dues').map(({term})=>({term, rank:academicOrder(term)}))
    .filter(row=>row.rank && row.rank<target).sort((a,b)=>b.rank-a.rank);
  if (!previous.length) return [];
  const aliases = previous.filter(row=>row.rank===previous[0].rank).map(row=>row.term);
  return all('SELECT DISTINCT uid FROM dues WHERE term IN (SELECT value FROM json_each(?))', JSON.stringify(aliases)).map(row=>row.uid);
}

function openTerm(term, actor) {
  run('INSERT OR IGNORE INTO terms VALUES(?,?,?)', term, now(), actor);
}

function startDue(term, uid, actor) {
  openTerm(term, actor);
  return insertDue.run(term, uid, semesterFee, now(), actor).changes;
}

const dueQuery = `SELECT x.*,p.at AS paid,p.actor AS paidBy,r.name AS paidByName,COALESCE(f.name,m.name,x.uid) AS name
    FROM dues x LEFT JOIN payments p ON p.ref='fund/'||x.term||'/'||x.uid
    LEFT JOIN fund_receivers r ON r.ref=p.ref LEFT JOIN fund_members f ON f.uid=x.uid LEFT JOIN users m ON m.id=x.uid`;

function fundRecord(term, uid) {
  return one(dueQuery+' WHERE x.term=? AND x.uid=?', term, uid);
}

const saveFundName = db.prepare('INSERT INTO fund_members VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name');
const insertDue = db.prepare('INSERT OR IGNORE INTO dues VALUES(?,?,?,?,?)');

function fundBatchInput(values) {
  if (!Array.isArray(values) || !values.length) fail('Hãy dán danh sách MSSV hoặc chọn tệp.');
  if (values.length > 1000) fail('Nhập tối đa 1.000 dòng mỗi lần. Hãy chia danh sách thành hai lượt.');
  return values.map((value,index) => {
    if (typeof value !== 'string' || value.trim().length > 128) fail('Kiểm tra MSSV ở dòng '+(index+1)+'.');
    return value.trim();
  });
}

const isFundId = uid => /^\d{1,30}$/.test(uid);
function fundLookupIds(values) {
  return [...new Set(fundBatchInput(values).filter(isFundId))];
}

function batchDues(actor, body, profiles) {
  const entries = fundBatchInput(body.ids);
  const ids = [...new Set(entries.filter(isFundId))];
  const term = semester(body.term);
  const aliases = all('SELECT id FROM terms').filter(row=>termKey(row.id)===termKey(term)).map(row=>row.id);
  const idsJson = JSON.stringify(ids);
  const existing = all(`SELECT d.uid,p.at AS paid FROM dues d
    LEFT JOIN payments p ON p.ref='fund/'||d.term||'/'||d.uid
    WHERE d.term IN (SELECT value FROM json_each(?)) AND d.uid IN (SELECT value FROM json_each(?))`, JSON.stringify(aliases), idsJson);
  const statusById = new Map();
  for (const due of existing) {
    if (due.paid || !statusById.has(due.uid)) statusById.set(due.uid, due.paid ? 'paid' : 'pending');
  }
  const directory = profiles ?? all('SELECT id,name FROM users WHERE admin=0 AND id IN (SELECT value FROM json_each(?))', idsJson);
  const members = new Map();
  for (const member of directory) members.set(member.id, members.has(member.id) ? null : member);
  const seen = new Set();
  const rows = entries.map((uid,index) => {
    let status;
    if (!isFundId(uid)) status='invalid';
    else if (seen.has(uid)) status='duplicate';
    else if (!members.has(uid)) status='missing';
    else if (!members.get(uid)) status='ambiguous';
    else status=statusById.get(uid) || 'new';
    seen.add(uid);
    return {line:index+1, uid, name:members.get(uid)?.name || '', status};
  });
  const ready = rows.filter(row=>row.status==='new');
  const commit = body.action==='term';
  if (commit && ready.length) {
    openTerm(term, actor);
    const at=now();
    for (const row of ready) {
      saveFundName.run(row.uid, row.name || row.uid);
      const added=insertDue.run(term,row.uid,semesterFee,at,actor).changes;
      row.status=added ? 'created' : 'pending';
    }
  }
  const count=commit ? rows.filter(row=>row.status==='created').length : ready.length;
  const amount=count*semesterFee;
  const message=(commit?'Đã lập ':'Sẽ lập ')+count+' khoản mới · '+money(amount)+' · '+term;
  return {term, rows, count, amount, message};
}

function addMemberDue(actor, body, member) {
  const uid = validStudentId(body.uid);
  const profile = member || one('SELECT id,name FROM users WHERE id=? AND admin=0', uid);
  if (profile?.id !== uid) fail('MSSV ' + uid + ' chưa có trong danh bạ thành viên.', 404);
  const term = semester(body.term, uid);
  saveFundName.run(uid, profile.name || uid);
  const added = startDue(term, uid, actor);
  const due = fundRecord(term, uid);
  const paid = due.paid;
  const status = added ? 'created' : paid ? 'already_paid' : 'already_due';
  const message = added ? 'Đã lập khoản quỹ' : paid ? 'Đã thu trước đó' : 'Đã có khoản chờ thu';
  return {status, term, uid, due, message: message + ' · ' + profile.name + ' (' + uid + ') · ' + money(semesterFee) + ' · ' + term};
}

function confirmPayment(user, body) {
  const uid = validStudentId(body.uid), term = semester(body.term, uid);
  const due = one('SELECT amount FROM dues WHERE term=? AND uid=?', term, uid);
  if (!due) fail('Thành viên chưa có khoản quỹ trong học kỳ này.', 404);
  const key = 'fund/' + term + '/' + uid;
  const added = run('INSERT OR IGNORE INTO payments VALUES(?,?,?,?)', key, due.amount, now(), user.id).changes;
  if (added) {
    run('INSERT INTO events VALUES(?,?,?,?)', 'pay', key, now(), user.id);
    run('INSERT INTO fund_receivers VALUES(?,?)', key, user.name || user.id);
  }
  return {status: added ? 'paid' : 'already_paid', term, uid, due: fundRecord(term, uid), message: (added ? 'Đã xác nhận thu' : 'Đã thu trước đó') + ' · ' + uid + ' · ' + money(due.amount) + ' · ' + term};
}

function act(u,b,member,directoryMembers){
 const a=b.action;
 if (u.group && !u.admin) {
   if (a !== 'pay' || !member || member.id !== b.uid || member.group !== u.group) fail('Chỉ được xác nhận khoản quỹ của thành viên trong tổ mình.', 403);
 } else if (!u.admin && !['scan','receive'].includes(a)) fail('Cần quyền quản trị.',403);
 if (a === 'openTerm') {
   const term = semester(b.term);
   openTerm(term, u.id);
   if (b.usePrevious !== true) return {term, message: 'Đã mở ' + term};
   const ids = previousFundMembers(term);
   const profiles = directoryMembers === undefined
     ? all('SELECT id,name FROM users WHERE admin=0 AND id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
     : directoryMembers;
   const byId = new Map(profiles.map(profile=>[profile.id,profile]));
   let created=0, skipped=0;
   for (const id of ids) {
     const profile = byId.get(id);
     if (!profile) { skipped++; continue; }
     if (addMemberDue(u.id, {term, uid:id}, profile).status==='created') created++;
   }
   return {term, created, skipped, message: 'Đã mở ' + term + ' · ' + created + ' khoản mới' +
     (skipped ? ' · Bỏ qua ' + skipped + ' MSSV chưa xác định được trong danh bạ' : '')};
 }
 if (a === 'startDue') return addMemberDue(u.id, b, member);
 if (a === 'pay') return confirmPayment(u, b);
 if (a==='newShift') {
   const day=str(b.day,10);
   if (!/^\d{4}-\d\d-\d\d$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10)!==day) fail('Ngày chưa hợp lệ.');
   const shiftId=token(), slot=str(b.slot);
   run('INSERT INTO shifts VALUES(?,?,?,?,?,NULL,0)',shiftId,str(b.title),day,slot,num(b.points,100));
   run('INSERT INTO events VALUES(?,?,?,?)',a,shiftId,now(),u.id);
   return {shiftId, message:'Đã tạo ca '+slot+'.'};
 }
 else if (a === 'open' || a === 'close') {
   const shift = one('SELECT id,expires FROM shifts WHERE id=?', str(b.shift));
   if (!shift) fail('Chọn ca.');
   if (a === 'open' && shift.expires > Date.now()) return 'Ca đang mở.';
   run('UPDATE shifts SET code=?,expires=? WHERE id=?', a === 'open' ? token() : null, a === 'open' ? Date.now()+15*60000 : 0, shift.id);
 }
 else if(a==='scan'||a==='staff'){const shift=a==='scan'?one('SELECT * FROM shifts WHERE code=? AND expires>?',str(b.code),Date.now()):one('SELECT * FROM shifts WHERE id=? AND expires>?',str(b.shift),Date.now());if(!shift)fail('Mã sai hoặc ca đã đóng, hết hạn.');const uid=a==='scan'?u.id:str(b.uid);if(a==='scan'||member?.id!==uid)verifyMember(uid);const added=run('INSERT OR IGNORE INTO attendance VALUES(?,?,?,?,?,?)',shift.id,uid,shift.points,now(),u.id,a).changes;return {status:added?'recorded':'already_recorded',shiftId:shift.id,pointsAdded:added?shift.points:0,message:added?'Đã điểm danh · +'+shift.points+' điểm':'Đã điểm danh trước đó · không cộng thêm'}}
 else if (a==='term' || a==='preview') return batchDues(u.id,b,directoryMembers);
 else if(a==='enroll'){const id=str(b.uid,30),term=semester(b.term);if(!/^\d+$/.test(id))fail('MSSV chỉ gồm chữ số.');if(!one('SELECT id FROM terms WHERE id=?',term))fail('Mở kỳ trước khi tiếp nhận.');if(one('SELECT id FROM users WHERE id=?',id))fail('MSSV đã được tiếp nhận.');account(id,str(b.name),str(b.password));startDue(term,id,u.id);for(const kind of (b.strap?kinds:kinds.slice(0,2)))order(id,'Tiếp nhận',kind,b.size)}
 else if(a==='order'){const uid=str(b.uid);verifyMember(uid);order(uid,str(b.batch),b.kind,b.size)}
 else if(a==='receive'||a==='ready'||a==='price'||a==='itemPay'){const r=one('SELECT * FROM items WHERE id=?',num(b.id,1e9));if(!r||(!u.admin&&r.uid!==u.id))fail('Không có quyền với vật phẩm.',403);
 if(a==='price'){if(r.price!==null)fail('Đơn giá đã chốt.');run('UPDATE items SET price=? WHERE id=?',num(b.price,1e8),r.id)}
 if(a==='ready'&&r.status==='Đang chuẩn bị')run("UPDATE items SET status='Có thể nhận',readyAt=? WHERE id=?",now(),r.id);
 if(a==='receive'){if(u.admin||r.status==='Đang chuẩn bị')fail('Chưa thể xác nhận nhận đồ.');if(!r.receivedAt)run("UPDATE items SET status='Đã nhận',receivedAt=?,receivedBy=? WHERE id=?",now(),u.id,r.id)}
 if(a==='itemPay'){if(!(r.price>0))fail('Cần chốt giá có thu tiền.');run('INSERT OR IGNORE INTO payments VALUES(?,?,?,?)','item/'+r.id,r.price,now(),u.id)}}
 else fail('Thao tác chưa hợp lệ.');
 run('INSERT INTO events VALUES(?,?,?,?)',a,String(b.id||b.uid||b.shift||b.term||''),now(),u.id);return 'Đã lưu';
}
function applyAction(user, body, member, directoryMembers) {
  return transaction(() => {
    const result = act(user, body, member, directoryMembers);
    return typeof result === 'string' ? {message: result} : result;
  }, body.action === 'preview');
}

function state(user, groupIds = []) {
  const leader = !!user.group && !user.admin;
  const staff = user.admin || leader;
  const filter = user.admin ? '' : leader ? ' WHERE x.uid IN (SELECT value FROM json_each(?))' : ' WHERE x.uid=?';
  const args = user.admin ? [] : [leader ? JSON.stringify(groupIds) : user.id];
  const dues = all(dueQuery + filter + ' ORDER BY x.at DESC,x.uid', ...args);
  const terms = staff ? all('SELECT id FROM terms ORDER BY at DESC,id') : [...new Set(dues.map(due => due.term))].map(id => ({id}));
  const result = {user:{id:user.id,name:user.name,admin:!!user.admin,group:user.group || ''},terms,dues};
  if (leader) return result;
  return {...result,
    members: user.admin ? all('SELECT id,name FROM users WHERE admin=0 ORDER BY id') : [],
    shifts: all('SELECT id,title,day,slot,points,expires' + (user.admin ? ',code' : '') + ' FROM shifts ORDER BY day DESC,slot'),
    attendance: all('SELECT x.*,s.title,s.day,s.slot FROM attendance x JOIN shifts s ON s.id=x.shift' + filter + ' ORDER BY x.at DESC', ...args),
    items: all("SELECT x.*,p.at paid FROM items x LEFT JOIN payments p ON p.ref='item/'||x.id" + filter + ' ORDER BY x.id DESC', ...args)
  };
}

function activeCode(id) {
  const shift = one('SELECT code FROM shifts WHERE id=? AND expires>?', id, Date.now());
  if (!shift) fail('Ca đã hết hạn.');
  return shift.code;
}

module.exports = {state, applyAction, activeCode, validStudentId, previousFundMembers, fundLookupIds, one, run, digest, token, str, fail};
