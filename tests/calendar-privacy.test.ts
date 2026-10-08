import { describe, it, expect } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { workspaceFor } from "@/projections/workspace";
import { meetingReminders } from "@/services/telegram-service";
import { simplifyWorkspace } from "@/migrations/workspace-simplification";
import { uniqueEvents } from "@/domain/calendars";
import { readAgentTool, summarizeMyWork } from "@/services/agent-service";
import type { ServiceContext } from "@/services/runtime";
const now = "2026-09-27T07:00:00.000Z";
const fixture = createSeed("isolated-password", now);
const event = {
  title: "Shared appointment",
  startsAt: "2026-09-27T10:00",
  endsAt: "2026-09-27T11:00",
  participantIds: ["miguel"],
};
describe("private tasks and calendar destinations", () => {
  it("keeps personal tasks, comments, files and activity out of every other user's projection and Agent", () => {
    const data = structuredClone(fixture),
      owner = data.members.find((m) => m.id === "vasco")!;
    executeCommand(
      data,
      owner,
      {
        action: "task.save",
        values: {
          title: "Personal secret",
          ownerId: owner.id,
          visibility: "private",
          projectId: "operations",
        },
      },
      now,
    );
    const task = data.tasks.at(-1)!;
    executeCommand(
      data,
      owner,
      {
        action: "task.comment",
        values: { taskId: task.id, body: "Personal comment" },
      },
      now,
    );
    data.taskAttachments.push({
      ...task,
      taskId: task.id,
      name: "private.pdf",
      mimeType: "application/pdf",
      size: 1,
      storageName: "private",
    });
    expect(task.projectId).toBeNull();
    for (const me of data.members.filter((m) => m.id !== owner.id)) {
      const view = workspaceFor(data, me, now);
      expect(JSON.stringify(view)).not.toContain("Personal secret");
      expect(JSON.stringify(view)).not.toContain("Personal comment");
      expect(JSON.stringify(view)).not.toContain("private.pdf");
      expect(readAgentTool(view, "getTasks", {})).not.toContainEqual(task);
      expect(() =>
        executeCommand(
          data,
          me,
          {
            action: "task.status",
            values: { id: task.id, version: task.version, status: "done" },
          },
          now,
        ),
      ).toThrow();
    }
  });
  it("enforces engineer own personal + Contacto and admin all calendars on reads and writes", () => {
    const data = structuredClone(fixture),
      admin = data.members[0],
      engineer = data.members[2];
    executeCommand(
      data,
      admin,
      {
        action: "meeting.save",
        values: {
          ...event,
          calendarTargets: ["office", "contacto", "personal:ana"],
        },
      },
      now,
    );
    const copies = data.meetings.slice(-3),
      view = workspaceFor(data, engineer, now);
    expect(copies.map((e) => view.meetings.some((m) => m.id === e.id))).toEqual(
      [false, true, false],
    );
    expect(workspaceFor(data, admin, now).meetings).toEqual(data.meetings);
    for (const calendarTargets of [["office"], ["personal:ana"]])
      expect(() =>
        executeCommand(
          structuredClone(data),
          engineer,
          { action: "meeting.save", values: { ...event, calendarTargets } },
          now,
        ),
      ).toThrow();
    executeCommand(
      data,
      engineer,
      {
        action: "meeting.save",
        values: { ...event, calendarTargets: ["personal:vasco"] },
      },
      now,
    );
    expect(data.meetings.at(-1)?.participantIds).toContain("vasco");
  });
  it("updates all linked copies, cancels removed targets and queues only Google destinations", () => {
    const data = structuredClone(fixture),
      me = data.members[0];
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: {
          ...event,
          calendarTargets: ["office", "contacto", "personal:miguel"],
        },
      },
      now,
    );
    const copies = data.meetings.slice(-3),
      id = copies[0].id;
    expect(uniqueEvents(copies)).toHaveLength(1);
    expect(data.integrationJobs).toHaveLength(2);
    expect(copies[2].syncStatus).toBe("local");
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: {
          ...event,
          id,
          version: copies[0].version,
          title: "Updated",
          calendarTargets: ["office", "personal:miguel"],
        },
      },
      now,
    );
    expect(copies[0].title).toBe("Updated");
    expect(copies[1].cancelled).toBe(true);
    expect(copies[2].title).toBe("Updated");
    executeCommand(
      data,
      me,
      { action: "meeting.cancel", values: { id, version: copies[0].version } },
      now,
    );
    expect(copies.every((e) => e.cancelled)).toBe(true);
  });
  it("does not leak Office through company interaction history, notes or activity", () => {
    const data = structuredClone(fixture),
      me = data.members[0];
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: {
          ...event,
          title: "Secret Office",
          organizationId: "norte",
          calendarKey: "office",
        },
      },
      now,
    );
    const m = data.meetings.at(-1)!;
    data.notes.push({
      ...data.notes[0],
      id: "hidden-context",
      title: "Hidden context",
      meetingId: m.id,
      projectId: null,
      visibility: "team",
    });
    const view = JSON.stringify(workspaceFor(data, data.members[2], now));
    expect(view).not.toContain("Secret Office");
    expect(view).not.toContain("Hidden context");
  });
  it("supports editing all-day and recurring occurrences without losing Google references", () => {
    const data = structuredClone(fixture),
      me = data.members[0];
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: { ...event, allDay: true, endsAt: "2026-09-28T10:00" },
      },
      now,
    );
    const item = data.meetings.at(-1)!;
    item.googleEventId = "external";
    item.recurringEventId = "series";
    executeCommand(
      data,
      me,
      { action: "meeting.save", values: { ...item, title: "Updated all day" } },
      now,
    );
    expect(item.title).toBe("Updated all day");
    expect(item.googleEventId).toBe("external");
    expect(item.startsAt).toBe("2026-09-26T23:00:00.000Z");
  });
  it("sends only one reminder per person for linked copies, and excludes Office for engineers", () => {
    const data = structuredClone(fixture),
      me = data.members[0];
    me.telegramChatId = "admin-chat";
    data.members[2].telegramChatId = "engineer-chat";
    data.meetings = [];
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: {
          ...event,
          participantIds: ["miguel", "vasco"],
          calendarTargets: ["office", "contacto", "personal:miguel"],
        },
      },
      now,
    );
    const daily = meetingReminders(data, now);
    expect(daily).toHaveLength(2);
    expect(daily[0].text.split("Shared appointment")).toHaveLength(2);
    expect(meetingReminders(data, "2026-09-27T08:00:00.000Z")).toHaveLength(2);
  });
  it("cleans generated Inbox and archives only the demo account, retaining history, idempotently", () => {
    const data = structuredClone(fixture),
      base = data.tasks[0];
    data.members.push({
      id: "engineer",
      name: "Engineer",
      role: "engineer",
      email: "old@local",
    });
    data.accounts.push({ memberId: "engineer", passwordHash: "unchanged" });
    data.inbox.push(
      {
        ...base,
        id: "generated",
        body: "Associar participantes internos: old",
        resolved: false,
        ownerId: "miguel",
      },
      {
        ...base,
        id: "real",
        body: "Important capture",
        resolved: false,
        ownerId: "miguel",
      },
    );
    data.tasks[0].ownerId = "engineer";
    data.tasks[0].createdBy = "engineer";
    expect(simplifyWorkspace(data, now).resolvedAutomaticInbox).toBe(1);
    expect(data.tasks[0].createdBy).toBe("engineer");
    expect(data.tasks[0].ownerId).toBe("miguel");
    expect(workspaceFor(data, data.members[0], now).members).toHaveLength(5);
    expect(data.inbox.find((i) => i.id === "real")?.resolved).toBe(false);
    expect(data.accounts.find((a) => a.memberId === "engineer")?.disabled).toBe(
      true,
    );
    expect(simplifyWorkspace(data, now).reassignedActiveRecords).toBe(0);
  });
  it("provides a scoped summary without needing an AI network call", async () => {
    const data = structuredClone(fixture),
      me = data.members[0];
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: { ...event, calendarTargets: ["office", "personal:miguel"] },
      },
      now,
    );
    const ctx = {
      repo: { read: async () => data },
      now: () => now,
    } as ServiceContext;
    const result = await summarizeMyWork(ctx, me);
    expect(result.text.split("Shared appointment")).toHaveLength(2);
    expect(result.text).toContain("To do");
  });
});

it("lets an engineer edit Contacto without changing or retaining a sync link to hidden Office", () => {
  const data = structuredClone(fixture),
    admin = data.members[0],
    engineer = data.members[2];
  executeCommand(
    data,
    admin,
    {
      action: "meeting.save",
      values: { ...event, calendarTargets: ["office", "contacto"] },
    },
    now,
  );
  const office = data.meetings.at(-2)!,
    contacto = data.meetings.at(-1)!;
  executeCommand(
    data,
    engineer,
    {
      action: "meeting.save",
      values: {
        ...event,
        id: contacto.id,
        version: contacto.version,
        title: "Updated Contacto",
        calendarTargets: ["contacto"],
      },
    },
    now,
  );
  expect(office.title).toBe(event.title);
  expect(contacto.title).toBe("Updated Contacto");
  expect(contacto.groupId).not.toBe(office.groupId);
  executeCommand(
    data,
    engineer,
    {
      action: "meeting.cancel",
      values: { id: contacto.id, version: contacto.version },
    },
    now,
  );
  expect(contacto.cancelled).toBe(true);
  expect(office.cancelled).toBe(false);
});
