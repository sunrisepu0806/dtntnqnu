// Turn whatever a scanned code contains into the value the check-in API looks up.
// Members restyle their QR in other apps, so the same MSSV may arrive as
// "4751180032", "MSSV: 4751180032", a URL with ?mssv=..., or with stray
// whitespace / invisible characters.

const INVISIBLE = /[​-‍⁠﻿]/g;
const STUDENT_ID = /(?<!\d)\d{8,12}(?!\d)/g;
const ID_PARAMS = ["mssv", "msv", "studentId", "student_id", "id", "code"];

export function normalizeScanCode(raw: string): string {
  const text = raw.replace(INVISIBLE, "").trim();
  // A bare token (plain MSSV or a member id) is used as is.
  if (!/[\s/:?=&|;,]/.test(text)) return text;

  // URL: prefer an explicit id parameter, then the last path segment.
  try {
    const url = new URL(text);
    for (const key of ID_PARAMS) {
      const value = url.searchParams.get(key)?.trim();
      if (value) return value;
    }
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last && /^\d{8,12}$/.test(last)) return last;
  } catch { /* not a URL */ }

  // Free text ("MSSV: 4751180032", "4751180032 | Nguyễn Văn A", vCard...):
  // take the student number when exactly one distinct one appears.
  const ids = [...new Set(text.match(STUDENT_ID) ?? [])];
  if (ids.length === 1) return ids[0];
  return text;
}
