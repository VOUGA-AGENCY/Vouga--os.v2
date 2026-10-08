import { describe, expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { workspaceFor } from "@/projections/workspace";
import { creationNotice } from "@/services/creation-notifications";
import { readAgentTool, summarizeMyWork } from "@/services/agent-service";
import type { ServiceContext } from "@/services/runtime";
const now = "2026-10-04T10:00:00Z";
describe("shared task assignments and Board visibility", () => {
  it("appears in both assignees' queries, summaries and creation notices", async () => {
    const data = createSeed("test-password", now);
    executeCommand(
      data,
      data.members[0],
      {
        action: "task.save",
        values: {
          title: "Shared planning",
          assigneeIds: ["miguel", "afonso"],
          visibility: "board",
        },
      },
      now,
    );
    const task = data.tasks.at(-1)!;
    for (const id of ["miguel", "afonso"]) {
      const me = data.members.find((member) => member.id === id)!;
      me.telegramChatId = id;
      const view = workspaceFor(data, me, now);
      expect(readAgentTool(view, "getTasks", { ownerId: id })).toContainEqual(
        task,
      );
      const ctx = {
        repo: { read: async () => data },
        now: () => now,
      } as ServiceContext;
      expect((await summarizeMyWork(ctx, me)).text).toContain(task.title);
      expect(
        creationNotice(data, {
          entityType: "task",
          entityId: task.id,
          actorId: "miguel",
          memberId: id,
        })?.text,
      ).toContain(task.title);
    }
  });
  it("keeps Board tasks, comments, files and activity inaccessible to engineers and other admins", () => {
    const data = createSeed("test-password", now);
    executeCommand(
      data,
      data.members[0],
      {
        action: "task.save",
        values: {
          title: "Board confidential",
          visibility: "board",
          assigneeIds: ["miguel"],
        },
      },
      now,
    );
    const task = data.tasks.at(-1)!;
    executeCommand(
      data,
      data.members[0],
      {
        action: "task.comment",
        values: { taskId: task.id, body: "Private board discussion" },
      },
      now,
    );
    data.taskAttachments.push({
      id: "file",
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: "miguel",
      taskId: task.id,
      name: "board.pdf",
      mimeType: "application/pdf",
      size: 1,
      storageName: "file",
    });
    const outsiders = [
      ...data.members.filter((m) => m.role === "engineer"),
      {
        id: "other-admin",
        name: "Other admin",
        role: "admin" as const,
        email: "other@example.com",
      },
    ];
    for (const me of outsiders) {
      data.members.push(me);
      const view = workspaceFor(data, me, now);
      expect(JSON.stringify(view)).not.toContain("Board confidential");
      expect(view.taskComments.some((c) => c.taskId === task.id)).toBe(false);
      expect(view.taskAttachments.some((c) => c.taskId === task.id)).toBe(
        false,
      );
      expect(() =>
        executeCommand(
          data,
          me,
          {
            action: "task.save",
            values: { id: task.id, version: task.version, title: "Leak" },
          },
          now,
        ),
      ).toThrow();
    }
    expect(workspaceFor(data, data.members[1], now).tasks).toContainEqual(task);
  });
  it("rejects Board creation and assignments outside Miguel/Roque and preserves patch fields", () => {
    const data = createSeed("test-password", now),
      admin = data.members[0],
      engineer = data.members[2];
    expect(() =>
      executeCommand(
        data,
        engineer,
        { action: "task.save", values: { title: "No", visibility: "board" } },
        now,
      ),
    ).toThrow();
    expect(() =>
      executeCommand(
        data,
        admin,
        {
          action: "task.save",
          values: { title: "No", visibility: "board", assigneeIds: ["ana"] },
        },
        now,
      ),
    ).toThrow();
    executeCommand(
      data,
      admin,
      {
        action: "task.save",
        values: {
          title: "Both",
          body: "Context",
          dueOn: "2026-10-05",
          visibility: "board",
          assigneeIds: ["miguel", "afonso"],
        },
      },
      now,
    );
    const task = data.tasks.at(-1)!;
    executeCommand(
      data,
      admin,
      {
        action: "task.save",
        values: { id: task.id, version: task.version, priority: "high" },
      },
      now,
    );
    const fieldVersion = task.version;
    executeCommand(
      data,
      data.members[1],
      {
        action: "task.comment",
        values: { taskId: task.id, body: "Review this" },
      },
      now,
    );
    expect(task.version).toBe(fieldVersion);
    expect(task).toMatchObject({
      title: "Both",
      body: "Context",
      dueOn: "2026-10-05",
      assigneeIds: ["miguel", "afonso"],
      priority: "high",
    });
    expect(() =>
      executeCommand(
        data,
        admin,
        {
          action: "task.save",
          values: { id: task.id, version: 1, title: "Stale" },
        },
        now,
      ),
    ).toThrow();
  });
});
