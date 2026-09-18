import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "chuoi-khoa-bao-mat-xac-thuc-he-thong-mssv-qnu-2026"
);

type UserData = {
  mssv?: string;
  studentId?: string;
  email?: string;
  name?: string;
  fullName?: string;
  hoTen?: string;
  role?: string;
  to?: string;
  to_id?: string;
  group?: string;
  ban_id?: string | string[];
  department?: string;
  password?: string;
  passwork?: string;
  isAdmin?: boolean;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

function extractGroup(userData: UserData): string {
  const raw = String(userData.to || userData.to_id || userData.group || "").trim();
  const match = raw.match(/[1-5]/);
  return match ? `Tổ ${match[0]}` : raw;
}

function extractDepartment(userData: UserData): string {
  if (Array.isArray(userData.ban_id)) {
    return userData.ban_id.includes("bantruyenthong") ? "Ban Truyền thông" : "Ban Sự kiện";
  }
  return normalizeText(userData.ban_id || userData.department);
}

function buildSafeUser(userData: UserData, fallbackMssv?: string | null) {
  const groupVal = extractGroup(userData);
  const banVal = extractDepartment(userData);

  return {
    mssv: normalizeText(userData.mssv || userData.studentId || fallbackMssv),
    email: normalizeText(userData.email),
    name: normalizeText(userData.name || userData.fullName || userData.hoTen),
    role: normalizeText(userData.role || "Quét mã"),
    to: groupVal,
    to_id: groupVal,
    ban_id: banVal,
    isAdmin: userData.role === "Quản trị viên" || Boolean(userData.isAdmin),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const mssv = body.mssv ? String(body.mssv).trim() : null;
    const password = body.password ? String(body.password).trim() : null;
    const email = body.email ? String(body.email).trim() : null;

    let userData: UserData | null = null;
    let effectiveMssv = mssv;

    // 1. Đăng nhập qua Email / Google
    if (email) {
      const [snapAdmin, snapUsers, snapUser] = await Promise.all([
        getDocs(query(collection(db, "admin_accounts"), where("email", "==", email))),
        getDocs(query(collection(db, "users"), where("email", "==", email))),
        getDocs(query(collection(db, "user"), where("email", "==", email))),
      ]);

      const activeQuerySnap = !snapAdmin.empty
        ? snapAdmin
        : !snapUsers.empty
        ? snapUsers
        : !snapUser.empty
        ? snapUser
        : null;

      if (!activeQuerySnap) {
        return NextResponse.json(
          { error: `Tài khoản (${email}) chưa được phân quyền trong hệ thống.` },
          { status: 404 }
        );
      }

      userData = activeQuerySnap.docs[0].data() as UserData;
      effectiveMssv = userData.mssv || activeQuerySnap.docs[0].id;
    }

    // 2. Đăng nhập qua MSSV + Mật khẩu
    else if (mssv && password) {
      const [snapAdmin, snapUsers, snapUser] = await Promise.all([
        getDoc(doc(db, "admin_accounts", mssv)),
        getDoc(doc(db, "users", mssv)),
        getDoc(doc(db, "user", mssv)),
      ]);

      const activeSnap = snapAdmin.exists()
        ? snapAdmin
        : snapUsers.exists()
        ? snapUsers
        : snapUser.exists()
        ? snapUser
        : null;

      if (!activeSnap) {
        return NextResponse.json(
          { error: `Tài khoản MSSV ${mssv} không tồn tại trên hệ thống.` },
          { status: 404 }
        );
      }

      const foundData = activeSnap.data() as UserData;
      const dbPassword = normalizeText(foundData.password ?? foundData.passwork);

      if (!dbPassword || dbPassword !== password) {
        return NextResponse.json(
          { error: "Mật khẩu đăng nhập không chính xác." },
          { status: 401 }
        );
      }

      userData = foundData;
    } else {
      return NextResponse.json(
        { error: "Vui lòng cung cấp đầy đủ thông tin đăng nhập." },
        { status: 400 }
      );
    }

    if (!userData) {
      return NextResponse.json(
        { error: "Không tìm thấy dữ liệu tài khoản." },
        { status: 404 }
      );
    }

    const safeUser = buildSafeUser(userData, effectiveMssv);

    // ĐIỀU HƯỚNG CHÍNH XÁC THEO VAI TRÒ
    let redirectUrl = "/admin/diem-danh";
    const roleChuan = safeUser.role;
    const numTo = safeUser.to.replace(/[^0-9]/g, "");

    if (roleChuan === "Quản trị viên") {
      redirectUrl = "/admin/diem-danh";
    } else if (roleChuan === "Quét mã") {
      redirectUrl = "/admin/diem-danh/quet-ma";
    } else if (roleChuan === "Tổ trưởng") {
      // Chuẩn hóa đúng folder to-truong
      redirectUrl = numTo ? `/admin/diem-danh/to-truong/${numTo}` : "/admin/diem-danh/to-truong";
    } else if (roleChuan === "Trưởng ban Sự kiện") {
      redirectUrl = "/admin/diem-danh/truong-ban/su-kien";
    } else if (roleChuan === "Trưởng ban Truyền thông") {
      redirectUrl = "/admin/diem-danh/truong-ban/truyen-thong";
    }

    const token = await new SignJWT(safeUser)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      user: safeUser,
      redirectUrl: redirectUrl,
    });

    response.cookies.set({
      name: "access_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi máy chủ trong quá trình xác thực.";
    console.error("Lỗi đăng nhập:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}