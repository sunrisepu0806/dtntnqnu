import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { readSession } from "@/lib/server-session";
import { AttendanceError, documentId } from "@/lib/attendance-service";
import { groupNumber } from "@/lib/permissions";
import { memberScope } from "@/lib/member-scope";

export async function changeMemberRemoval(body: Record<string, unknown>) {
  const session = await readSession();
  if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.",401);
  const role=session.user.role;
  const action=body.action;
  if (!["request","approve","reject","restore"].includes(String(action))) throw new AttendanceError("Thao tác không hợp lệ.");
  if (role!=="Quản trị viên" && !(role==="Tổ trưởng" && action==="request")) throw new AttendanceError("Chỉ admin được duyệt hoặc khôi phục.",403);
  const id=documentId(body.memberId);
  const reason=typeof body.reason==="string"?body.reason.trim():"";
  if ((action==="request" || action==="reject") && (!reason || reason.length>1000)) throw new AttendanceError("Nhập lý do từ 1 đến 1000 ký tự.");
  const db=adminDb(), memberRef=db.collection("users").doc(id), requestRef=db.collection("member_removal_requests").doc(id), archiveRef=db.collection("archived_members").doc(id);
  return db.runTransaction(async tx=>{
    const [actor,live,member,request,archive]=await Promise.all([tx.get(session.accountRef),tx.get(session.sessionRef),tx.get(memberRef),tx.get(requestRef),tx.get(archiveRef)]);
    const account=actor.data(), login=live.data(), data=member.data(), proposal=request.data();
    if (!account || account.disabled || account.role!==role || account.authVersion!==session.authVersion || !login || login.expiresAt.toMillis()<=Date.now()) throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.",401);
    const stamp=FieldValue.serverTimestamp();
    if(action==="restore") {
      if(!archive.exists) throw new AttendanceError("Không có hồ sơ lưu trữ.",404);
      if(member.exists) throw new AttendanceError("Mã thành viên đang được sử dụng; không ghi đè hồ sơ.",409);
      tx.create(memberRef,archive.data()!.member);
      tx.delete(archiveRef);
      tx.update(requestRef,{status:"restored",restoredBy:session.user.name,restoredAt:stamp});
      tx.create(db.collection("operation_logs").doc(),{action:"member.restore",actorId:session.accountRef.id,actorName:session.user.name,memberId:id,memberName:proposal?.memberName||"",timestamp:stamp});
      return {status:"restored"};
    }
    if(action==="request") {
      if(!data) throw new AttendanceError("Thành viên không còn trong danh sách.",404);
      const group=memberScope(data).accessGroup;
      if(role==="Tổ trưởng" && (!group || groupNumber(account.to_id || account.to || account.group)!==group)) throw new AttendanceError("Chỉ được đề nghị xóa thành viên thuộc tổ mình.",403);
      if(proposal?.status==="pending")return {status:"pending"};
      if(archive.exists)throw new AttendanceError("Hồ sơ đã được lưu trữ.",409);
      tx.set(requestRef,{memberId:id,memberName:String(data.name||data.fullName||data.hoTen||"Thành viên"),studentId:String(data.mssv||data.studentId||id),accessGroup:group,reason,status:"pending",createdBy:session.accountRef.id,submittedBy:session.user.name,timestamp:stamp});
      tx.create(db.collection("operation_logs").doc(),{action:"member.removal.request",actorId:session.accountRef.id,actorName:session.user.name,memberId:id,memberName:String(data.name||data.fullName||data.hoTen||""),reason,timestamp:stamp});
      return {status:"pending"};
    }
    if(!proposal)throw new AttendanceError("Không tìm thấy đề nghị.",404);
    if(proposal.status!=="pending")return {status:proposal.status};
    if(action==="approve") {
      if(!data || archive.exists)throw new AttendanceError("Hồ sơ đã thay đổi. Vui lòng kiểm tra lại.",409);
      if(memberScope(data).accessGroup!==proposal.accessGroup)throw new AttendanceError("Thành viên đã chuyển tổ. Hãy từ chối đề nghị cũ.",409);
      tx.create(archiveRef,{member:data,archivedBy:session.user.name,archivedAt:stamp});
      tx.delete(memberRef);
    }
    const status=action==="approve"?"approved":"rejected";
    tx.update(requestRef,{status,reviewedBy:session.user.name,reviewedAt:stamp,reviewReason:reason});
    tx.create(db.collection("operation_logs").doc(),{action:action==="approve"?"member.archive":"member.removal.reject",actorId:session.accountRef.id,actorName:session.user.name,memberId:id,memberName:proposal.memberName||"",reason:reason||proposal.reason,timestamp:stamp});
    return {status};
  });
}
