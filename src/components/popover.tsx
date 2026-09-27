"use client";
import { useEffect, useRef, useState } from "react";

export function Popover({ label, icon, children, active = false }: { label: string; icon: React.ReactNode; children: React.ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="control-popover" ref={ref}><button type="button" className={`round-control ${active || open ? "active" : ""}`} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}>{icon}</button>{open && <div className="control-popover-content" role="group" aria-label={label}>{children}</div>}</div>;
}
