import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { readSession } from "@/lib/server-session";
import { AttendanceError, documentId } from "@/lib/attendance-service";
import { groupNumber } from "@/lib/permissions";
import { memberScope } from "@/lib/member-scope";

export async function transferMember(body:Record<string,unknown>){
  const session=await readSession();if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
  const role=session.user.role, action=String(body.action);
  if(!["request","approve","reject"].includes(action))throw new AttendanceError("Thao tác không hợp lệ.");
  if(role!=="Quản trị viên" && (action!=="request" || !["Tổ trưởng","Trưởng ban Sự kiện","Trưởng ban Truyền thông"].includes(role)))throw new AttendanceError("Không có quyền xử lý đề nghị.",403);
  const memberId=documentId(body.memberId), reason=String(body.reason||"").trim();
  if((action==="request"||action==="reject")&&(!reason||reason.length>1000))throw new AttendanceError("Nhập lý do từ 1 đến 1000 ký tự.");
  const db=adminDb(),memberRef=db.collection("users").doc(memberId),ref=db.collection("member_transfer_requests").doc(memberId);
  return db.runTransaction(async tx=>{
    const [actor,live,member,request]=await Promise.all([tx.get(session.accountRef),tx.get(session.sessionRef),tx.get(memberRef),tx.get(ref)]);
    const account=actor.data(),login=live.data(),data=member.data(),proposal=request.data();
    if(!account||account.disabled||account.role!==role||account.authVersion!==session.authVersion||!login||login.expiresAt.toMillis()<=Date.now())throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.",401);
    const timestamp=FieldValue.serverTimestamp();
    if(action==="request"){
      if(!data)throw new AttendanceError("Thành viên không còn trong danh sách.",404);
      const scope=memberScope(data);
      if(role==="Tổ trưởng"&&(!scope.accessGroup||scope.accessGroup!==groupNumber(account.to_id||account.to||account.group)))throw new AttendanceError("Chỉ đề nghị chuyển thành viên thuộc tổ mình.",403);
      const department=role==="Trưởng ban Sự kiện"?"su-kien":"truyen-thong";
      if(role.startsWith("Trưởng ban")&&scope.accessDepartment!==department)throw new AttendanceError("Chỉ đề nghị chuyển thành viên thuộc ban mình.",403);
      const toGroup=body.toGroup ? groupNumber(body.toGroup) : scope.accessGroup;
      const toDepartment=body.toDepartment===undefined||body.toDepartment==="keep"?scope.accessDepartment:String(body.toDepartment);
      if(!toGroup||!["","su-kien","truyen-thong"].includes(toDepartment))throw new AttendanceError("Tổ hoặc ban đích không hợp lệ.");
      if(toGroup===scope.accessGroup&&toDepartment===scope.accessDepartment)throw new AttendanceError("Hãy chọn tổ hoặc ban khác hiện tại.");
      if(proposal?.status==="pending")throw new AttendanceError("Thành viên đã có đề nghị chuyển đang chờ duyệt.",409);
      const memberName=String(data.name||data.fullName||data.hoTen||"");
      tx.set(ref,{memberId,memberName,studentId:String(data.mssv||data.studentId||memberId),fromGroup:scope.accessGroup,fromDepartment:scope.accessDepartment,toGroup,toDepartment,reason,status:"pending",createdBy:session.accountRef.id,submittedBy:session.user.name,timestamp});
      tx.create(db.collection("operation_logs").doc(),{action:"member.transfer.request",actorId:session.accountRef.id,actorName:session.user.name,memberId,memberName,reason,fromGroup:scope.accessGroup,fromDepartment:scope.accessDepartment,toGroup,toDepartment,timestamp});
      return {status:"pending"};
    }
    if(!proposal)throw new AttendanceError("Không tìm thấy đề nghị.",404);
    if(proposal.status!=="pending")return {status:proposal.status};
    if(action==="approve"){
      if(!data)throw new AttendanceError("Thành viên đã bị xóa tạm hoặc không tồn tại.",409);
      const scope=memberScope(data);
      if(scope.accessGroup!==proposal.fromGroup||scope.accessDepartment!==proposal.fromDepartment)throw new AttendanceError("Hồ sơ đã thay đổi; hãy từ chối và gửi lại đề nghị.",409);
      if(!groupNumber(proposal.toGroup)||!["","su-kien","truyen-thong"].includes(proposal.toDepartment))throw new AttendanceError("Đề nghị không hợp lệ.");
      const label=proposal.toDepartment==="su-kien"?"Sự kiện":proposal.toDepartment==="truyen-thong"?"Truyền thông":"";
      tx.update(memberRef,{to_id:`to_${proposal.toGroup}`,to:`Tổ ${proposal.toGroup}`,group:`Tổ ${proposal.toGroup}`,accessGroup:proposal.toGroup,ban_id:proposal.toDepartment?[proposal.toDepartment==="su-kien"?"bansukien":"bantruyenthong"]:[],department:label,ban:label,accessDepartment:proposal.toDepartment});
    }
    const status=action==="approve"?"approved":"rejected";
    tx.update(ref,{status,reviewedBy:session.user.name,reviewedAt:timestamp,reviewReason:reason});
    tx.create(db.collection("operation_logs").doc(),{action:`member.transfer.${action}`,actorId:session.accountRef.id,actorName:session.user.name,memberId,memberName:proposal.memberName,reason:reason||proposal.reason,fromGroup:proposal.fromGroup,fromDepartment:proposal.fromDepartment,toGroup:proposal.toGroup,toDepartment:proposal.toDepartment,timestamp});
    return {status};
  });
}
