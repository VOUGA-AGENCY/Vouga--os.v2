"use client";
import { useSyncExternalStore } from "react";
import { DarkGradientBg } from "./ui/elegant-dark-pattern";

// This flag belongs to this browser document, never to a server session.
let hasEntered = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function markWorkspaceEntered() {
  hasEntered = true;
  listeners.forEach((listener) => listener());
}

/** Full-screen animation is reserved for entry, never an internal transition. */
export function WorkspaceLoading({
  entryOnly = false,
}: {
  entryOnly?: boolean;
}) {
  const entered = useSyncExternalStore(
    subscribe,
    () => hasEntered,
    () => false,
  );
  if (entryOnly && entered) return null;
  return (
    <div
      className="workspace-loading"
      role="status"
      aria-label="A carregar o Vouga OS"
      aria-busy="true"
    >
      <DarkGradientBg className="workspace-loading-background">
        <div className="workspace-loading-center" aria-hidden="true">
          <div className="workspace-loading-symbol" />
        </div>
      </DarkGradientBg>
    </div>
  );
}
