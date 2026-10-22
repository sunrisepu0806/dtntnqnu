// Shared by member forms, the migration, and authorization tests.
export function memberGroup(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw.match(/^(?:(?:tổ|to)[_\s]*)?([1-5])$/)?.[1] || "";
}

export function memberDepartment(value: unknown): string {
  const raw = (Array.isArray(value) ? value.join(" ") : String(value ?? ""))
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]/g, "");
  if (raw.includes("truyenthong")) return "truyen-thong";
  if (raw.includes("sukien")) return "su-kien";
  return "";
}

export function memberScope(data: Record<string, unknown>) {
  return {
    accessGroup: memberGroup(data.to_id || data.to || data.group),
    accessDepartment: memberDepartment(data.ban_id || data.department || data.ban),
  };
}
