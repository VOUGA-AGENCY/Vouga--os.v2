import { it, expect } from "vitest";
import { createSeed } from "@/persistence/seed";
import { workspaceFor } from "@/projections/workspace";
import { snapshotChanges, applySnapshotPatch } from "@/projections/changes";
it("reconciles changed records and permission removals without sending the whole workspace", () => {
  const data = createSeed("test-password"),
    me = data.members[2];
  const before = structuredClone(
    workspaceFor(data, me, new Date().toISOString()),
  );
  data.tasks[1].title = "Changed";
  data.tasks[0].visibility = "board";
  data.revision++;
  const after = workspaceFor(data, me, before.now);
  const patch = snapshotChanges(before, after);
  const result = applySnapshotPatch(before, patch);
  for (const name of ["tasks", "members", "activity", "taskComments"] as const)
    expect(result[name]).toEqual(after[name]);
  expect(patch.changes.organizations).toBeUndefined();
  expect(() => applySnapshotPatch(after, patch)).toThrow("Workspace changed");
  expect(JSON.stringify(patch)).not.toContain("passwordHash");
});
