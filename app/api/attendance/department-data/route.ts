import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({error:"Vui lòng đăng nhập lại."},{status:401});
    if (!["Quản trị viên","Trưởng ban Sự kiện","Trưởng ban Truyền thông"].includes(session.user.role)) return NextResponse.json({error:"Không có quyền xem ban."},{status:403});
    const department = new URL(request.url).searchParams.get("department");
    if (!["su-kien","truyen-thong"].includes(department || "")) return NextResponse.json({error:"Ban không hợp lệ."},{status:400});
    const db=adminDb();const [users,tasks]=await Promise.all([db.collection("users").where("accessDepartment","==",department).get(),db.collection("department_tasks").where("accessDepartment","==",department).get()]);
    return NextResponse.json({users:users.docs.map(d=>{const v=d.data();return {id:d.id,data:{name:v.name || v.fullName || v.hoTen || "",mssv:v.mssv || v.studentId || d.id,department:department==="su-kien"?"Sự kiện":"Truyền thông",mangChuyenMon:v.mangChuyenMon || v.specialty || "",to_id:v.to_id || v.group || "",soBuoiDiemDanh:v.soBuoiDiemDanh || 0}};}),tasks:tasks.docs.map(d=>{const v=d.data();return {id:d.id,data:{studentId:v.studentId || "",memberName:v.memberName || "",department:v.department || "",taskName:v.taskName || "",workDescription:v.workDescription || "",productLink:v.productLink || "",pointsAdded:v.pointsAdded || 1,approvedBy:v.approvedBy || "",timestamp:{seconds:v.timestamp?.seconds || 0}}};})},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Không tải được dữ liệu ban."},{status:500});}
}
