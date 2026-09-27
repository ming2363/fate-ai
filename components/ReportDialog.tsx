"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function ReportDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); before?.focus(); };
  }, []);
  return <dialog ref={ref} className="report-dialog" aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog-body"><header><strong>{title}</strong><button type="button" aria-label="关闭" onClick={onClose} className="dialog-close">×</button></header>{children}</div></dialog>;
}
