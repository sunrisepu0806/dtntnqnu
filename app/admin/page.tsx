"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { attendanceReviewPath } from "@/lib/permissions";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

import { attendanceDay, vietnamDay } from "@/lib/attendance-day";
import type { ActivitySession } from "@/lib/activity-model";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import AdminWorkspace from "./AdminWorkspace";
import { searchKey } from "@/lib/search-text";
import styles from "./overview.module.css";

const pageSize = 10;
const periods = [["all", "Tất cả thời gian"], ["this_month", "Tháng này"], ["last_month", "Tháng trước"]] as const;
type Period = (typeof periods)[number][0];

type OverviewActivity = {
  date?: string;
  sessions?: ActivitySession[];
};

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  group: string;
  department: string;
}

interface AttendanceRecord {
  studentId: string;
  activityId?: string;
  sessionId?: string;
  sessionDate?: string;
  timestamp?: unknown;
  createdAt?: unknown;
  date?: unknown;
  points: number;
}

function TeamAvatar({ tone }: { tone: number }) {
  return <i className={styles.teamAvatar} data-tone={tone} aria-hidden="true" />;
}

export default function AdminDashboardTongQuan() {
  const [members, setMembers] = useState<Member[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [departmentTasks, setDepartmentTasks] = useState<AttendanceRecord[]>([]);
  const [activities, setActivities] = useState(new Map<string, OverviewActivity>());
  const [calendarReady, setCalendarReady] = useState(false);
  const [ledgerState, setLedgerState] = useState<Partial<Record<string, "ready" | "error">>>({});
  const totalEvents = activities.size;
  const [loading, setLoading] = useState(true);

  // BỘ LỌC THỜI GIAN & TỔ
  const [filterTime, setFilterTime] = useState<Period>("all");
  const [page, setPage] = useState(0);
  const [flow,setFlow] = useState("group");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [listView, setListView] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const rowDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // 1. Tải danh sách thành viên
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = [];
      snap.docs.filter(d=>d.data().archived!==true).forEach((d) => {
        const data = d.data();
        const rawGroup = String(data.to || data.to_id || data.group || "").trim();
        const matchTo = rawGroup.match(/[1-5]/);

        let dept = "Chưa xếp ban";
        if (Array.isArray(data.ban_id)) {
          dept = data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        } else if (data.department || data.ban) {
          const rawDept = String(data.department || data.ban).toLowerCase();
          dept = rawDept.includes("truyền thông") ? "Truyền thông" : rawDept.includes("sự kiện") ? "Sự kiện" : "Chưa xếp ban";
        }

        list.push({
          id: d.id,
          fullName: data.name || data.fullName || data.hoTen || "Thành viên",
          studentId: String(data.mssv || data.studentId || d.id).trim(),
          group: matchTo ? matchTo[0] : "",
          department: dept,
        });
      });

      setMembers(list);
      setLoading(false);
    });

    const unsubEvents = onSnapshot(collection(db, "activities"), (snap) => {
      setActivities(new Map(snap.docs.map(doc => [doc.id, doc.data()])));
      setCalendarReady(true);
    });

    return () => {
      unsubUsers();

      unsubEvents();

    };
  }, []);

  useEffect(() => {
    // Only subscribe to the ledger currently displayed.
    const unsubAtt = flow === "group" ? onSnapshot(collection(db, "attendance"), (snap) => {
      const list: AttendanceRecord[] = [];
      snap.docs.filter(d=>d.data().archived!==true).forEach((d) => {
        const data = d.data();
        list.push({
          studentId: String(data.studentId || data.mssv || "").trim().toLowerCase(),
          activityId: data.activityId, sessionId: data.sessionId, sessionDate: data.sessionDate,
          date: data.date, timestamp: data.timestamp, createdAt: data.createdAt,
          points: 1,
        });
      });
      setAttendances(list);
      setLedgerState(state => ({ ...state, group: "ready" }));
    }, () => setLedgerState(state => ({ ...state, group: "error" }))) : () => {};

    // 3. Tải danh sách sự kiện
    const unsubTasks = flow === "department" ? onSnapshot(collection(db, "department_tasks"), (snap) => {
      setDepartmentTasks(snap.docs.filter(d=>d.data().archived!==true).map((document) => {
        const data = document.data();
        return { studentId: String(data.studentId || data.mssv || "").trim().toLowerCase(),
          activityId: data.activityId, sessionId: data.sessionId, sessionDate: data.sessionDate,
          date: data.date, timestamp: data.timestamp, createdAt: data.createdAt, points: Number(data.pointsAdded || 0) };
      }));
      setLedgerState(state => ({ ...state, department: "ready" }));
    }, () => setLedgerState(state => ({ ...state, department: "error" }))) : () => {};

    return () => { unsubAtt(); unsubTasks(); };
  }, [flow]);
  const attendanceFilteredMap = useMemo(() => {
    const map: Record<string, number> = {};
    const currentMonth = vietnamDay(new Date()).slice(0, 7);
    const [year, month] = currentMonth.split("-").map(Number);
    const previousMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    const selectedMonth = filterTime === "last_month" ? previousMonth : currentMonth;
    for (const record of flow === "group" ? attendances : departmentTasks) {
      if (!record.studentId) continue;
      if (filterTime !== "all" && attendanceDay(record, activities.get(record.activityId || "")).slice(0, 7) !== selectedMonth) continue;
      map[record.studentId] = (map[record.studentId] || 0) + record.points;
    }
    return map;
  }, [activities, attendances, departmentTasks, filterTime, flow]);

  // SỐ LIỆU TỔNG QUAN
  const tongSoThanhVien = members.length;
  // DỮ LIỆU BIỂU ĐỒ BAN CHUYÊN MÔN
  const soSuKien = members.filter((m) => m.department === "Sự kiện").length;
  const soTruyenThong = members.filter((m) => m.department === "Truyền thông").length;

  const pctSuKien = tongSoThanhVien > 0 ? (soSuKien / tongSoThanhVien) * 100 : 0;
  const pctTruyenThong = tongSoThanhVien > 0 ? (soTruyenThong / tongSoThanhVien) * 100 : 0;

  // BẢNG XẾP HẠNG AN TOÀN
  const bxhHienThi = useMemo(() => {
    return members
      .filter(member => filterGroup === "all" || member.group === filterGroup)
      .map(member => ({ ...member, diemThiDua: attendanceFilteredMap[member.studentId.toLowerCase()] || 0 }))
      .sort((a, b) => b.diemThiDua - a.diemThiDua)
      // Equal counts share a rank (1, 2, 2, 4); members with no sessions are not ranked.
      .map((member, index, list) => {
        let first = index;
        while (first > 0 && list[first - 1].diemThiDua === member.diemThiDua) first--;
        return { ...member, rank: member.diemThiDua > 0 ? first + 1 : null };
      });
  }, [members, attendanceFilteredMap, filterGroup]);

  const results = useMemo(() => {
    const key = searchKey(search);
    return key ? bxhHienThi.filter(member => searchKey(member.fullName).includes(key) || member.studentId.toLowerCase().includes(key)) : bxhHienThi;
  }, [bxhHienThi, search]);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const start = Math.min(page, pageCount - 1) * pageSize;
  const rows = results.slice(start, start + pageSize);
  const isGroup = flow === "group";
  const ledgerReady = ledgerState[flow] === "ready" && (filterTime === "all" || calendarReady);
  const departments = [
    { label: "Sự kiện", count: soSuKien, percent: pctSuKien },
    { label: "Truyền thông", count: soTruyenThong, percent: pctTruyenThong },
  ];
  const attendanceHref = isGroup ? "/admin/diem-danh" : "/admin/diem-danh/truong-ban";
  const attendanceLabel = isGroup ? "Chọn ca điểm danh" : "Mở điểm danh mảng";
  const folders = [
    { href: attendanceHref, label: "Theo tổ", title: attendanceLabel, meta: calendarReady ? totalEvents + " hoạt động" : "Điểm danh", tones: [1, 2, 3, 4, 5] },
    { href: attendanceReviewPath, label: "Phụ trách", title: "Duyệt đề nghị", meta: "Điểm danh", tones: [3, 1, 2] },
    { href: "/admin/thanh-vien", label: "Toàn đội", title: "Hồ sơ thành viên", meta: loading ? "Nhân sự" : tongSoThanhVien + " thành viên", tones: [5, 4, 2, 1] },
  ];

  return (
    <AdminWorkspace search={search} onSearch={value => { setSearch(value); setPage(0); }}
      searchLabel="Tìm thành viên theo tên hoặc MSSV" onSearchSubmit={() => document.getElementById("overview-ranking")?.focus()}
      attendanceHref={attendanceHref} attendanceLabel={attendanceLabel} departments={departments} memberCount={loading ? null : tongSoThanhVien}>
      <div className={styles.titleRow}>
        <h1>Tổng quan đội</h1>
        <div className={styles.titleTools}>
          <button type="button" aria-label="Dạng danh sách cho truy cập nhanh" aria-pressed={listView}
            title="Đổi cách hiển thị truy cập nhanh" onClick={() => setListView(!listView)}><WorkspaceIcon name={listView ? "list" : "grid"} /></button>
        </div>
      </div>

      <section className={styles.quickAccess} aria-labelledby="overview-quick">
        <div className={styles.sectionHeading}>
          <h2 id="overview-quick">Truy cập nhanh</h2>
          <Link href="/admin/quan-ly" aria-label="Mở quản lý đội" title="Mở quản lý đội"><WorkspaceIcon name="next" /></Link>
        </div>
        <div className={styles.shelf} data-list={listView}>
          {folders.map(folder => (
            <Link href={folder.href} key={folder.href} className={styles.folder}>
              <span className={styles.cardLabel}>{folder.label}</span>
              <span className={styles.avatars} aria-hidden="true">{folder.tones.map(tone => <TeamAvatar key={tone} tone={tone} />)}</span>
              <span className={styles.cardFoot}><small>{folder.meta}</small><strong>{folder.title}</strong></span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.leaderboard} aria-labelledby="overview-ranking">
        <div className={styles.boardToolbar}>
          <h2 id="overview-ranking" tabIndex={-1}>Bảng xếp hạng</h2>
          <div className={styles.filters}>
            <div role="group" className={styles.flow} aria-label="Luồng điểm danh">
              {([["group", "Hoạt động"], ["department", "Mảng"]] as const).map(([key, label]) => (
                <button type="button" key={key} aria-label={key === "group" ? "Điểm danh hoạt động" : "Điểm danh mảng"}
                  aria-pressed={flow === key} onClick={() => { setFlow(key); setPage(0); }}>{label}</button>
              ))}
            </div>
            <select aria-label="Thời gian thống kê" value={filterTime} onChange={event => { setFilterTime(event.target.value as Period); setPage(0); }}>
              {periods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select aria-label="Lọc theo tổ" value={filterGroup} onChange={event => { setFilterGroup(event.target.value); setPage(0); }}>
              <option value="all">Toàn đội</option>
              {["1", "2", "3", "4", "5"].map(toNum => <option key={toNum} value={toNum}>Tổ {toNum}</option>)}
            </select>
          </div>
        </div>
        {ledgerReady && results.length > 0 && results.every(member => member.rank === null) &&
          <p className={styles.boardNotice} role="status">Chưa có ai được ghi nhận buổi điểm danh trong khoảng thời gian này, nên chưa xếp hạng.</p>}
        <table className={styles.ranking} aria-labelledby="overview-ranking">
          <thead><tr>
            <th colSpan={2} scope="colgroup">Thành viên</th><th className={styles.unitCol} scope="col">Tổ / Ban</th>
            <th className={styles.idCol} scope="col">Mã sinh viên</th><th scope="col">Số buổi</th><th scope="col"><span className={styles.srOnly}>Thao tác</span></th>
          </tr></thead>
          <tbody>
            {ledgerReady && rows.map(member => {
              const profileHref = "/admin/thanh-vien?member=" + encodeURIComponent(member.id);
              const tone = Number(member.group) || 1;
              return (
                <tr key={member.id}>
                  <td className={styles.rankCell}>{member.rank === null
                    ? <span className={styles.rankNone} title="Chưa có buổi điểm danh">–</span>
                    : <span className={styles.rankNumber} data-tone={tone} title={"Hạng " + member.rank}>{member.rank}</span>}</td>
                  <td className={styles.nameCell}>
                    <Link href={profileHref} prefetch={false}>{member.fullName}</Link>
                    <small>{[member.studentId, member.group && "Tổ " + member.group].filter(Boolean).join(" · ")}</small>
                  </td>
                  <td className={styles.unitCol}><span className={styles.unit}><TeamAvatar tone={tone} /><span>{member.group ? "Tổ " + member.group : "Chưa xếp tổ"}<small>{member.department}</small></span></span></td>
                  <td className={styles.idCol}>{member.studentId}</td>
                  <td>{member.diemThiDua}</td>
                  <td><div className={styles.rowActions}>
                    <Link href={profileHref} prefetch={false} aria-label={"Mở hồ sơ " + member.fullName} title="Mở hồ sơ"><WorkspaceIcon name="link" /></Link>
                    <button type="button" aria-label={"Tùy chọn cho " + member.fullName} title="Tùy chọn thành viên" onClick={() => {
                      setDetailMember(member);
                      rowDialog.current?.showModal();
                    }}><WorkspaceIcon name="more" /></button>
                  </div></td>
                </tr>
              );
            })}
            {(!ledgerReady || rows.length === 0) && <tr><td colSpan={6} className={styles.empty}>
              {ledgerState[flow] === "error" ? "Không tải được số buổi điểm danh." : loading || !ledgerReady ? "Đang tải bảng xếp hạng…" : search ? "Không tìm thấy thành viên phù hợp." : "Chưa có thành viên trong danh sách này."}
            </td></tr>}
          </tbody>
        </table>
        {ledgerReady && <div className={styles.pagination}>
          <span aria-live="polite">{results.length ? (start + 1) + "–" + (start + rows.length) + " / " + results.length : "0 thành viên"}</span>
          {pageCount > 1 && <>
            <button type="button" disabled={start === 0} onClick={() => setPage(start / pageSize - 1)}>Trước</button>
            <button type="button" disabled={start / pageSize + 1 >= pageCount} onClick={() => setPage(start / pageSize + 1)}>Sau</button>
          </>}
        </div>}
      </section>

      <p className={styles.note}>Số buổi tính từ lượt đã ghi nhận. Đề nghị chờ duyệt, lượt đã lưu trữ và số dư nhập cũ được theo dõi riêng.</p>

      <dialog ref={rowDialog} className={styles.dialog} aria-labelledby="overview-member-heading"
        onClick={event => { if (event.target === event.currentTarget) rowDialog.current?.close(); }}>
        {detailMember && <div>
          <div className={styles.dialogHeading}><h2 id="overview-member-heading">{detailMember.fullName}</h2>
            <button type="button" aria-label="Đóng" onClick={() => rowDialog.current?.close()}><WorkspaceIcon name="close" /></button>
          </div>
          <p className={styles.memberMeta}>{[detailMember.studentId, detailMember.group && "Tổ " + detailMember.group, detailMember.department].filter(Boolean).join(" · ")}</p>
          <Link className={styles.dialogAction} href={"/admin/thanh-vien?member=" + encodeURIComponent(detailMember.id)} prefetch={false}>Xem hồ sơ</Link>
          {detailMember.group && <button type="button" className={styles.dialogSecondary} onClick={() => {
            setFilterGroup(detailMember.group);
            setSearch("");
            setPage(0);
            rowDialog.current?.close();
          }}>Xem bảng xếp hạng Tổ {detailMember.group}</button>}
        </div>}
      </dialog>
    </AdminWorkspace>
  );
}
