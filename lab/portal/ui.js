export function mountPortal(root, base = "") {
const $=s=>root.querySelector(s), box=$('#content');
let data, reader, qrId='', selectedShift='', busy=false, expiryTimer;
const controller=new AbortController();
const embedded=root.dataset.adminEntry==='true';
let revision=0;
const on=(name,listener)=>root.addEventListener(name,listener,{signal:controller.signal});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opts=rows=>rows.map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
const field=(label,name,type='text',value='')=>'<label>'+label+'<input required name="'+name+'" type="'+type+'" value="'+esc(value)+'"></label>';
const select=(label,name,rows)=>'<label>'+label+'<select required name="'+name+'">'+opts(rows)+'</select></label>';
const form=(action,html,button)=>'<form data-action="'+action+'">'+html+'<button type="submit">'+button+'</button></form>';
const section=(title,html)=>'<section><h2>'+title+'</h2>'+html+'</section>';
const btn=(action,text,id)=>'<button data-op="'+action+'" data-id="'+esc(id)+'">'+text+'</button>';
const mssvField = () => '<label>Mã số sinh viên<input required name="uid" inputmode="numeric" pattern="[0-9]+" maxlength="30" autocomplete="off" placeholder="Nhập MSSV"></label>';
const dayLabel = day => new Date(day+'T12:00:00+07:00').toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const selectedOptions = (rows, current) => rows.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===current?' selected':'')+'>'+esc(label)+'</option>').join('');
const hidden=(name,v)=>'<input type="hidden" name="'+name+'" value="'+esc(v)+'">';
function notice(msg,error=false){const n=$('#notice');n.textContent=msg;n.hidden=!msg;n.className=error?'bad':''}
async function send(b){const r=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||(r.status===403?'Máy chủ từ chối yêu cầu từ địa chỉ này (mã 403).':'Máy chủ lỗi (mã '+r.status+'). Thử lại sau.'));return v}
async function stop(){if(reader){const cam=reader;reader=null;await cam.stop().catch(()=>{});cam.clear()}}
async function refresh(){
 const current=++revision;
 const r=await fetch(base+'/api/state',{signal:controller.signal,cache:'no-store'});
 if(!r.ok && (embedded || r.status!==401)) {
   const error=await r.json().catch(()=>({}));
   if(embedded && [401,403].includes(r.status)) { data=null; draw(); }
   throw Error(error.error || 'Chưa kết nối được dịch vụ dữ liệu mẫu.');
 }
 const result=r.ok?await r.json():null;
 if(controller.signal.aborted||current!==revision)return;
 data=result;draw();
}
function qr() {
  let controls;
  if (data.user.admin) {
    const shifts = data.shifts;
    const current = shifts.find(shift => shift.id === selectedShift)
      || shifts.find(shift => shift.expires > Date.now()) || shifts[0];
    selectedShift = current?.id || '';
    const active = current && current.expires > Date.now();
    const chooser = current ? '<label>Ca điểm danh<select id="shift-choice">' + selectedOptions(
      shifts.map(shift => [shift.id, shift.slot+' · '+dayLabel(shift.day)+' · '+shift.title]), selectedShift) + '</select></label>' : '';
    const stateLine = current ? '<p class="shift-meta"><strong class="'+(active?'is-open':'')+'">'+
      (active ? 'Đang mở' : 'Đang đóng')+'</strong> · '+esc(current.points)+' điểm'+
      (active?' · Hết hạn '+new Date(current.expires).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'')+'</p>' : '';
    const actions = current ? '<div class="pilot-actions">'+(active ?
      btn('showQr', qrId === current.id ? 'Ẩn QR' : 'Xem QR',current.id)+btn('close','Đóng ca',current.id) : btn('open','Mở QR',current.id))+'</div>' : '';
    const creation = '<details class="pilot-disclosure"><summary>Tạo ca mới</summary>'+form('newShift',
      field('Tên hoạt động','title')+field('Ngày','day','date')+select('Ca','slot',['Sáng','Chiều','Tối'].map(v=>[v,v]))+field('Điểm','points','number',2),'Tạo ca')+'</details>';
    let entry = '', image = '';
    if (active) {
      entry = form('staff',hidden('shift',current.id)+mssvField(),'Ghi nhận');
      if (qrId === current.id) {
        const url = base+'/qr.png?id='+encodeURIComponent(current.id)+'&v='+current.expires;
        image = '<div class="pilot-code"><img width="220" height="220" alt="Mã QR điểm danh của ca '+esc(current.slot)+'" src="'+esc(url)+'">'+
          '<div><b>'+esc(current.title)+'</b><small>'+esc(current.slot+' · '+dayLabel(current.day))+'</small><a download="qr-ca.png" href="'+esc(url)+'">Tải ảnh QR</a>'+
          '<details><summary>Mã nhập tay</summary><code>'+esc(current.code)+'</code></details></div></div>';
      }
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => {
        if (!data?.user.admin || controller.signal.aborted) return;
        qrId=''; draw(); notice('Ca đã hết hạn. Mở QR để tiếp tục điểm danh.');
      }, Math.max(10, current.expires-Date.now()+20));
    }
    controls='<section aria-label="Điểm danh theo ca">'+(current ? '<div class="shift-picker">'+chooser+actions+'</div>'+stateLine+entry+image+creation :
      '<p>Chưa có ca điểm danh.</p>'+creation)+'</section>';
  } else {
    controls=section('Quét QR của ca','<button data-op="camera">Bật camera</button><div id="camera"></div>'+
      form('scan',field('Mã ca (nếu nhập tay)','code'),'Điểm danh'));
  }
  const total = data.attendance.reduce((sum,row)=>sum+row.points,0);
  const history = data.attendance.map(entry =>
    '<li><span><b>'+esc(entry.title)+'</b><small>'+esc([dayLabel(entry.day),entry.slot,entry.uid].join(' · '))+'</small></span><strong>+'+esc(entry.points)+' điểm</strong></li>'
  ).join('');
  return controls+'<section><details class="pilot-disclosure"><summary>Lịch sử điểm danh <small>'+data.attendance.length+' lượt · '+total+' điểm</small></summary>'+
    (history ? '<ul class="qr-history">'+history+'</ul>' : '<p>Chưa có lượt điểm danh.</p>')+'</details></section>';
}

