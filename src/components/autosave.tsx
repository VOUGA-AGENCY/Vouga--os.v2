"use client";
import { useEffect, useState } from "react";
import { DraftSaver } from "@/foundation/draft-saver";
import { useWorkspace } from "./context";
import type { Snapshot } from "@/domain/model";
const savers = new Set<DraftSaver>();
export async function flushEdits() {
  await Promise.all([...savers].map((saver) => saver.flush()));
}
export function useAutosave(
  action: string,
  id: string | undefined,
  version: number | undefined,
) {
  const { command } = useWorkspace();
  const [, rerender] = useState(0);
  const [saver] = useState(
    () =>
      new DraftSaver(
        version ?? 1,
        async (fields, currentVersion) => {
          const snapshot = await command(action, {
            ...fields,
            id,
            version: currentVersion,
          });
          const collection = (
            {
              task: "tasks",
              meeting: "meetings",
              organization: "organizations",
              project: "projects",
              note: "notes",
              pr: "pullRequests",
            } as const
          )[action.split(".")[0] as "task"];
          const item = (snapshot[collection] as Snapshot["tasks"]).find(
            (item) => item.id === id,
          );
          if (!item)
            throw new Error(
              "Record is no longer available. Reload to review your changes.",
            );
          return item.version;
        },
        () => rerender((count) => count + 1),
      ),
  );
  useEffect(() => {
    if (!id) return;
    savers.add(saver);
    const leaving = (event: BeforeUnloadEvent) => {
      if (saver.state !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      savers.delete(saver);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [id, saver]);
  return {
    saver,
    stage: (fields: Record<string, unknown>) => {
      if (id) saver.patch(fields, false);
    },
    patch: (fields: Record<string, unknown>) => {
      if (id) saver.patch(fields);
    },
    flush: () => saver.flush(),
  };
}
export function SaveStatus({ saver }: { saver: DraftSaver }) {
  return (
    <span
      className="autosave-status"
      role="status"
      data-unsaved={saver.state !== "saved"}
    >
      {saver.state === "saved" ? (
        "Saved automatically"
      ) : saver.state === "saving" ? (
        "Saving…"
      ) : saver.state === "unsaved" ? (
        "Unsaved changes…"
      ) : (
        <>
          {saver.error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void saver.flush().catch(() => undefined)}
          >
            Retry
          </button>
        </>
      )}
    </span>
  );
}
export function formFields(form: HTMLFormElement): Record<string, unknown> {
  const values = new FormData(form);
  const fields: Record<string, unknown> = Object.fromEntries(values);
  for (const key of [
    "assigneeIds",
    "memberIds",
    "participantIds",
    "calendarTargets",
    "recipientIds",
  ])
    if (values.has(key) || values.has(`${key}Present`))
      fields[key] = values.getAll(key);
  for (const key of ["pinned", "archived", "allDay"])
    if (values.has(`${key}Present`)) fields[key] = values.has(key);
  return fields;
}
