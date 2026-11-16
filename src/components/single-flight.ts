"use client";
import { useCallback, useRef } from "react";

/**
 * Ignores a new call while the previous one is still running, so a double click or a
 * repeated Enter cannot create the same record twice. A ref, not state: the second
 * event can arrive before React re-renders.
 */
export function useSingleFlight() {
  const running = useRef(false);
  return useCallback(async (work: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    try {
      await work();
    } finally {
      running.current = false;
    }
  }, []);
}
