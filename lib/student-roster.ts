export function parseStudentIds(text: string) {
  const raw = text.replace(/^\uFEFF/, "").split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!raw.length) throw new Error("Hãy dán danh sách MSSV.");
  if (raw.length > 2000) throw new Error("Danh sách quá dài.");
  const ids = [...new Set(raw)];
  if (ids.length > 300) throw new Error("Tối đa 300 MSSV khác nhau mỗi lần.");
  if (ids.some(id => !/^[a-z0-9._-]{1,128}$/.test(id))) throw new Error("Chỉ dán cột MSSV, không kèm tên hay tiêu đề.");
  return { ids, duplicates: raw.length - ids.length };
}
