"use client";
import { useEffect, useState } from "react";

async function send(body:Record<string,unknown>){
  const response=await fetch("/api/members/removal-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Error(data.error);return data;
}
export function RequestMemberRemoval({id,name}:{id:string;name:string}){
  const [busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState("");
  const [open,setOpen]=useState(false),[reason,setReason]=useState("");
  async function submit(){
    if(!reason.trim()||busy)return;
    setBusy(true);setError("");
    try{await send({action:"request",memberId:id,reason});setSent(true);setOpen(false);}catch(e){setError(e instanceof Error?e.message:"Chưa gửi được.");}finally{setBusy(false);}
  }
  return <div><button type="button" disabled={busy||sent} onClick={()=>setOpen(!open)} className="min-h-11 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-60">{sent?"Đã gửi · Chờ duyệt":"Đề nghị xóa tạm"}</button>{open&&<div className="mt-3 max-w-sm space-y-2 whitespace-normal"><p className="text-sm">Đề nghị xóa tạm {name}. Chỉ ẩn khỏi danh sách sau khi admin duyệt.</p><label className="block text-sm">Lý do<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border p-3" disabled={busy}/></label><div className="flex gap-2"><button disabled={busy||!reason.trim()} onClick={()=>void submit()} className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm text-white disabled:opacity-50">{busy?"Đang gửi…":"Gửi admin duyệt"}</button><button disabled={busy} onClick={()=>setOpen(false)} className="min-h-11 px-3 text-sm">Hủy</button></div></div>}{error&&<p role="alert" className="max-w-64 whitespace-normal text-sm text-rose-700">{error}</p>}</div>;
}
type Row={id:string;memberName:string;studentId:string;submittedBy:string;reason:string;status:string;reviewReason?:string;accessGroup:string};
export default function MemberRemoval(){
  const [rows,setRows]=useState<Row[]>([]),[admin,setAdmin]=useState(false),[hidden,setHidden]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [decision,setDecision]=useState<{row:Row;action:string}|null>(null),[reviewReason,setReviewReason]=useState("");
  async function load(signal?:AbortSignal){try{
    const response=await fetch("/api/members/removal-requests",{signal,cache:"no-store"});
    if(response.status===403){setHidden(true);return;}
    const data=await response.json();if(!response.ok)throw Error(data.error);
    setRows(data.rows);setAdmin(data.admin);setError("");
  }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:"Không tải được danh sách.");}finally{if(!signal?.aborted)setLoading(false);}}
  useEffect(()=>{
    // Batch resource initialization after commit and cancel stale route setup.
    let dispose: void | (() => void);
    const setup = setTimeout(() => { dispose = (() => {const controller=new AbortController();void load(controller.signal);return()=>controller.abort();
    })(); }, 0);
    return () => { clearTimeout(setup); dispose?.(); };
  },[]);
  async function review(row:Row,action:string){
    if(busy || (action==="reject"&&!reviewReason.trim()))return;
    setBusy(true);try{await send({action,memberId:row.id,reason:reviewReason});setDecision(null);setReviewReason("");await load();}catch(e){setError(e instanceof Error?e.message:"Không xử lý được.");}finally{setBusy(false);}
  }
  if(hidden)return null;
  return <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Xóa tạm & khôi phục thành viên</h2><button className="min-h-11 px-3 text-sky-700" disabled={busy} onClick={()=>void load()}>Làm mới</button></div><p className="text-sm text-slate-600">Chỉ admin được duyệt. Hồ sơ và lịch sử được giữ lại để khôi phục.</p>{error&&<p role="alert" className="text-rose-700">{error}</p>}{decision&&<div role="dialog" aria-label="Xác nhận xử lý thành viên" className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="font-semibold">{decision.action==="approve"?"Duyệt xóa tạm":decision.action==="restore"?"Khôi phục":"Từ chối đề nghị"}: {decision.row.memberName}</p>{decision.action==="reject"&&<label className="block text-sm">Lý do từ chối<textarea className="mt-1 w-full rounded-lg border bg-white p-3" maxLength={1000} value={reviewReason} onChange={e=>setReviewReason(e.target.value)}/></label>}<div className="flex gap-3"><button disabled={busy||(decision.action==="reject"&&!reviewReason.trim())} onClick={()=>void review(decision.row,decision.action)} className="min-h-11 rounded-lg bg-sky-600 px-4 text-white disabled:opacity-50">{busy?"Đang xử lý…":"Xác nhận"}</button><button disabled={busy} onClick={()=>setDecision(null)} className="min-h-11 px-3">Hủy</button></div></div>}{loading?<p>Đang tải…</p>:!rows.length?<p className="text-sm text-slate-500">Chưa có đề nghị xóa tạm.</p>:rows.map(row=><article key={row.id} className="space-y-2 rounded-xl border p-3"><strong>{row.memberName}</strong><p className="text-sm">{row.studentId} · Tổ {row.accessGroup}</p><p className="text-sm">Người gửi: <strong>{row.submittedBy}</strong></p><p className="break-words text-sm">Lý do: {row.reason}</p><p className="text-sm font-semibold">{{pending:"Chờ admin duyệt",approved:"Đã xóa tạm",rejected:"Đã từ chối",restored:"Đã khôi phục"}[row.status]||row.status}</p>{row.reviewReason&&<p className="text-sm">Phản hồi: {row.reviewReason}</p>}{admin&&<div className="flex flex-wrap gap-2">{row.status==="pending"?<><button disabled={busy} onClick={()=>{setReviewReason("");setDecision({row,action:"approve"});}} className="min-h-11 rounded-lg bg-rose-600 px-4 text-white">Duyệt xóa tạm</button><button disabled={busy} onClick={()=>{setReviewReason("");setDecision({row,action:"reject"});}} className="min-h-11 rounded-lg border px-4">Từ chối</button></>:row.status==="approved"?<button disabled={busy} onClick={()=>{setReviewReason("");setDecision({row,action:"restore"});}} className="min-h-11 rounded-lg bg-sky-600 px-4 text-white">Khôi phục thành viên</button>:null}</div>}</article>)}</section>;
}
