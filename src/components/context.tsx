"use client";
import { createContext, useContext } from "react";
import type { CaptureKind, Snapshot } from "@/domain/model";
export type Editor = {
  type: "task" | "meeting" | "organization" | "project" | "note" | "pr";
  id?: string;
  projectId?: string;
  organizationId?: string;
  date?: string;
  time?: string;
  duration?: number;
};
export interface WorkspaceContextValue {
  data: Snapshot;
  busy: boolean;
  command: (action: string, values: Record<string, unknown>) => Promise<void>;
  edit: (editor: Editor) => void;
  capture: (kind?: CaptureKind) => void;
  openProject: (id: string) => void;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
}
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace unavailable.");
  return value;
}
