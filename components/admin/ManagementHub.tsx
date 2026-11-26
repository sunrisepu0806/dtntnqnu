"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { attendanceRequestsPath } from "@/lib/permissions";
import MemberTransfers from "@/components/admin/MemberTransfer";
import { useAdminUser } from "@/components/admin/FirebaseSessionGate";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import AdminWorkspace from "@/app/admin/AdminWorkspace";
import workspace from "@/app/admin/overview.module.css";
import styles from "@/app/admin/quan-ly/management.module.css";
import { searchKey } from "@/lib/search-text";
import { splitReport, summarizeReport, type ReportEntry } from "@/lib/monthly-report";

type Summary={admin:boolean;mssv:string;attendance:number;batches:number;removals:number;transfers:number};
type Report={month:string;records:number;members:number;points:number;groups:{group:string;department:string;records:number;members:number;points:number}[];entries:ReportEntry[]};
type Log={flow?:string;sessionDate?:string;sessionName?:string;activityId?:string;id:string;time:number;action:string;actorName:string;memberName?:string;reason?:string;points?:number;description?:string;fromGroup?:string;toGroup?:string;fromDepartment?:string;toDepartment?:string};
const labels:Record<string,string>={"attendance.archive":"Lưu trữ lượt điểm danh","attendance.restore":"Khôi phục lượt điểm danh","activity.session.create":"Thêm buổi hoạt động","attendance.request":"Gửi điểm danh","attendance.record":"Ghi nhận điểm danh","attendance.approve":"Duyệt điểm danh","attendance.reject":"Từ chối điểm danh","attendance.remove":"Xóa lượt điểm danh","member.removal.request":"Đề nghị xóa tạm","member.archive":"Duyệt xóa tạm","member.removal.reject":"Từ chối xóa tạm","member.restore":"Khôi phục thành viên","member.transfer.request":"Đề nghị chuyển đơn vị","member.transfer.approve":"Duyệt chuyển đơn vị","member.transfer.reject":"Từ chối chuyển đơn vị"};
const ban=(value:string)=>value==="su-kien"?"Sự kiện":value==="truyen-thong"?"Truyền thông":"Chưa xếp ban";
const sections = [
  { id: "work", label: "Việc cần xử lý", icon: "approval", adminOnly: false },
  { id: "transfer", label: "Chuyển tổ / ban", icon: "team", adminOnly: false },
  { id: "history", label: "Lịch sử thao tác", icon: "history", adminOnly: true },
  { id: "report", label: "Báo cáo tháng", icon: "file", adminOnly: true },
] as const;
type Section = (typeof sections)[number]["id"];
async function get(url:string,signal?:AbortSignal){const r=await fetch(url,{cache:"no-store",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
export default function ManagementHub(){
  const user = useAdminUser();
  const isAdmin = user?.role === "Quản trị viên";
  const canViewRemovals = isAdmin || user?.role === "Tổ trưởng";
  const [search, setSearch] = useState("");
  const sectionContent = useRef<HTMLDivElement>(null);
  const visibleSections = sections.filter(item => (!item.adminOnly || isAdmin) && searchKey(item.label).includes(searchKey(search)));
  const [basis,setBasis]=useState("recorded");
  const [tab,setTab]=useState<Section>("work"),[summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0),[logs,setLogs]=useState<Log[]>([]),[report,setReport]=useState<Report|null>(null),[exporting,setExporting]=useState(false);
  const [month,setMonth]=useState(()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit"}).format(new Date())),[group,setGroup]=useState(""),[department,setDepartment]=useState("");
  const [failures,setFailures]=useState<{id:string;count:number;path:string;time:number}[]>([]);
  useEffect(()=>{
    // Batch resource initialization after commit and cancel stale route setup.
    let dispose: void | (() => void);
    const setup = setTimeout(() => { dispose = (() => {
    const c=new AbortController();setLoading(true);setError("");
    async function load(){try{
      if(tab==="work")setSummary(await get("/api/management",c.signal));
      if(tab==="history")setLogs((await get("/api/management?mode=history",c.signal)).rows);
      if(tab==="report"){setReport(null);setReport(await get(`/api/management?mode=report&month=${encodeURIComponent(month)}&basis=${basis}&group=${encodeURIComponent(group)}&department=${encodeURIComponent(department)}`,c.signal));}
    }catch(e){if(!c.signal.aborted)setError(e instanceof Error && !["AbortError","TimeoutError"].includes(e.name)?e.message:"Kết nối đang chậm. Bấm Làm mới để tải lại dữ liệu của tab này.");}finally{if(!c.signal.aborted)setLoading(false);}}
    void load();return()=>c.abort();

    })(); }, 0);
    return () => { clearTimeout(setup); dispose?.(); };
  },[tab,revision,month,group,department,basis]);
  useEffect(()=>{
    if(!summary)return;
    const load=()=>{try{const saved=JSON.parse(localStorage.getItem(`attendance-send-status:${summary.mssv}`)||"{}");setFailures(Object.entries(saved).map(([id,value])=>({id,...value as {count:number;path:string;time:number}})).filter(v=>v.count>0&&v.path.startsWith("/admin/diem-danh/")));}catch{setFailures([]);}};
    load();window.addEventListener("storage",load);window.addEventListener("attendance-send-status-changed",load);return()=>{window.removeEventListener("storage",load);window.removeEventListener("attendance-send-status-changed",load);};
  },[summary]);
  async function exportExcel(){if(!report||exporting||loading)return;setExporting(true);try{
    const {attendanceWorkbook}=await import("@/lib/attendance-workbook");
    const book=await attendanceWorkbook(report.month,report.entries,basis);
    const buffer=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=`Bao-cao-${report.month}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(e instanceof Error?e.message:"Không xuất được báo cáo.");}finally{setExporting(false);}}
  const reportTotals = useMemo(() => {
    if (!report) return [];
    const entries = splitReport(report.entries);
    return (["group", "department"] as const).map(flow => ({
      flow, label: flow === "group" ? "Điểm danh hoạt động" : "Điểm danh mảng", ...summarizeReport(entries[flow]),
    }));
  }, [report]);

  function openSection(section: Section) {
    setTab(section);
    setSearch("");
  }

  function reconcile(id: string) {
    if (!summary) return;
    try {
      const key = "attendance-send-status:" + summary.mssv;
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      delete saved[id];
      localStorage.setItem(key, JSON.stringify(saved));
      setFailures(previous => previous.filter(item => item.id !== id));
    } catch {
      setError("Không cập nhật được trạng thái trên thiết bị.");
    }
  }

  return (
    <AdminWorkspace search={search} onSearch={setSearch} searchLabel="Tìm chức năng quản lý đội"
      attendanceLabel={isAdmin ? "Chọn ca điểm danh" : "Mở điểm danh"}
      onSearchSubmit={() => {
        if (visibleSections.length && search.trim()) {
          openSection(visibleSections[0].id);
          sectionContent.current?.focus();
        }
      }}>
      <div className={workspace.titleRow}>
        <h1>Quản lý đội</h1>
        {tab !== "transfer" && <button type="button" className={styles.refresh} disabled={loading}
          onClick={() => setRevision(value => value + 1)}><WorkspaceIcon name="refresh" />Làm mới</button>}
      </div>
      <section className={workspace.quickAccess} aria-labelledby="management-shortcuts">
        <div className={workspace.sectionHeading}><h2 id="management-shortcuts">Truy cập nhanh</h2></div>
        <nav className={styles.folderNav} aria-label="Chức năng quản lý đội">
          {visibleSections.map(item => (
            <button type="button" className={workspace.folder + " " + styles.sectionButton} key={item.id}
              aria-pressed={tab === item.id} aria-controls="management-panel" onClick={() => openSection(item.id)}>
              <span className={styles.sectionIcon} data-section={item.id}><WorkspaceIcon name={item.icon} /></span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>
        {!visibleSections.length && <p className={styles.hint} role="status">Không tìm thấy chức năng phù hợp.</p>}
      </section>

      <div id="management-panel" className={styles.panel} ref={sectionContent} tabIndex={-1}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {tab !== "transfer" && loading && <p role="status" className={styles.hint}>Đang tải…</p>}

        {tab === "work" && summary && <>
          <div className={workspace.sectionHeading}><h2>{summary.admin ? "Đề nghị chờ xử lý" : "Đề nghị tôi đã gửi"}</h2></div>
          <ul className={styles.workList}>
            <li><Link href={attendanceRequestsPath(user?.role)}>
              <span className={styles.workIcon}><WorkspaceIcon name="calendar" /></span>
              <span className={styles.workTitle}><strong>Điểm danh</strong><small>{summary.attendance} lượt chờ duyệt</small></span>
              <b>{summary.batches} đợt</b><WorkspaceIcon name="next" />
            </Link></li>
            {canViewRemovals && <li><Link href="/admin/duyet-diem-danh?tab=removal">
              <span className={styles.workIcon}><WorkspaceIcon name="member" /></span>
              <span className={styles.workTitle}><strong>Lưu trữ thành viên</strong><small>Đề nghị xóa tạm</small></span>
              <b>{summary.removals} đề nghị</b><WorkspaceIcon name="next" />
            </Link></li>}
            <li><button type="button" onClick={() => openSection("transfer")}>
              <span className={styles.workIcon}><WorkspaceIcon name="team" /></span>
              <span className={styles.workTitle}><strong>Chuyển tổ / ban</strong><small>Đề nghị đổi đơn vị</small></span>
              <b>{summary.transfers} đề nghị</b><WorkspaceIcon name="next" />
            </button></li>
          </ul>
          <details className={styles.disclosure} open={failures.length > 0}>
            <summary>Lượt gửi chưa xác nhận trên thiết bị <small>{failures.length} đợt</small></summary>
            <p>Danh sách lỗi gửi MSSV của tài khoản này trên trình duyệt hiện tại. Hãy đối chiếu với các đề nghị chờ duyệt trước khi gửi lại. Đóng trang sẽ kết thúc hàng đợi gửi.</p>
            {!failures.length ? <p>Chưa ghi nhận lượt gửi lỗi trên thiết bị này.</p> : failures.map(item => (
              <div className={styles.failure} key={item.id}>
                <Link href={item.path}>Đợt {item.id.slice(0, 8)} · {item.count} lượt chưa xác nhận</Link>
                <small>{new Date(item.time).toLocaleString("vi-VN")}</small>
                <button type="button" onClick={() => reconcile(item.id)}>Đã đối soát</button>
              </div>
            ))}
          </details>
        </>}

        {tab === "transfer" && <div className={styles.transfer}><MemberTransfers /></div>}

        {tab === "history" && isAdmin && <>
          <div className={workspace.sectionHeading}><h2>Lịch sử thao tác</h2></div>
          <p className={styles.hint}>Tối đa 200 thao tác điểm danh, chuyển đơn vị và xóa tạm được ghi nhận trên web.</p>
          {!loading && !error && !logs.length && <p className={styles.hint}>Chưa có lịch sử được ghi nhận.</p>}
          {logs.map(log => <details key={log.id} className={styles.disclosure}>
            <summary>{labels[log.action] || log.action}<small>{log.actorName} · {new Date(log.time).toLocaleDateString("vi-VN")}</small></summary>
            {log.flow && <p>{log.flow === "group" ? "Hoạt động" : "Mảng"} · {log.activityId} · {log.sessionDate} · {log.sessionName}</p>}
            <p>Người thực hiện · {log.actorName} · {new Date(log.time).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
            {(log.memberName || typeof log.points === "number") && <p>{log.memberName}{typeof log.points === "number" && " · " + (log.points > 0 ? "+" : "") + log.points + " buổi"}</p>}
            {log.toGroup && <p>Tổ {log.fromGroup} / {ban(log.fromDepartment || "")} → Tổ {log.toGroup} / {ban(log.toDepartment || "")}</p>}
            {(log.reason || log.description) && <p>{log.reason || log.description}</p>}
          </details>)}
        </>}

        {tab === "report" && isAdmin && <>
          <div className={workspace.sectionHeading}><h2>Báo cáo tháng</h2></div>
          <div className={styles.reportFilters}>
            <div><label htmlFor="management-basis">Cách thống kê</label><select id="management-basis" value={basis} onChange={event => setBasis(event.target.value)}>
              <option value="recorded">Theo tháng ghi nhận / duyệt</option><option value="participation">Theo tháng tham gia</option>
            </select></div>
            <div><label htmlFor="management-month">Tháng</label><input id="management-month" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div>
            <div><label htmlFor="management-group">Tổ</label><select id="management-group" value={group} onChange={event => setGroup(event.target.value)}>
              <option value="">Tất cả tổ</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Tổ {n}</option>)}
            </select></div>
            <div><label htmlFor="management-department">Ban</label><select id="management-department" value={department} onChange={event => setDepartment(event.target.value)}>
              <option value="">Tất cả ban</option><option value="su-kien">Sự kiện</option><option value="truyen-thong">Truyền thông</option>
            </select></div>
          </div>
          {report && !loading && <>
            <div className={styles.reportTotals}>{reportTotals.map(total => (
              <article key={total.flow}><strong>{total.label}</strong><p>{total.members} người · {total.records} lượt · {total.points} buổi</p></article>
            ))}</div>
            {!report.records && <p className={styles.hint}>Không có lượt ghi nhận trong tháng và bộ lọc này.</p>}
            <button type="button" className={styles.export} disabled={exporting} onClick={() => void exportExcel()}>
              <WorkspaceIcon name="export" />{exporting ? "Đang xuất…" : "Xuất Excel báo cáo tháng"}
            </button>
          </>}
          <details className={styles.disclosure}>
            <summary>Cách đọc báo cáo</summary>
            <p>Tháng tham gia tính theo ngày của buổi điểm danh. Bản ghi cũ thiếu ngày buổi cần đối soát riêng. Báo cáo chỉ tính lượt đã ghi nhận hoặc đã duyệt.</p>
            <p>File Excel có hai trang tính. Bộ lọc tổ áp dụng cho điểm danh hoạt động, bộ lọc ban áp dụng cho điểm danh mảng. Bản ghi cũ giữ thông tin trong sổ gốc.</p>
          </details>
        </>}
      </div>
    </AdminWorkspace>
  );
}
