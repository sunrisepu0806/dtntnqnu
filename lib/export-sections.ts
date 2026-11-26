export const exportSections = ["Thành viên", "Hoạt động", "Điểm danh ban", "Điểm danh hoạt động"] as const;
export type ExportSection = typeof exportSections[number];
