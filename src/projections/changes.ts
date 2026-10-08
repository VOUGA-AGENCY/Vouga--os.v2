import type { Snapshot } from "@/domain/model";
export const snapshotCollections = [
  "members",
  "projects",
  "tasks",
  "taskComments",
  "taskAttachments",
  "taskActivity",
  "meetings",
  "organizations",
  "contacts",
  "inbox",
  "interactions",
  "updates",
  "notes",
  "reminders",
  "pullRequests",
  "reminderReceipts",
  "activity",
  "pendingActions",
] as const;
type Collection = (typeof snapshotCollections)[number];
type Row = { id?: string; key?: string; memberId?: string };
const key = (row: Row) => row.id ?? JSON.stringify([row.memberId, row.key]);
export interface SnapshotPatch {
  baseRevision: number;
  revision: number;
  now: string;
  me: Snapshot["me"];
  changes: Partial<
    Record<Collection, { upserts: unknown[]; removed: string[] }>
  >;
}
export function snapshotChanges(
  before: Snapshot,
  after: Snapshot,
): SnapshotPatch {
  const changes: SnapshotPatch["changes"] = {};
  for (const name of snapshotCollections) {
    const previous = new Map(
      (before[name] as Row[]).map((row) => [key(row), row]),
    );
    const upserts: unknown[] = [];
    for (const row of after[name] as Row[]) {
      if (JSON.stringify(previous.get(key(row))) !== JSON.stringify(row))
        upserts.push(row);
      previous.delete(key(row));
    }
    if (upserts.length || previous.size)
      changes[name] = { upserts, removed: [...previous.keys()] };
  }
  return {
    baseRevision: before.revision,
    revision: after.revision,
    now: after.now,
    me: after.me,
    changes,
  };
}
export function applySnapshotPatch(
  before: Snapshot,
  patch: SnapshotPatch,
): Snapshot {
  if (before.revision !== patch.baseRevision)
    throw new Error("Workspace changed; reload before applying this response.");
  const next = {
    ...before,
    revision: patch.revision,
    now: patch.now,
    me: patch.me,
  };
  for (const name of snapshotCollections) {
    const change = patch.changes[name];
    if (!change) continue;
    const upserts = new Map(
      (change.upserts as Row[]).map((row) => [key(row), row]),
    );
    const removed = new Set(change.removed);
    const items = (before[name] as Row[])
      .filter((row) => !removed.has(key(row)))
      .map((row) => {
        const replacement = upserts.get(key(row));
        upserts.delete(key(row));
        return replacement ?? row;
      });
    Object.assign(next, { [name]: [...items, ...upserts.values()] });
  }
  return next;
}
