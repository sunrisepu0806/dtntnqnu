"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  collection,
  query,
  where,
  addDoc,
  serverTimestamp,
  onSnapshot,
  doc,
  updateDoc,
  increment,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Activity {
  id: string;
  name: string;
  password?: string;
  points: number;
  isActive?: boolean;
}

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  department?: string;
  group?: string;
  specialty?: string;
}

interface RecentCheckinItem {
  id: string;
  fullName: string;
  studentId: string;
  scannerName: string;
  scannerMssv: string;
  timestamp?: Timestamp | null;
}

export default function TrangQuetDiemDanh() {
  const [activeActivities, setActiveActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [currentActivity, setCurrentActivity] = useState<Activity | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [currentUser, setCurrentUser] = useState<{
    mssv: string;
    role: string;
    name: string;
  }>({
    mssv: "4751180032",
    role: "Quản trị viên",
    name: "Ban cán sự",
  });

  const [scanStep, setScanStep] = useState<"idle" | "result">("idle");
  const [attendanceStatus, setAttendanceStatus] = useState<{
    status: "success" | "error" | "warning";
    member?: Member;
    scannerInfo?: string;
    msg: string;
  } | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [checkedInSet, setCheckedInSet] = useState<Set<string>>(new Set());
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckinItem[]>([]);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualId, setManualId] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Tra cứu thành viên O(1) theo MSSV và ID
  const membersMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => {
      if (m.studentId) map.set(m.studentId.trim().toLowerCase(), m);
      if (m.id) map.set(m.id.trim().toLowerCase(), m);
    });
    return map;
  }, [members]);

  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio exception:", e);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);

    if (typeof window !== "undefined") {
      const session = localStorage.getItem("user_session");
      if (session) {
        try {
          const parsed = JSON.parse(session);
          setCurrentUser({
            mssv: parsed.mssv || "4751180032",
            role: parsed.role || "Quản trị viên",
            name: parsed.name || "Ban cán sự",
          });
        } catch (e) {
          console.error(e);
        }
      }
    }

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: data.name || data.fullName || data.hoTen || "Thành viên",
          studentId: String(data.mssv || data.studentId || d.id).trim(),
          department: Array.isArray(data.ban_id)
            ? data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện"
            : data.department,
          group: data.to_id,
          specialty: data.mangChuyenMon || data.specialty,
        };
      });
      setMembers(list);
    });

    const unsubActs = onSnapshot(collection(db, "activities"), (snap) => {
      const acts: Activity[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.title || "Hoạt động tình nguyện",
            points: Number(data.points || 10),
            password: data.password || "123",
            isActive: data.isActive !== false,
          };
        })
        .filter((a) => a.isActive);

      setActiveActivities(acts);
      if (acts.length > 0) {
        setSelectedActivityId((prev) => prev || acts[0].id);
      }
      setLoadingActivities(false);
    });

    return () => {
      unsubUsers();
      unsubActs();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Lắng nghe điểm danh theo hoạt động
  useEffect(() => {
    if (!currentActivity) return;

    const attQuery = query(
      collection(db, "attendance"),
      where("activityId", "==", currentActivity.id)
    );

    const unsubscribeAtt = onSnapshot(attQuery, (snapshot) => {
      const existingIds = new Set<string>();
      const existingList: RecentCheckinItem[] = [];

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const sid = String(data.studentId || data.mssv || "").trim().toLowerCase();
        if (sid) existingIds.add(sid);
        existingList.push({
          id: d.id,
          fullName: data.memberName || data.fullName || "Ẩn danh",
          studentId: data.studentId || data.mssv || "Không rõ",
          scannerName: data.scannerName || "Ban cán sự",
          scannerMssv: data.scannerMssv || "",
          timestamp: data.timestamp,
        });
      });

      setCheckedInSet(existingIds);
      existingList.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setRecentCheckins(existingList);
    });

    return () => unsubscribeAtt();
  }, [currentActivity]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn("Camera Cleanup Error:", err);
      } finally {
        scannerRef.current = null;
      }
    }
    setIsScanning(false);
  }, []);

  const resetAfterDelay = useCallback((duration = 1800) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAttendanceStatus(null);
      setScanStep("idle");
      setManualId("");
      setIsScanning(true);
    }, duration);
  }, []);

  const processCheckIn = useCallback(async (member: Member) => {
    if (!currentActivity) return;
    setLoading(true);
    const cleanSid = member.studentId.trim().toLowerCase();

    try {
      await addDoc(collection(db, "attendance"), {
        activityId: currentActivity.id,
        activityName: currentActivity.name,
        memberId: member.id,
        memberName: member.fullName,
        studentId: member.studentId,
        scannerName: currentUser.name,
        scannerMssv: currentUser.mssv,
        timestamp: serverTimestamp(),
      });

      const userDocRef = doc(db, "users", cleanSid);
      await updateDoc(userDocRef, {
        soBuoiDiemDanh: increment(1),
      }).catch(async () => {
        await updateDoc(doc(db, "users", member.id), {
          soBuoiDiemDanh: increment(1),
        }).catch(() => {});
      });

      playBeep();
      setCheckedInSet((prev) => new Set(prev).add(cleanSid));
      setAttendanceStatus({
        status: "success",
        member,
        scannerInfo: `${currentUser.name} (${currentUser.mssv})`,
        msg: "Điểm danh thành công",
      });
    } catch {
      setAttendanceStatus({ status: "error", msg: "Lỗi kết nối khi lưu bản ghi điểm danh" });
    } finally {
      setLoading(false);
      setScanStep("result");
      resetAfterDelay(1600);
    }
  }, [currentActivity, currentUser, playBeep, resetAfterDelay]);

  const initiateVerification = useCallback((inputData: string) => {
    const cleanInput = inputData.trim().toLowerCase();
    const member = membersMap.get(cleanInput);

    if (member) {
      if (checkedInSet.has(member.studentId.toLowerCase())) {
        setAttendanceStatus({
          status: "warning",
          member,
          msg: "Chiến sĩ này đã quét điểm danh trước đó!",
        });
        setScanStep("result");
        resetAfterDelay(2000);
      } else {
        processCheckIn(member);
      }
    } else {
      setAttendanceStatus({
        status: "error",
        msg: `Không tìm thấy thông tin: ${inputData}`,
      });
      setScanStep("result");
      resetAfterDelay(2000);
    }
  }, [membersMap, checkedInSet, processCheckIn, resetAfterDelay]);

  const onScanSuccess = useCallback(async (decodedText: string) => {
    await stopCamera();
    initiateVerification(decodedText);
  }, [stopCamera, initiateVerification]);

  const startCamera = useCallback(async () => {
    if (isStartingRef.current || (scannerRef.current && scannerRef.current.isScanning)) return;

    isStartingRef.current = true;
    setIsScanning(true);

    try {
      if (scannerRef.current) {
        await stopCamera();
      }

      await new Promise((res) => setTimeout(res, 200));

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        onScanSuccess,
        () => {}
      );
    } catch (err) {
      console.error("Camera Start Error:", err);
      setIsScanning(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [onScanSuccess, stopCamera]);

  useEffect(() => {
    if (currentActivity && isScanning && scanStep === "idle" && !showManualInput) {
      startCamera();
    }
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [currentActivity, isScanning, scanStep, showManualInput, startCamera]);

  const handleActivityLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    if (!selectedActivityId) return setErrorMessage("Vui lòng chọn một hoạt động");

    const targetAct = activeActivities.find((a) => a.id === selectedActivityId);
    if (!targetAct) return setErrorMessage("Hoạt động không tồn tại trên hệ thống");

    if (targetAct.password === passwordInput.trim()) {
      setCurrentActivity(targetAct);
      setIsScanning(true);
    } else {
      setErrorMessage("Mật mã ca trực không chính xác");
    }
  };

  const handleCloseSession = async () => {
    await stopCamera();
    setCurrentActivity(null);
    setPasswordInput("");
    setErrorMessage("");
    setScanStep("idle");
    setAttendanceStatus(null);
  };

  const processBulkCheckIn = async (ids: string[]) => {
    if (!currentActivity) return;
    setLoading(true);

    let success = 0;
    let warning = 0;
    let error = 0;
    const batch = writeBatch(db);
    const newCheckedIds: string[] = [];

    ids.forEach((inputData) => {
      const cleanInput = inputData.trim().toLowerCase();
      const member = membersMap.get(cleanInput);

      if (!member) {
        error++;
        return;
      }

      const sid = member.studentId.toLowerCase();
      if (checkedInSet.has(sid) || newCheckedIds.includes(sid)) {
        warning++;
        return;
      }

      const attRef = doc(collection(db, "attendance"));
      batch.set(attRef, {
        activityId: currentActivity.id,
        activityName: currentActivity.name,
        memberId: member.id,
        memberName: member.fullName,
        studentId: member.studentId,
        scannerName: currentUser.name,
        scannerMssv: currentUser.mssv,
        timestamp: serverTimestamp(),
      });

      const userDocRef = doc(db, "users", sid);
      batch.update(userDocRef, { soBuoiDiemDanh: increment(1) });

      newCheckedIds.push(sid);
      success++;
    });

    try {
      if (success > 0) {
        await batch.commit();
        playBeep();
        setCheckedInSet((prev) => {
          const nextSet = new Set(prev);
          newCheckedIds.forEach((id) => nextSet.add(id));
          return nextSet;
        });
      }

      setAttendanceStatus({
        status: success > 0 ? "success" : "warning",
        msg: `Thành công: ${success} | Đã điểm danh: ${warning} | Sai mã: ${error}`,
      });
    } catch {
      setAttendanceStatus({ status: "error", msg: "Lỗi thực thi dữ liệu hàng loạt" });
    } finally {
      setLoading(false);
      setScanStep("result");
      resetAfterDelay(2500);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    setShowManualInput(false);

    const ids = manualId.split(/[\n, ]+/).map((id) => id.trim()).filter(Boolean);
    if (ids.length === 1) {
      initiateVerification(ids[0]);
    } else {
      await processBulkCheckIn(ids);
    }
  };

  if (!isMounted) return null;

  // 1. MÀN HÌNH ĐĂNG NHẬP CA TRỰC
  if (!currentActivity) {
    return (
      <div className="min-h-screen bg-slate-100/70 flex flex-col justify-center items-center p-4 select-none font-sans">
        <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-6">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition flex items-center gap-1"
            >
              <span>←</span> Quay lại
            </Link>
            <span className="text-[11px] font-medium text-slate-500">
              Trực ban: <strong className="text-sky-600 font-semibold">{currentUser.name}</strong>
            </span>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">Kích Hoạt Máy Quét QR</h1>
            <p className="text-xs text-slate-500 mt-1">Chọn phiên hoạt động để bắt đầu tiếp nhận check-in</p>
          </div>

          {errorMessage && (
            <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold p-3 rounded-xl text-center animate-shake">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleActivityLogin} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Hoạt động diễn ra
              </label>
              {loadingActivities ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 font-medium">
                  Đang tải danh sách hoạt động...
                </div>
              ) : activeActivities.length > 0 ? (
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-sky-600 focus:bg-white transition cursor-pointer"
                >
                  {activeActivities.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name} (+{act.points} điểm)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-medium text-center">
                  Không có hoạt động nào đang mở
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Mật mã ca trực
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mã bảo vệ ca trực..."
                  className="w-full bg-slate-50 p-3 pr-14 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-sky-600 focus:bg-white transition"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
                >
                  {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || activeActivities.length === 0}
              className="w-full bg-sky-600 hover:bg-sky-700 active:scale-[0.99] text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              Mở Phiên Quét
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. MÀN HÌNH QUÉT CAMERA
  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-800 pb-10 flex flex-col justify-between font-sans select-none">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 py-3.5 px-4 sm:px-6 shadow-xs sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="min-w-0 text-center sm:text-left">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
              Ca trực: {currentUser.name} ({currentUser.mssv})
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase truncate">
              {currentActivity.name}
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="bg-sky-50 text-sky-700 border border-sky-200 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5">
              <span>Đã quét:</span>
              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-sky-100 shadow-xs">
                {checkedInSet.size}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCloseSession}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 border border-rose-200 rounded-xl font-bold text-xs transition cursor-pointer"
            >
              Đóng Phiên
            </button>
          </div>
        </div>
      </header>

      {/* THÂN CHÍNH */}
      <main className="max-w-6xl mx-auto w-full px-4 mt-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* KHUNG QUÉT CAMERA */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm min-h-[380px] flex flex-col justify-center items-center relative overflow-hidden">
              
              {/* TRẠNG THÁI KẾT QUẢ */}
              {scanStep === "result" && attendanceStatus && (
                <div className="text-center p-4 w-full animate-fade-in">
                  {attendanceStatus.status === "success" ? (
                    <div>
                      <div className="w-16 h-16 bg-emerald-50 text-emerald-600 font-black text-2xl rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-200 shadow-sm">
                        ✓
                      </div>
                      <h3 className="text-lg font-black text-slate-900 uppercase truncate px-2">
                        {attendanceStatus.member ? attendanceStatus.member.fullName : "GHI NHẬN THÀNH CÔNG"}
                      </h3>
                      <p className="text-xs font-mono font-bold text-sky-700 mt-1">
                        {attendanceStatus.member ? `MSSV: ${attendanceStatus.member.studentId}` : attendanceStatus.msg}
                      </p>
                      <div className="mt-3 p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 max-w-xs mx-auto">
                        Người điểm danh: <span className="font-semibold text-slate-900">{currentUser.name}</span>
                      </div>
                    </div>
                  ) : attendanceStatus.status === "warning" ? (
                    <div>
                      <div className="w-16 h-16 bg-amber-50 text-amber-600 font-black text-2xl rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200 shadow-sm">
                        !
                      </div>
                      <h3 className="text-lg font-black text-slate-900 uppercase truncate px-2">
                        {attendanceStatus.member ? attendanceStatus.member.fullName : "ĐÃ QUÉT TRƯỚC ĐÓ"}
                      </h3>
                      <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg inline-block mt-2 border border-amber-200">
                        {attendanceStatus.msg}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <div className="w-16 h-16 bg-rose-50 text-rose-600 font-black text-2xl rounded-2xl flex items-center justify-center mx-auto mb-3 border border-rose-200 shadow-sm">
                        ✕
                      </div>
                      <h3 className="text-sm font-bold text-rose-600 px-2 mt-1">{attendanceStatus.msg}</h3>
                    </div>
                  )}
                </div>
              )}

              {/* CAMERA IDLE */}
              {scanStep === "idle" && (
                <div className="w-full flex flex-col items-center justify-center">
                  {!isScanning && (
                    <div className="text-center py-16">
                      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2 text-lg">
                        📷
                      </div>
                      <p className="text-slate-400 font-semibold uppercase text-xs tracking-wider">
                        Camera đang tạm ngắt
                      </p>
                    </div>
                  )}
                  <div
                    id="reader"
                    className={`w-full max-w-[320px] aspect-square ${
                      !isScanning ? "hidden" : "block rounded-2xl overflow-hidden border border-slate-200 bg-black shadow-inner"
                    }`}
                  />
                </div>
              )}
            </div>

            {/* BÀN PHÍM ĐIỀU KHIỂN */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setScanStep("idle");
                  if (isScanning) stopCamera();
                  else startCamera();
                }}
                disabled={scanStep !== "idle" || showManualInput}
                className={`py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition cursor-pointer active:scale-[0.98] ${
                  isScanning
                    ? "bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"
                    : "bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
                }`}
              >
                {isScanning ? "Tắt Camera" : "Bật Camera"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setShowManualInput(true);
                }}
                disabled={scanStep !== "idle"}
                className="bg-white text-slate-700 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border border-slate-200 hover:bg-slate-50 transition cursor-pointer active:scale-[0.98]"
              >
                Nhập Mã Thủ Công
              </button>
            </div>
          </div>

          {/* DANH SÁCH LƯỢT QUÉT */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col min-h-[440px] max-h-[440px]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <h3 className="text-slate-900 font-extrabold text-xs uppercase tracking-wider">
                  Lượt Quét Gần Nhất
                </h3>
                <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100 font-mono">
                  {recentCheckins.length} đã xong
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 divide-y divide-slate-50">
                {recentCheckins.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-300 font-bold uppercase text-[11px]">
                    Chưa có lượt quét nào
                  </div>
                ) : (
                  recentCheckins.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50/70 hover:bg-sky-50/50 rounded-xl border border-slate-100 transition space-y-1.5 pt-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-slate-900 truncate text-xs uppercase">
                          {item.fullName}
                        </p>
                        <span className="text-[10px] font-medium text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200/60 shrink-0">
                          {item.timestamp?.seconds
                            ? new Date(item.timestamp.seconds * 1000).toLocaleTimeString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })
                            : "Vừa xong"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-sky-700">MSSV: {item.studentId}</span>
                        <span className="text-slate-500 text-[10px]">
                          Người quét: <strong className="text-slate-700 font-semibold">{item.scannerName}</strong>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* POPUP NHẬP MÃ THỦ CÔNG */}
      {showManualInput && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl border border-slate-200 text-center animate-scale-up">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1">
              Nhập Mã Sinh Viên
            </h3>
            <p className="text-slate-500 text-xs mb-4">
              Nhập 1 hoặc dán danh sách mã cách nhau bởi dấu cách, dấu phẩy hoặc dòng mới.
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <textarea
                autoFocus
                rows={4}
                placeholder="Ví dụ: 4751180032, 4751180012..."
                className="w-full bg-slate-50 p-3 rounded-xl text-center font-mono font-bold text-xs outline-none border border-slate-200 focus:border-sky-600 focus:bg-white transition resize-none"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {loading ? "Đang lưu..." : "Xác Nhận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}