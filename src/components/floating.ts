"use client";
import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * Places a dropdown under (or above, when there is no room) its trigger with fixed positioning, so it is never
 * clipped by a scrolling dialog or side panel. Closes on outside click and Escape.
 */
export function useFloating(
  open: boolean,
  setOpen: (open: boolean) => void,
  rootRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  matchWidth = true,
) {
  const place = useCallback(() => {
    const root = rootRef.current, panel = panelRef.current;
    if (!root || !panel) return;
    const anchor = root.getBoundingClientRect();
    const gap = 4, margin = 8;
    const height = panel.offsetHeight, width = panel.offsetWidth;
    const below = window.innerHeight - anchor.bottom - margin;
    const above = anchor.top - margin;
    const top = height > below && above > below ? Math.max(margin, anchor.top - gap - height) : anchor.bottom + gap;
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
    Object.assign(panel.style, { top: `${top}px`, left: `${left}px`, ...(matchWidth ? { minWidth: `${anchor.width}px` } : {}) });
  }, [rootRef, panelRef, matchWidth]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Close only the dropdown, not the dialog around it.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      rootRef.current?.querySelector<HTMLElement>("button")?.focus();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, setOpen, place, rootRef, panelRef]);

}

/** Lets forms that autosave from input events notice a value set through a hidden input. */
export function announce(input: HTMLInputElement | null) {
  input?.dispatchEvent(new Event("input", { bubbles: true }));
}
