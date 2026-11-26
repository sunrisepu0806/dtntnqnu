import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readSession } from "@/lib/server-session";

export async function GET() {
  const session = await readSession();
  if (session?.user.role !== "Quản trị viên") return new Response(null, {status:403});
  const file = await readFile(join(process.cwd(), "outputs", "Ho-so-tung-thanh-vien.xlsx"));
  return new Response(new Uint8Array(file), {headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":'attachment; filename="Ho-so-tung-thanh-vien.xlsx"',
    "Cache-Control":"private, no-store"
  }});
}