function draw() {
  clearTimeout(expiryTimer);
  const user = data?.user;
  root.dataset.portalSession = user ? 'active' : 'guest';
  $('#logout').hidden = !user || embedded;
  $('#who').textContent = user ? user.name+' · '+user.id : '';
  $('#title').textContent = user || embedded ? 'QR hoạt động' : 'Đăng nhập';
  $('#tabs').replaceChildren();
  box.innerHTML=user ? qr() : embedded ? '<p>Vui lòng đăng nhập để mở điểm danh QR.</p>' :
    section('Tài khoản thử nghiệm',form('login',field('MSSV hoặc tài khoản','uid')+field('Mật khẩu','password','password'),'Đăng nhập')+
      '<p>Admin: admin · Thành viên: 8000000001<br>Mật khẩu mẫu: QnuTest2026</p>');
}

async function perform(body) {
  if (busy) return;
  busy=true;
  const target = body.action;
  const inputSelector = target==='staff' ? 'form[data-action="'+target+'"] [name="uid"]' : '';
  const submit = inputSelector && $(inputSelector)?.form?.querySelector('button');
  if(submit) submit.disabled=true;
  try {
    const result=await send(body);
    if (controller.signal.aborted) return;
    if (target==='newShift') { selectedShift=result.shiftId; qrId=''; }
    if (target==='open') qrId=selectedShift=body.shift;
    if (target==='close') qrId='';
    if (target==='login'||target==='logout') {
      qrId=selectedShift='';
    }
    await stop();
    await refresh();
    notice(['open','close'].includes(target) ? '' : result.message || '');
    if(inputSelector) $(inputSelector)?.focus({preventScroll:true});
  } catch(error) {
    if(controller.signal.aborted) return;
    notice(error.message,true);
    if(inputSelector){const input=$(inputSelector);input?.focus({preventScroll:true});input?.select();}
  } finally {
    busy=false;
    if(submit) submit.disabled=false;
  }
}

on('submit',event=>{
  event.preventDefault();
  const form=event.target, body=Object.fromEntries(new FormData(form));
  body.action=form.dataset.action;
  perform(body);
});

on('change',event=>{
  if(busy || event.target.id!=='shift-choice') return;
  selectedShift=event.target.value; qrId=''; notice(''); draw();
  $('#shift-choice')?.focus({preventScroll:true});
});
on('click',async event=>{
  const button=event.target.closest('button');
  if(!button || busy) return;
  const op=button.dataset.op, id=button.dataset.id;
  if(op==='refresh') {
    busy=true;
    try {await stop(); await refresh(); notice('Đã cập nhật dữ liệu.');}
    catch(error){if(!controller.signal.aborted) notice(error.message,true);}
    finally{busy=false;}
    return;
  }
  if(button.id==='logout') return perform({action:'logout'});
  if(!op) return;
  if(op==='showQr') {qrId=qrId===id?'':id; draw(); $('[data-op="showQr"]')?.focus({preventScroll:true}); return;}
  if(op==='camera') {
    try {
      if(reader) {await stop();button.textContent='Bật camera';return;}
      reader=new Html5Qrcode('camera');
      await reader.start({facingMode:'environment'},{fps:8,qrbox:220},code=>{if(reader)void stop().then(()=>perform({action:'scan',code}));});
      button.textContent='Tắt camera';
    } catch {reader=null;notice('Chưa mở được camera. Cho phép camera hoặc nhập mã ca.',true);}
    return;
  }
  perform({action:op,id,shift:id});
});
refresh().catch(error=>{if(!controller.signal.aborted)notice(error.message,true);});
return ()=>{controller.abort();clearTimeout(expiryTimer);void stop();};
}
