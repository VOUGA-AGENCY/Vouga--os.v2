/** Preview by default; --apply converts existing Backlog tasks without changing their content. */
import { mkdir, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { runtime } from "../src/services/runtime";
import { captureChanges } from "../src/services/activity-service";

const ctx = runtime();
const before = await ctx.repo.read();
const targets = before.tasks.filter((task) => task.status === "backlog");
if (!process.argv.includes("--apply") || !targets.length) {
  console.log(
    JSON.stringify(
      {
        apply: false,
        count: targets.length,
        tasks: targets.map(({ id, title }) => ({ id, title })),
      },
      null,
      2,
    ),
  );
} else {
  await mkdir(".local/backups", { recursive: true, mode: 0o700 });
  const backup = `.local/backups/before-backlog-to-do-${Date.now()}.json`;
  await writeFile(backup, JSON.stringify(before), { flag: "wx", mode: 0o600 });
  const now = ctx.now();
  const ids = new Set(targets.map((task) => task.id));
  await ctx.repo.transact((data) => {
    if (!isDeepStrictEqual(data.tasks, before.tasks))
      throw new Error(
        "Tasks changed during preview. Run the migration again; nothing was changed.",
      );
    const actor = data.members.find(
      (member) => member.id === "miguel" && !member.archived,
    );
    if (!actor) throw new Error("Migration actor unavailable.");
    const previous = structuredClone(data);
    for (const task of data.tasks) {
      if (!ids.has(task.id)) continue;
      task.status = "todo";
      task.version++;
      task.updatedAt = now;
    }
    captureChanges(data, previous, actor, "os", now);
  });
  const after = await ctx.repo.read();
  for (const original of before.tasks) {
    const expected = ids.has(original.id)
      ? {
          ...original,
          status: "todo",
          version: original.version + 1,
          updatedAt: now,
        }
      : original;
    if (
      !isDeepStrictEqual(
        after.tasks.find((task) => task.id === original.id),
        expected,
      )
    )
      throw new Error(
        `Post-migration verification failed for ${original.id}. Backup: ${backup}`,
      );
  }
  console.log(
    JSON.stringify(
      {
        migrated: targets.length,
        totalBefore: before.tasks.length,
        totalAfter: after.tasks.length,
        backup,
        verified: true,
      },
      null,
      2,
    ),
  );
}
