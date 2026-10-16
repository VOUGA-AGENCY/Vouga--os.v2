import { describe, expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { workspaceFor } from "@/projections/workspace";
import { executeCommand } from "@/application/commands";
import { homeAgenda, quickTaskDueOn } from "@/domain/home";
import type { Meeting, Task } from "@/domain/model";
const now = "2026-10-16T10:00:00Z";
const seed = createSeed("isolated-test-password", now);
const base = {
  id: "test",
  version: 1,
  createdAt: now,
  updatedAt: now,
  createdBy: "miguel",
};
const task = (id: string, fields: Partial<Task> = {}): Task => ({
  ...base,
  id,
  title: id,
  body: "",
  status: "todo",
  ownerId: "miguel",
  dueOn: "2026-10-16",
  projectId: null,
  organizationId: null,
  ...fields,
});
const event = (id: string, fields: Partial<Meeting> = {}): Meeting => ({
  ...base,
  id,
  title: id,
  kind: "meeting",
  body: "",
  startsAt: "2026-10-16T11:00:00Z",
  endsAt: "2026-10-16T12:00:00Z",
  calendarOwnerId: "miguel",
  participantIds: ["miguel"],
  organizationId: null,
  projectId: null,
  cancelled: false,
  reminderMinutes: 10,
  calendarKey: "office",
  ...fields,
});
function fixture() {
  const data = structuredClone(seed);
  data.tasks = [];
  data.meetings = [];
  return data;
}
describe("Home agenda and quick task deadlines", () => {
  it("automatically sets today, this week and no-date deadlines in Lisbon", () => {
    expect(quickTaskDueOn("today", now)).toBe("2026-10-16");
    expect(quickTaskDueOn("week", "2026-10-12T10:00:00Z")).toBe("2026-10-16");
    expect(quickTaskDueOn("week", now)).toBe("2026-10-16");
    expect(quickTaskDueOn("week", "2026-10-17T10:00:00Z")).toBe("2026-10-18");
    expect(quickTaskDueOn("week", "2026-10-18T10:00:00Z")).toBe("2026-10-18");
    expect(quickTaskDueOn("undated", now)).toBeNull();
    expect(quickTaskDueOn("today", "2026-10-16T23:30:00Z")).toBe("2026-10-17");
    expect(quickTaskDueOn("today", "2026-12-16T23:30:00Z")).toBe("2026-12-16");
  });
  it("shows all authorized unfinished tasks for today and exactly the next seven days, without duplicates", () => {
    const data = fixture();
    data.tasks = [
      task("Today"),
      task("In progress", { status: "doing" }),
      task("Shared", { ownerId: "afonso", assigneeIds: ["afonso", "miguel"] }),
      task("Tomorrow", { dueOn: "2026-10-17" }),
      task("Seventh day", { dueOn: "2026-10-23" }),
      task("Outside", { dueOn: "2026-10-24" }),
      task("Undated", { dueOn: null }),
      task("Overdue", { dueOn: "2026-10-15" }),
      task("Finished", { status: "done" }),
      task("Other", { ownerId: "vasco" }),
    ];
    const agenda = homeAgenda(workspaceFor(data, data.members[0], now));
    expect(agenda.today.tasks.map((t) => t.id)).toEqual([
      "In progress",
      "Other",
      "Shared",
      "Today",
    ]);
    expect(agenda.next).toHaveLength(7);
    expect(agenda.next[0].day).toBe("2026-10-17");
    expect(agenda.next[6].day).toBe("2026-10-23");
    expect(agenda.next.flatMap((d) => d.tasks.map((t) => t.id))).toEqual([
      "Tomorrow",
      "Seventh day",
    ]);
  });
  it("includes visible tasks assigned to others, while keeping private and Board access restricted", () => {
    const data = fixture();
    const vasco = data.members.find((member) => member.id === "vasco")!;
    const miguel = data.members.find((member) => member.id === "miguel")!;
    const roque = data.members.find((member) => member.id === "afonso")!;
    data.projects[0].memberIds = [vasco.id];
    data.tasks = [
      task("Shared project", {
        ownerId: "afonso",
        assigneeIds: ["afonso"],
        projectId: data.projects[0].id,
        visibility: "team",
      }),
      task("Future shared", {
        ownerId: "afonso",
        assigneeIds: ["afonso"],
        projectId: data.projects[0].id,
        visibility: "team",
        dueOn: "2026-10-18",
      }),
      task("Roque Board", {
        ownerId: "afonso",
        assigneeIds: ["afonso"],
        visibility: "board",
      }),
      task("Miguel private", { visibility: "private" }),
      task("Roque private", {
        ownerId: "afonso",
        assigneeIds: ["afonso"],
        visibility: "private",
      }),
    ];
    const ids = (member: typeof miguel) =>
      homeAgenda(workspaceFor(data, member, now)).today.tasks.map((t) => t.id);
    expect(ids(vasco)).toEqual(["Shared project"]);
    expect(ids(miguel)).toEqual([
      "Miguel private",
      "Roque Board",
      "Shared project",
    ]);
    expect(ids(roque)).toEqual([
      "Roque Board",
      "Roque private",
      "Shared project",
    ]);
    expect(ids({ ...vasco, role: "admin" })).toEqual(["Shared project"]);
    expect(
      homeAgenda(workspaceFor(data, vasco, now)).next[1].tasks.map((t) => t.id),
    ).toEqual(["Future shared"]);
  });
  it("separates meetings by Lisbon date, preserves past meetings today and deduplicates grouped copies", () => {
    const data = fixture();
    data.meetings = [
      event("Today"),
      event("Copy", { groupId: "same" }),
      event("Copy duplicate", { groupId: "same" }),
      event("Earlier today", {
        startsAt: "2026-10-16T07:00:00Z",
        endsAt: "2026-10-16T08:00:00Z",
      }),
      event("Tomorrow", {
        startsAt: "2026-10-16T23:30:00Z",
        endsAt: "2026-10-17T00:00:00Z",
      }),
      event("Cancelled", { cancelled: true }),
      event("Other", { participantIds: ["afonso"] }),
      event("Personal", { calendarKey: "personal", participantIds: [] }),
      event("Pedro personal", {
        calendarKey: "personal",
        calendarOwnerId: "pedro",
        participantIds: ["pedro"],
        startsAt: "2026-10-19T09:00:00Z",
        endsAt: "2026-10-19T10:00:00Z",
      }),
      event("Office without participants", {
        participantIds: [],
        startsAt: "2026-10-19T13:30:00Z",
        endsAt: "2026-10-19T14:30:00Z",
      }),
    ];
    const agenda = homeAgenda(workspaceFor(data, data.members[0], now));
    expect(agenda.today.meetings.map((e) => e.id)).toEqual([
      "Earlier today",
      "Today",
      "Copy",
      "Other",
      "Personal",
    ]);
    expect(agenda.next[0].meetings.map((e) => e.id)).toEqual(["Tomorrow"]);
    expect(agenda.next[2].meetings.map((e) => e.id)).toEqual([
      "Pedro personal",
      "Office without participants",
    ]);
  });
  it("handles all-day spans with an exclusive end date and excludes events ending at midnight", () => {
    const data = fixture();
    data.meetings = [
      event("All day", {
        allDay: true,
        startsAt: "2026-10-15T23:00:00Z",
        endsAt: "2026-10-17T23:00:00Z",
      }),
      event("Ends at midnight", {
        startsAt: "2026-10-15T20:00:00Z",
        endsAt: "2026-10-15T23:00:00Z",
      }),
    ];
    const agenda = homeAgenda(workspaceFor(data, data.members[0], now));
    expect(agenda.today.meetings.map((e) => e.id)).toEqual(["All day"]);
    expect(agenda.next[0].meetings.map((e) => e.id)).toEqual(["All day"]);
    expect(agenda.next[1].meetings).toEqual([]);
  });
  it("uses existing commands to create tasks with each preset and complete them", () => {
    const data = fixture(),
      me = data.members[0];
    for (const timing of ["today", "week", "undated"] as const)
      executeCommand(
        data,
        me,
        {
          action: "task.save",
          values: {
            title: timing,
            body: "Context",
            assigneeIds: ["miguel"],
            visibility: "private",
            dueOn: quickTaskDueOn(timing, now),
          },
        },
        now,
      );
    expect(data.tasks.map((t) => t.dueOn)).toEqual([
      "2026-10-16",
      "2026-10-16",
      null,
    ]);
    expect(
      data.tasks.every(
        (t) => t.status === "todo" && t.visibility === "private",
      ),
    ).toBe(true);
    const target = data.tasks[0];
    executeCommand(
      data,
      me,
      {
        action: "task.status",
        values: { id: target.id, version: target.version, status: "done" },
      },
      now,
    );
    expect(
      homeAgenda(workspaceFor(data, me, now)).today.tasks.map((t) => t.title),
    ).toEqual(["week"]);
  });
  it("uses the authorized snapshot so engineers cannot see Board tasks or Office events", () => {
    const data = fixture();
    const engineer = data.members.find((m) => m.id === "vasco")!;
    data.tasks = [
      task("Board", { visibility: "board", assigneeIds: ["miguel", "afonso"] }),
      task("Vasco private", { visibility: "private", ownerId: "vasco" }),
    ];
    data.meetings = [
      event("Office", { participantIds: ["vasco"] }),
      event("Contacto", { calendarKey: "contacto", participantIds: ["ana"] }),
      event("Ana private", {
        calendarKey: "personal",
        calendarOwnerId: "ana",
        participantIds: ["ana"],
      }),
    ];
    const agenda = homeAgenda(workspaceFor(data, engineer, now));
    expect(agenda.today.tasks.map((t) => t.id)).toEqual(["Vasco private"]);
    expect(agenda.today.meetings.map((e) => e.id)).toEqual(["Contacto"]);
  });
});

describe("Four-state task workflow", () => {
  it("normalizes legacy backlog submissions and supports each new column state", () => {
    const data = fixture(),
      me = data.members.find((m) => m.id === "miguel")!;
    for (const status of ["backlog", "todo", "doing", "review", "done"])
      executeCommand(
        data,
        me,
        {
          action: "task.save",
          values: {
            title: status,
            status,
            assigneeIds: [me.id],
            visibility: "private",
          },
        },
        now,
      );
    expect(data.tasks.map((t) => t.status)).toEqual([
      "todo",
      "todo",
      "doing",
      "review",
      "done",
    ]);
    const target = data.tasks[2];
    executeCommand(
      data,
      me,
      {
        action: "task.status",
        values: { id: target.id, version: target.version, status: "backlog" },
      },
      now,
    );
    expect(target.status).toBe("todo");
  });
});
