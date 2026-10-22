"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { approvalBatches } from "@/lib/approval-batches";
type Row = { batchId?:string; createdBy?:string; activityId?:string; accessGroup?:string; accessDepartment?:string; id: string; memberName: string; studentId: string; kind: string; activityName: string; taskName: string; workDescription: string; productLink: string; points: number; submittedBy: string; status: string; reason?: string; reviewedBy?: string; time: number };
export default function AttendanceApprovals() {
  const [rows,setRows]=useState<Row[]>([]);
  const [admin,setAdmin]=useState(false);
  const [status,setStatus]=useState("pending");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<string[]>([]);
  const [notice,setNotice]=useState("");
  const [rejectIds,setRejectIds]=useState<string[]>([]);
  const [rejectReason,setRejectReason]=useState("");
  const lock=useRef(false);
  const activeRequest=useRef<AbortController | null>(null);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(signal?.aborted)return;
    activeRequest.current?.abort();
    const controller=new AbortController();
    activeRequest.current=controller;
    const abort=()=>controller.abort();
    signal?.addEventListener("abort",abort,{once:true});
    const timeout=setTimeout(abort,20000);
    try {
      const response=await fetch(`/api/attendance/requests?status=${status}`,{signal:controller.signal});const data=await response.json();
      if(!response.ok)throw Error(data.error);
      if(controller.signal.aborted)return;
      setRows(old=>JSON.stringify(old)===JSON.stringify(data.rows)?old:data.rows);setAdmin(data.admin);setError(data.capped ? "Đang hiển thị tối đa 500 đề nghị." : "");
      setSelected(old=>old.filter(id=>data.rows.some((row:Row)=>row.id===id)));
    }catch(e){if(!signal?.aborted && activeRequest.current===controller)setError(e instanceof Error?e.message:"Không tải được đề nghị.");}
    finally{clearTimeout(timeout);signal?.removeEventListener("abort",abort);if(!signal?.aborted && activeRequest.current===controller){activeRequest.current=null;setLoading(false);}}
  },[status]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setSelected([]);setRejectIds([]);
    const load=()=>{if(!document.hidden && !lock.current)void refresh(controller.signal);};
    load();
    let debounce: ReturnType<typeof setTimeout>;
    const update=()=>{clearTimeout(debounce);debounce=setTimeout(load,500);};
    window.addEventListener("attendance-requests-changed",update);
    document.addEventListener("visibilitychange",load);
    const timer=setInterval(load,30000);
    return()=>{controller.abort();activeRequest.current?.abort();clearInterval(timer);clearTimeout(debounce);window.removeEventListener("attendance-requests-changed",update);document.removeEventListener("visibilitychange",load);};
  },[refresh]);
  async function review(ids:string[],action:"approve"|"reject",reason="") {
    if(lock.current || !ids.length)return;
    if(action==="reject"&&!reason.trim()){setRejectIds(ids);setRejectReason("");return;}
    lock.current=true;setBusy(true);setNotice("");let ok=0;const failures:string[]=[];
    try {
      for(const id of ids){
        try {const response=await fetch("/api/attendance/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,reason}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error);if(data.alreadyReviewed && data.status !== (action==="approve"?"approved":"rejected"))throw Error("Đề nghị đã được xử lý theo trạng thái khác.");ok++;}
        catch(e){failures.push(`${rows.find(r=>r.id===id)?.studentId || id}: ${e instanceof Error?e.message:"Chưa xác nhận"}`);}
      }
      setSelected([]);setRejectIds([]);setRejectReason("");await refresh();setNotice(`Đã xử lý ${ok}/${ids.length} đề nghị.`);if(failures.length)setError(failures.join("\n"));
    }finally{lock.current=false;setBusy(false);}
  }
  return <section className="rounded-2xl border border-amber-200 bg-white p-5 space-y-3">
    {rejectIds.length>0&&<div role="dialog" aria-label="Từ chối đề nghị" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><label className="block text-sm font-semibold">Lý do từ chối {rejectIds.length} đề nghị<textarea autoFocus rows={3} maxLength={1000} value={rejectReason} disabled={busy} onChange={e=>setRejectReason(e.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3"/></label><div className="flex gap-3"><button disabled={busy||!rejectReason.trim()} onClick={()=>void review(rejectIds,"reject",rejectReason)} className="min-h-11 rounded-lg bg-rose-600 px-4 text-white disabled:opacity-50">Xác nhận từ chối</button><button disabled={busy} onClick={()=>setRejectIds([])} className="min-h-11 px-3">Hủy</button></div></div>}
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-lg">{admin?"Duyệt điểm danh tổ / ban, mảng":"Đề nghị đã gửi"}</h2><p className="text-sm text-slate-500">Chờ duyệt chưa tính vào số buổi hoặc danh sách điểm danh chính thức.</p></div><button type="button" disabled={busy} className="text-sm text-sky-700" onClick={()=>void refresh()}>Làm mới</button></div>
    <div className="flex flex-wrap gap-2">{[["pending","Chờ duyệt"],["approved","Đã duyệt"],["rejected","Từ chối"]].map(([value,label])=><button type="button" disabled={busy} key={value} className={`rounded-lg border px-3 py-2 text-sm ${status===value?"bg-sky-600 text-white":""}`} onClick={()=>{setStatus(value);setNotice("");}}>{label}{value===status?` (${rows.length})`:""}</button>)}</div>
    {error&&<p role="alert" className="whitespace-pre-line text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-sky-700">{notice}</p>}
    {admin&&status==="pending"&&rows.length>0&&<div className="flex flex-wrap gap-3 items-center text-sm"><label><input type="checkbox" disabled={busy} checked={rows.length>0&&selected.length===rows.length} onChange={e=>setSelected(e.target.checked?rows.map(r=>r.id):[])} /> Chọn tất cả</label><button type="button" disabled={busy||!selected.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-white disabled:opacity-50" onClick={()=>void review(selected,"approve")}>{busy?"Đang xử lý…":`Duyệt ${selected.length} đề nghị đã chọn`}</button><button type="button" disabled={busy||!selected.length} className="text-red-700 disabled:opacity-50" onClick={()=>void review(selected,"reject")}>Từ chối đã chọn</button></div>}
    <div className="max-h-[32rem] overflow-auto space-y-2">{loading?<p>Đang tải…</p>:!rows.length?<p className="text-sm text-slate-500">Chưa có đề nghị ở trạng thái này. Sau khi kiểm tra MSSV, cần bấm gửi danh sách và chờ thông báo “Chờ admin duyệt”. Chỉ tạo hoạt động chưa phải là gửi đề nghị.</p>:approvalBatches(rows).map(batch=><details key={batch.key} className="rounded-xl border p-3"><summary className="cursor-pointer space-y-1"><strong>{batch.rows[0].activityName || batch.rows[0].taskName || "Đề nghị điểm danh"} · {batch.rows.length} người</strong><p className="text-sm">Người gửi: <strong>{batch.rows[0].submittedBy}</strong> · {batch.rows[0].accessGroup ? `Tổ ${batch.rows[0].accessGroup}` : "Toàn đội"}</p><p className="text-xs text-slate-500">{batch.rows[0].batchId ? `Đợt ${batch.rows[0].batchId.split(":").pop()?.slice(0,8)}` : "Đề nghị cũ / riêng lẻ"} · Bấm xem chi tiết</p></summary>{admin&&status==="pending"&&<div className="flex flex-wrap gap-3 py-3"><button disabled={busy} className="min-h-11 rounded-lg bg-emerald-600 px-3 text-white" onClick={()=>void review(batch.rows.map(r=>r.id),"approve")}>Duyệt {batch.rows.length} người trong đợt</button><button disabled={busy} className="min-h-11 px-3 text-red-700" onClick={()=>void review(batch.rows.map(r=>r.id),"reject")}>Từ chối đợt</button></div>}{batch.rows.map(row=><article key={row.id} className="rounded-xl border p-3 text-sm space-y-1"><div className="flex gap-2">{admin&&status==="pending"&&<input aria-label={`Chọn ${row.studentId}`} type="checkbox" disabled={busy} checked={selected.includes(row.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))}/>}<strong>{row.memberName} · {row.studentId}</strong></div><p>{row.kind==="award"?row.taskName:row.activityName} · Đề nghị {row.points} buổi</p>{row.workDescription&&<p className="whitespace-pre-wrap">{row.workDescription}</p>}{row.productLink&&<p className="break-all text-slate-500">Minh chứng: {row.productLink}</p>}<p className="text-slate-500">Người gửi: <strong className="text-slate-900">{row.submittedBy || "Chưa có tên người gửi"}</strong> · {new Date(row.time).toLocaleString("vi-VN")}</p><p className="font-semibold text-amber-700">{row.status==="pending"?"Chờ duyệt":row.status==="approved"?`Đã duyệt · ${row.reviewedBy || "Admin"}`:`Từ chối · ${row.reason || "Không có ghi chú"}`}</p>{admin&&status==="pending"&&<div className="flex gap-4 pt-2"><button type="button" disabled={busy} className="font-semibold text-emerald-700" onClick={()=>void review([row.id],"approve")}>Duyệt</button><button type="button" disabled={busy} className="text-red-700" onClick={()=>void review([row.id],"reject")}>Từ chối</button></div>}</article>)}</details>)}</div>
  </section>;
}
