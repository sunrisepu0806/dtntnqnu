// Preserve unknown historical labels; do not guess a member's assignment.
export function specialtyLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "Chưa phân mảng";
  if (["Content", "Viết bài", "Content - Viết bài"].includes(text)) return "Content – Viết bài";
  if (["Kỹ thuật - Hậu kỳ", "Kỹ thuật - Hậu cần", "Kỹ thuật-Hậu cần"].includes(text)) return "Kỹ thuật – Hậu cần";
  return text;
}
export const COMMUNICATION_SPECIALTIES = ["Chụp ảnh", "Content – Viết bài", "Thiết kế", "Kỹ thuật – Hậu cần"];
