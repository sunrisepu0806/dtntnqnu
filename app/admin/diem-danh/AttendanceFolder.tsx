import Link from "next/link";
import type { ComponentProps } from "react";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import workspace from "../overview.module.css";
import styles from "./attendance.module.css";

type FolderProps = {
  href: string;
  icon: ComponentProps<typeof WorkspaceIcon>["name"];
  name: string;
  detail: string;
  current?: boolean;
};

export default function AttendanceFolder({ href, icon, name, detail, current }: FolderProps) {
  return (
    <Link href={href} className={workspace.folder + " " + styles.folderLink} aria-current={current ? "location" : undefined}>
      <span className={styles.folderIcon} data-icon={icon}><WorkspaceIcon name={icon} /></span>
      <span className={styles.folderText}><strong>{name}</strong><small>{detail}</small></span>
    </Link>
  );
}
