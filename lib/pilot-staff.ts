import "server-only";
import { FieldPath, Filter, type DocumentSnapshot } from "firebase-admin/firestore";
import QRCode from "qrcode";
import { adminDb } from "./firebase-admin";
import { memberGroup } from "./member-scope";
import { groupNumber } from "./permissions";
import { readSession } from "./server-session";
import type { PilotMember } from "@/lab/portal/store.cjs";

const noStore = {"Cache-Control": "no-store"};

function problem(message: string, status: number): never {
  throw Object.assign(new Error(message), {status});
}

function profile(doc: DocumentSnapshot): PilotMember | undefined {
  const data = doc.data();
  if (!data || data.archived === true) return;
  return {
    id: String(data.mssv || data.studentId || data.msv || doc.id).trim(),
    name: String(data.name || data.fullName || data.hoTen || doc.id).trim(),
    group: memberGroup(data.accessGroup ?? data.to_id ?? data.to ?? data.group)
  };
}

async function directoryMatches(ids: string[]) {
  const entries = new Map<string, PilotMember[]>();
  // Four MSSV fit within Firestore's OR limit, including older numeric fields.
  const lookup = async (batch: string[]) => {
    const variants: (string | number)[] = [...batch];
    for (const uid of batch) {
      if (Number.isSafeInteger(Number(uid)) && String(Number(uid))===uid) variants.push(Number(uid));
    }
    const filter = Filter.or(Filter.where(FieldPath.documentId(), "in", batch),
      ...["mssv","studentId","msv"].map(field => Filter.where(field, "in", variants)));
    const rows = await adminDb().collection("users").where(filter)
      .select("mssv","studentId","msv","name","fullName","hoTen","archived","accessGroup","to_id","to","group").get();
    for (const doc of rows.docs) {
      const member = profile(doc);
      if (member && batch.includes(member.id)) entries.set(member.id,[...(entries.get(member.id) || []),member]);
    }
  };
  for (let i=0; i<ids.length; i+=16) {
    const queries = [];
    for (let j=i; j<Math.min(i+16,ids.length); j+=4) queries.push(lookup(ids.slice(j,j+4)));
    await Promise.all(queries);
  }
  return entries;
}

async function findMember(uid: string): Promise<PilotMember | undefined> {
  const matches = (await directoryMatches([uid])).get(uid) || [];
  if (matches.length > 1) problem("MSSV trùng trong danh bạ. Hãy kiểm tra lại hồ sơ.", 409);
  return matches[0];
}

async function groupMembers(group: string) {
  const values = [group, Number(group), "to_" + group, "Tổ " + group, "tổ " + group];
  const filter = Filter.or(...["accessGroup","to_id","to","group"].map(field => Filter.where(field, "in", values)));
  const snapshot = await adminDb().collection("users").where(filter)
    .select("mssv","studentId","msv","archived","accessGroup","to_id","to","group").get();
  return snapshot.docs.map(profile).filter((m): m is PilotMember => m?.group === group).map(m => m.id);
}

export async function staffRequest(request: Request, key: string) {
  try {
    const session = await readSession();
    if (!session) problem("Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.", 401);
    const {user} = session;
    const admin = user.role === "Quản trị viên";
    const group = user.role === "Tổ trưởng" ? groupNumber(user.to_id) || "" : "";
    if (!admin) problem("Cần quyền quản trị để mở QR hoạt động.", 403);
    const { activeCode, applyAction, fundLookupIds, previousFundMembers, state, validStudentId } = await import("@/lab/portal/store.cjs");
    const actor = {id: session.accountRef.id, name: user.name, admin, group};
    if (request.method === "GET" && key === "api/state") {
      return Response.json(state(actor, group ? await groupMembers(group) : []), {headers: noStore});
    }
    if (request.method === "GET" && key === "qr.png" && admin) {
      const code = activeCode(new URL(request.url).searchParams.get("id") || "");
      const image = await QRCode.toBuffer(code, {width: 380, margin: 4});
      return new Response(new Uint8Array(image), {headers: {...noStore, "Content-Type":"image/png"}});
    }
    if (request.method !== "POST" || key !== "api/action") problem("Không có chức năng này.", 404);
    if (!request.headers.get("content-type")?.startsWith("application/json")) problem("Dữ liệu không hợp lệ.", 400);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string") problem("Thao tác không hợp lệ.", 400);
    if (!admin && body.action !== "pay") problem("Tổ trưởng chỉ được xác nhận quỹ trong tổ mình.", 403);
    if (!["newShift","open","close","staff"].includes(body.action)) problem("Chức năng đã được gỡ.",404);
    let member: PilotMember | undefined;
    if (["startDue","staff","enroll"].includes(body.action) || group) {
      const uid = validStudentId(body.uid);
      member = await findMember(uid);
      if (group && member?.group !== group) problem("Chỉ được xác nhận quỹ của thành viên trong tổ mình.", 403);
      if (!member) problem("MSSV " + uid + " chưa có trong danh bạ thành viên.", 404);
      body.uid = uid;
    }
    let directory: PilotMember[] | undefined;
    if (body.action === "term" || body.action === "preview") {
      const matches = await directoryMatches(fundLookupIds(body.ids));
      directory = [...matches.values()].flat();
    } else if (body.action === "openTerm" && body.usePrevious === true) {
      const matches = await directoryMatches(previousFundMembers(body.term));
      directory = [...matches.values()].filter(rows=>rows.length === 1).map(rows=>rows[0]);
    }
    return Response.json(applyAction(actor, body, member, directory), {headers: noStore});
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 503;
    const message = status === 503 ? "Chưa kết nối được dữ liệu thử nghiệm. Vui lòng thử lại." : (error as Error).message;
    return Response.json({error: message}, {status, headers: noStore});
  }
}
