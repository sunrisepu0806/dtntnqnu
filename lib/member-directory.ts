import { specialtyLabel } from "./specialties";
import type { DocumentData } from "firebase/firestore";
export interface Member {
  id: string;
  fullName: string;
  studentId: string;
  majorAndClass: string;
  department: string;
  group: string;
  dob: string;
  avatarUrl?: string;
  groupSessions: number;
  departmentSessions: number;
  totalSessions: number;
  totalPoints: number;
  specialty: string; // Mảng chuyên môn
  createdAt?: import("firebase/firestore").Timestamp;
}

export const cleanId = (val: unknown) => String(val || "").trim().toLowerCase();

export const formatDobString = (dob: unknown) => {
  if (!dob) return "";
  const dobStr = String(dob).trim();
  if (/^\d{5}$/.test(dobStr)) {
    const serial = parseInt(dobStr, 10);
    const date = new Date((serial - 25569) * 86400 * 1000);
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = date.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
  return dobStr;
};

const combineMajorAndClass = (rawMajor: unknown, rawClass: unknown) => {
  const major = String(rawMajor || "").trim();
  const className = String(rawClass || "").trim();
  if (major && className && !major.toLowerCase().includes(className.toLowerCase())) {
    return `${major} - ${className}`;
  }
  return major || className || "Chưa cập nhật";
};

export const normalizeDepartment = (val: unknown): string => {
  if (!val) return "";
  const str = String(val).trim().toLowerCase();
  if (str.includes("truyền thông") || str.includes("truyen thong") || str.includes("tt") || str.includes("media") || str.includes("bantruyenthong")) {
    return "Truyền thông";
  }
  if (str.includes("sự kiện") || str.includes("su kien") || str.includes("sk") || str.includes("event") || str.includes("bansukien")) {
    return "Sự kiện";
  }
  return String(val).trim();
};

export const normalizeGroup = (val: unknown): string => {
  if (!val) return "TNV";
  const str = String(val).trim().toUpperCase();
  if (str.includes("TNV") || str.includes("TỰ DO") || str.includes("TU DO")) return "TNV";
  const num = parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (num >= 1 && num <= 6) return String(num);
  return "TNV";
};

export const convertDriveToDirectLink = (url: string) => {
  if (!url) return "";
  const clean = url.trim();
  const match = clean.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return clean;
};

type Totals = Record<string,{group:number;department:number;points:number}>;
export function directoryMembers(rawMembers: DocumentData[], summary: {byId:Totals;byStudent:Totals} = {byId:{},byStudent:{}}) {
    const seen = new Set<string>();
    const list: Member[] = [];

    rawMembers.forEach((m) => {
      const sid = cleanId(m.studentId || m.mssv || m.msv || m.id);
      if (!sid || seen.has(sid)) return;
      seen.add(sid);

      const totals=summary.byId[m.id]||summary.byStudent[sid]||{group:0,department:0,points:0};
      const rawMajor = m.majorAndClass || m.major || m.nganhHoc || m.nganh || "";
      const rawClass = m.className || m.class || m.lop || "";

      let deptStr = "";
      if (Array.isArray(m.ban_id)) {
        deptStr = normalizeDepartment(m.ban_id.find(id => id === "bantruyenthong") || m.ban_id.find(id => id === "bansukien") || m.department || m.ban || m.ban_id[0]);
      } else {
        deptStr = normalizeDepartment(m.department || m.ban || m.ban_id);
      }

      const calculatedSessions = m.soBuoiDiemDanh !== undefined && m.soBuoiDiemDanh !== null
        ? Number(m.soBuoiDiemDanh)
        : totals.group+totals.department;

      const specialtyStr = specialtyLabel(m.mangChuyenMon || m.specialty);

      list.push({
        id: m.id || sid,
        fullName: String(m.fullName || m.name || m.hoTen || "").trim(),
        studentId: String(m.studentId || m.mssv || m.msv || m.id).trim(),
        majorAndClass: combineMajorAndClass(rawMajor, rawClass),
        department: deptStr,
        group: normalizeGroup(m.group || m.to || m.to_id),
        dob: formatDobString(m.dob || m.ngaySinh),
        avatarUrl: convertDriveToDirectLink(m.avatarUrl || m.avatar || m.linkDriveAnh || m.linkAnh || ""),
        groupSessions: totals.group,
        departmentSessions: totals.department,
        totalSessions: calculatedSessions,
        totalPoints: totals.points,
        specialty: specialtyStr,
        createdAt: m.createdAt,
      });
    });

    return list;
}
