"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { attendanceReviewPath } from "@/lib/permissions";
import { summarizeReport, type ReportEntry } from "@/lib/monthly-report";
type Entry=ReportEntry & {activityId:string;sessionId:string;submittedBy:string;approvedBy:string;archived:boolean};
export default function AttendanceLedger({memberId="",group="",department="",activityId=""}:{memberId?:string;group?:string;department?:string;activityId?:string}) {
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState(""),[flow,setFlow]=useState(department?"department":"group"),[loading,setLoading]=useState(true);
 const [admin,setAdmin]=useState(false),[revision,setRevision]=useState(0),[archived,setArchived]=useState(false),[reason,setReason]=useState(""),[busy,setBusy]=useState(false);
 const [activity,setActivity]=useState(""),[date,setDate]=useState(""),[legacy,setLegacy]=useState(false),[notice,setNotice]=useState("");
 const [selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{
    // Batch resource initialization after commit and cancel stale route setup.
    let dispose: void | (() => void);
    const setup = setTimeout(() => { dispose = (() => {const c=new AbortController();setLoading(true);setError("");setSelected([]);
  fetch(`/api/attendance/ledger?${new URLSearchParams({memberId,group,department,activityId})}`,{signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.entries);setAdmin(d.admin);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
 
    })(); }, 0);
    return () => { clearTimeout(setup); dispose?.(); };
  },[memberId,group,department,activityId,revision]);
 const active=rows.filter(r=>!r.archived);
 const visible=rows.filter(r=>!!r.archived===archived&&r.flow===flow&&(!activity||r.activityId===activity)&&(!date||r.sessionDate===date)&&(!legacy||!r.sessionDate||!r.submittedBy));
 const selectedRows=visible.filter(r=>selected.includes(r.id));
 async function adjust(targets:Entry[]) {
  if(busy||!reason.trim()||!targets.length)return;
  if(!window.confirm(`${archived?"Khôi phục":"Lưu trữ"} ${targets.length} lượt, ${targets.reduce((n,r)=>n+r.points,0)} buổi ở luồng ${flow==="group"?"tổ":"ban/mảng"}?\nLý do: ${reason}`))return;
  setBusy(true);setError("");let done=0;
  try {for(const row of targets){const r=await fetch("/api/attendance/archive",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flow:row.flow,id:row.id,action:row.archived?"restore":"archive",reason}),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error);done++;}}
  catch(e){setError(e instanceof Error?e.message:"Không lưu được. Hãy tải lại để đối soát trước khi thử lại.");}
  finally{setNotice(`Đã xử lý ${done}/${targets.length} lượt. Kiểm tra danh sách sau khi tải lại.`);setRevision(n=>n+1);setBusy(false);}
 }
 async function exportFile(){try{const {downloadAttendanceReport}=await import("@/lib/attendance-export");await downloadAttendanceReport({memberId,group,department,activityId});}catch(e){setError(e instanceof Error?e.message:"Không xuất được file.");}}
 return <section className="my-4 space-y-3 rounded-xl border bg-white p-4">
  <h2 className="font-bold">Sổ điểm danh hoạt động / mảng</h2>
  {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button disabled={busy||loading} onClick={()=>setRevision(n=>n+1)} className="rounded border p-2">Làm mới sổ</button>
  {loading?<p>Đang tải sổ…</p>:<>
   <div className="ledger-flow-options" role="group" aria-label="Luồng sổ điểm danh">{["group","department"].map(key=>{const sum=summarizeReport(active.filter(r=>r.flow===key));return <button type="button" aria-pressed={flow===key} disabled={busy} key={key} onClick={()=>{setFlow(key);setSelected([]);setActivity("");}} className={`rounded-xl border p-3 ${flow===key?"bg-sky-50":""}`}>{key==="group"?"Hoạt động":"Mảng"}: {sum.members} người · {sum.records} lượt · {sum.points} buổi</button>;})}</div>
   <div className="unified-filter-bar"><label>Hoạt động<select disabled={busy} className="block w-full rounded border p-2" value={activity} onChange={e=>{setActivity(e.target.value);setSelected([]);}}><option value="">Tất cả hoạt động trong sổ</option>{Array.from(new Map(rows.filter(r=>r.flow===flow).map(r=>[r.activityId,r.activity])).entries()).map(([id,name])=><option key={id} value={id}>{name||"Hoạt động cũ chưa rõ"}</option>)}</select></label><label>Ngày tham gia<input disabled={busy} type="date" className="block w-full rounded border p-2" value={date} onChange={e=>{setDate(e.target.value);setSelected([]);}}/></label></div>
   <label className="block"><input type="checkbox" checked={legacy} onChange={e=>{setLegacy(e.target.checked);setSelected([]);}}/> Đối soát dữ liệu cũ thiếu ngày hoặc người gửi</label>
   {legacy&&<p className="rounded bg-amber-50 p-3 text-sm">Chỉ hiển thị thông tin đã lưu. Không suy đoán ngày, người gửi hoặc chuyển số dư cũ sang luồng khác. Đối chiếu chứng từ trước khi điều chỉnh.</p>}
   <button className="rounded-xl bg-emerald-700 p-3 text-white" onClick={()=>void exportFile()}>Xuất toàn bộ phạm vi thành Excel 2 sheet</button>
   {admin&&<details className="task-disclosure ledger-adjust"><summary>Lưu trữ / khôi phục lượt {archived&&"· Đang xem lưu trữ"}</summary><div className="space-y-3"><label className="block"><input disabled={busy} type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setSelected([]);}}/> Xem lượt đã lưu trữ để khôi phục</label><label className="block">Lý do điều chỉnh<input disabled={busy} className="block w-full rounded border p-2" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="text-sm">Đề nghị chờ duyệt vẫn được giữ lại. Nếu muốn ngừng tính cả hoạt động, đóng hoạt động và xử lý các đề nghị còn chờ trước.</p><Link href={attendanceReviewPath} className="block text-sky-700 underline">Xem / từ chối danh sách đang chờ duyệt</Link><button disabled={busy} onClick={()=>setSelected(visible.map(r=>r.id))} className="rounded border p-2">Chọn {visible.length} lượt đang hiển thị</button> <button disabled={busy||!reason.trim()||!selectedRows.length} onClick={()=>void adjust(selectedRows)} className="rounded border p-2 disabled:opacity-50">{archived?"Khôi phục":"Lưu trữ"} {selectedRows.length} lượt đã chọn</button></div></details>}
   <div className="ledger-entry-list">{visible.map(r=><article key={`${r.flow}:${r.id}`} className="ledger-entry text-sm">{admin&&<input aria-label={`Chọn lượt ${r.memberName}`} disabled={busy} type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,r.id]:old.filter(id=>id!==r.id))}/>} <strong>{r.memberName} · {r.studentId}</strong><p>{r.activity} · {r.sessionDate||"Chưa rõ ngày tham gia"} · {r.sessionName}</p><p>Tổ {r.group||"chưa rõ"} · {r.department||""} · {r.points} buổi</p><p>Người gửi: {r.submittedBy||"Dữ liệu cũ chưa có"} · Người duyệt: {r.approvedBy||"Ghi trực tiếp / dữ liệu cũ"}</p>{admin&&<button disabled={busy||!reason.trim()} onClick={()=>void adjust([r])} className="mt-2 rounded border p-2 disabled:opacity-50">{r.archived?"Khôi phục lượt này":"Lưu trữ lượt này"}</button>}</article>)}{!visible.length&&<p>Chưa có lượt ghi nhận ở phạm vi này.</p>}</div>
  </>}
 </section>;
}

