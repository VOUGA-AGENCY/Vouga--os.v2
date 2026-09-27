"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    el?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select',
    )?.focus();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <header className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Fechar"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
