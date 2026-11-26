const http = require('node:http');
const fs = require('node:fs'), path = require('node:path');
const {scryptSync, timingSafeEqual} = require('node:crypto');
const QR = require('qrcode');
const {state, applyAction, activeCode, one, run, digest, token, str, fail} = require('./store.cjs');
const port=Number(process.env.QNU_LAB_PORT||3211);
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['localhost','127.0.0.1'].includes((req.headers.host||'').split(':')[0]))fail('Local only',403);
 const sid=(req.headers.cookie||'').match(/(?:^|; )qnu_lab=([0-9a-f]+)/)?.[1]||'';
 const u=one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.token=? AND s.expires>?',digest(sid),Date.now());
 if(req.method==='GET'&&['/','/ui.js','/fund-import.js','/style.css','/camera.js','/xlsx.mjs'].includes(url.pathname)){
   const files={'/':'index.html','/ui.js':'ui.js','/fund-import.js':'fund-import.js','/style.css':'style.css'};
   const file=files[url.pathname] ? path.join(__dirname,files[url.pathname]) :
     require.resolve(url.pathname==='/xlsx.mjs'?'xlsx/xlsx.mjs':'html5-qrcode/html5-qrcode.min.js');
   res.setHeader('Content-Type',url.pathname==='/'?'text/html; charset=utf-8':url.pathname.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');
   return res.end(fs.readFileSync(file));
 }
 if(req.method==='GET'&&url.pathname==='/qr.png'){if(!u?.admin)fail('Cần đăng nhập.',403);const code=activeCode(url.searchParams.get('id'));res.setHeader('Content-Type','image/png');return res.end(await QR.toBuffer(code,{width:380,margin:4}))}
 res.setHeader('Content-Type','application/json; charset=utf-8');let result;
 if(req.method==='GET'&&url.pathname==='/api/state'){if(!u)fail('Đăng nhập để tiếp tục.',401);result=state(u)}
 else if(req.method==='POST'&&url.pathname==='/api/action'){if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)fail('Sai nguồn.',403);if(!req.headers['content-type']?.startsWith('application/json'))fail('Cần JSON.');let raw='';for await(const part of req){raw+=part;if(raw.length>50000)fail('Quá nhiều dữ liệu.')}const b=JSON.parse(raw);
 if(b.action==='login'){const account=one('SELECT * FROM users WHERE id=?',str(b.uid));if(!account||!timingSafeEqual(scryptSync(str(b.password),account.salt,32),Buffer.from(account.hash,'hex')))fail('Sai tài khoản hoặc mật khẩu.',401);const key=token();run('INSERT INTO sessions VALUES(?,?,?)',digest(key),account.id,Date.now()+8*3600000);res.setHeader('Set-Cookie','qnu_lab='+key+'; Path=/; HttpOnly; SameSite=Strict');result={ok:true}}
 else if(b.action==='logout'){run('DELETE FROM sessions WHERE token=?',digest(sid));res.setHeader('Set-Cookie','qnu_lab=; Max-Age=0; Path=/');result={ok:true}}
 else{if(!u)fail('Đăng nhập lại.',401);if(!['newShift','open','close','staff','scan'].includes(b.action))fail('Chức năng đã được gỡ.',404);result=applyAction(u,b)}}
 else fail('Không tìm thấy.',404);res.end(JSON.stringify(result))
 }catch(e){res.statusCode=e.status||400;res.end(JSON.stringify({error:e.status?e.message:'Dữ liệu không hợp lệ.'}))}}).listen(port,'127.0.0.1',()=>console.log('QNU lab http://127.0.0.1:'+port));
