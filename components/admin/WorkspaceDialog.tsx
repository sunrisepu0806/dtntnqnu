"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { WorkspaceIcon } from "./workspace-navigation";
import styles from "@/app/admin/sections.module.css";

export default function WorkspaceDialog({ title, onDismiss, busy = false, children }: {
  title: string; onDismiss: () => void; busy?: boolean; children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}>
    <div className={styles.dialogTop}><h2 id={id}>{title}</h2>
      <button type="button" className={styles.iconButton} aria-label="Đóng" disabled={busy} onClick={onDismiss}><WorkspaceIcon name="close" /></button>
    </div>
    <div className={styles.dialogBody}>{children}</div>
  </dialog>;
}
