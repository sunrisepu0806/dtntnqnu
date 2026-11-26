"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import type { ActivitySession } from "@/lib/activity-model";
import { vietnamDay } from "@/lib/attendance-day";
import { searchKey } from "@/lib/search-text";
import AdminWorkspace from "../AdminWorkspace";
import workspace from "../overview.module.css";
import AttendanceSections from "./AttendanceSections";
import styles from "./attendance.module.css";

type Activity = { id: string; name: string; sessions: ActivitySession[] };
type Filter = "today" | "all";

function dateLabel(date: string) {
  return date ? date.split("-").reverse().join("/") : "Chưa có ngày";
}

export default function AttendanceHome() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [preferredFilter, setPreferredFilter] = useState<Filter | null>(null);
  const [activityId, setActivityId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const activityPanel = useRef<HTMLElement>(null);
  const sessionPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/attendance/activities?flow=group", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Không tải được danh sách hoạt động.");
        if (!controller.signal.aborted) setActivities(data.activities);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không tải được danh sách hoạt động.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/attendance/requests?status=pending&countOnly=true", { signal: controller.signal })
      .then(async response => {
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted) setPending(data.count);
        }
      }).catch(() => { /* The approval link is also available without a count. */ });
    return () => controller.abort();
  }, []);

  const today = vietnamDay(new Date());
  const hasSessionToday = (activity: Activity) => activity.sessions.some(session => session.date === today);
  const filter = preferredFilter ?? (activities.some(hasSessionToday) ? "today" : "all");
  const query = searchKey(search);
  const visible = activities.filter(activity => (filter === "all" || hasSessionToday(activity)) && searchKey(activity.name).includes(query));
  const chosen = visible.find(activity => activity.id === activityId);
  const session = chosen?.sessions.find(item => item.id === sessionId);

  function clearSelection() {
    setActivityId("");
    setSessionId("");
  }

  function changeSearch(value: string) {
    setSearch(value);
    if (chosen && !searchKey(chosen.name).includes(searchKey(value))) clearSelection();
  }

  function changeFilter(value: Filter) {
    setPreferredFilter(value);
    if (value === "today" && chosen && !hasSessionToday(chosen)) clearSelection();
  }

  function chooseActivity(id: string) {
    if (id !== activityId) setSessionId("");
    setActivityId(id);
    if (window.matchMedia("(max-width: 760px)").matches) {
      requestAnimationFrame(() => {
        sessionPanel.current?.focus({ preventScroll: true });
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        sessionPanel.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "instant" : "smooth" });
      });
    }
  }

  return (
    <AdminWorkspace search={search} onSearch={changeSearch} searchLabel="Tìm hoạt động"
      onSearchSubmit={() => activityPanel.current?.focus()} attendanceLabel="Chọn ca điểm danh">
      <header className={workspace.titleRow}>
        <h1>Điểm danh</h1>
      </header>
      <AttendanceSections active="activity" pending={pending} />

      <div className={styles.choices}>
        <section ref={activityPanel} id="chon-hoat-dong" tabIndex={-1} className={styles.step} aria-labelledby="activity-title">
          <div className={styles.stepHeading}>
            <h2 id="activity-title"><span className={styles.stepNumber}>1</span>Chọn hoạt động</h2>
            {!loading && !error && <span>{activities.length} đang mở</span>}
          </div>
          <div className={styles.filters} role="group" aria-label="Lọc hoạt động">
            <button type="button" aria-pressed={filter === "today"} onClick={() => changeFilter("today")}>Hôm nay</button>
            <button type="button" aria-pressed={filter === "all"} onClick={() => changeFilter("all")}>Tất cả đang mở</button>
          </div>
          {loading ? <p className={styles.empty} role="status">Đang tải hoạt động…</p> : error ? (
            <div className={styles.empty} role="alert"><p>{error}</p>
              <button type="button" className={styles.textButton} onClick={() => {
                setError(""); setLoading(true); setRevision(value => value + 1);
              }}>Thử lại</button>
            </div>
          ) : visible.length ? (
            <div className={styles.list} role="group" aria-label="Các hoạt động đang mở">
              {visible.map(activity => (
                <button key={activity.id} type="button" aria-pressed={chosen?.id === activity.id} onClick={() => chooseActivity(activity.id)}>
                  <span className={styles.rowIcon}><WorkspaceIcon name="calendar" /></span>
                  <span className={styles.rowText}><strong>{activity.name}</strong>
                    <small>{activity.sessions.length} ca{hasSessionToday(activity) && " · Có ca hôm nay"}</small>
                  </span>
                  <WorkspaceIcon name="next" />
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.empty} role="status">
              <p>{query ? "Không tìm thấy hoạt động phù hợp." : filter === "today" ? "Hôm nay chưa có ca điểm danh." : "Chưa có hoạt động đang mở."}</p>
              {query && <button type="button" className={styles.textButton} onClick={() => changeSearch("")}>Xóa tìm kiếm</button>}
              {filter === "today" && <button type="button" className={styles.textButton} onClick={() => changeFilter("all")}>Xem tất cả đang mở</button>}
              {!query && filter === "all" && <Link href="/admin/diem-danh/hoat-dong" className={styles.textButton}>Tạo hoạt động</Link>}
            </div>
          )}
        </section>

        <section ref={sessionPanel} tabIndex={-1} className={styles.step} aria-labelledby="session-title">
          <div className={styles.stepHeading}><h2 id="session-title"><span className={styles.stepNumber}>2</span>Chọn ca</h2></div>
          {!chosen ? <p className={styles.empty}>Chọn một hoạt động để xem các ca điểm danh.</p> : <>
            <p className={styles.selectedName}>{chosen.name}</p>
            {chosen.sessions.length ? <div className={styles.list} role="group" aria-label="Các ca của hoạt động">
              {chosen.sessions.map(item => (
                <button key={item.id} type="button" aria-pressed={session?.id === item.id} onClick={() => setSessionId(item.id)}>
                  <span className={styles.radioDot} aria-hidden="true" />
                  <span className={styles.rowText}><strong>{item.name}</strong><small>{dateLabel(item.date)}{item.date === today && " · Hôm nay"}</small></span>
                </button>
              ))}
            </div> : <p className={styles.empty}>Hoạt động chưa có ca. <Link className={styles.textButton} href="/admin/diem-danh/hoat-dong">Quản lý hoạt động</Link></p>}
            {session ? (
              <Link className={styles.continueButton} href={{ pathname: "/admin/diem-danh/quet-ma", query: { activityId: chosen.id, sessionId: session.id } }}>
                Tiếp tục điểm danh <WorkspaceIcon name="next" />
              </Link>
            ) : <button type="button" className={styles.continueButton} disabled>Tiếp tục điểm danh <WorkspaceIcon name="next" /></button>}
          </>}
        </section>
      </div>
    </AdminWorkspace>
  );
}
