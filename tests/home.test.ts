import { describe, expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { workspaceFor } from "@/projections/workspace";
import { executeCommand } from "@/application/commands";
import { homeFor } from "@/domain/home";
import type { Meeting, PullRequest, Task } from "@/domain/model";
const now = "2026-10-05T10:00:00Z";
const seed = createSeed("test-password", now);
const fixture = () => structuredClone(seed);
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
  dueOn: null,
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
  startsAt: "2026-10-05T11:00:00Z",
  endsAt: "2026-10-05T12:00:00Z",
  calendarOwnerId: "miguel",
  participantIds: ["miguel"],
  organizationId: null,
  projectId: null,
  cancelled: false,
  reminderMinutes: 10,
  calendarKey: "office",
  ...fields,
});
describe("operational Home", () => {
  it("puts in-progress first, includes undated shared assignments and limits the list to five", () => {
    const data = fixture();
    data.tasks = [
      task("overdue", { dueOn: "2026-10-01" }),
      task("doing-no-date", { status: "doing" }),
      task("doing-due", { status: "doing", dueOn: "2026-10-05" }),
      task("shared", { ownerId: "afonso", assigneeIds: ["afonso", "miguel"] }),
      task("more-1"),
      task("more-2"),
      task("someone-else", { ownerId: "ana" }),
      task("review", { status: "review" }),
      task("done", { status: "done" }),
    ];
    const result = homeFor(workspaceFor(data, data.members[0], now));
    expect(result.tasks).toHaveLength(5);
    expect(result.tasks.slice(0, 3).map((item) => item.id)).toEqual([
      "doing-due",
      "doing-no-date",
      "overdue",
    ]);
    expect(result.activeTasks.map((item) => item.id)).toContain("shared");
    expect(result.activeTasks).toHaveLength(6);
    expect(result.reviewTasks.map((item) => item.id)).toEqual(["review"]);
  });
  it("shows only accessible, assigned commitments; deduplicates copies after filtering participants and advances with time", () => {
    const data = fixture();
    data.meetings = [
      event("past", { endsAt: "2026-10-05T09:00:00Z" }),
      event("cancelled", { cancelled: true }),
      event("other", { participantIds: ["afonso"] }),
      event("unassigned-copy", { groupId: "same", participantIds: ["afonso"] }),
      event("my-copy", { groupId: "same" }),
      event("personal", {
        calendarKey: "personal",
        participantIds: [],
        startsAt: "2026-10-05T13:00:00Z",
        endsAt: "2026-10-05T14:00:00Z",
      }),
      event("tomorrow", {
        startsAt: "2026-10-06T11:00:00Z",
        endsAt: "2026-10-06T12:00:00Z",
      }),
    ];
    const view = workspaceFor(data, data.members[0], now);
    expect(homeFor(view).nextEvent?.id).toBe("my-copy");
    expect(homeFor(view).todayEvents.map((item) => item.id)).toEqual([
      "my-copy",
      "personal",
    ]);
    expect(homeFor(view, "2026-10-05T12:30:00Z").nextEvent?.id).toBe(
      "personal",
    );
    expect(homeFor(view, "2026-10-05T14:30:00Z").nextEvent?.id).toBe(
      "tomorrow",
    );
  });
  it("matches exact GitHub identity case-insensitively and ignores merged/draft requests", () => {
    const data = fixture();
    data.members[0].githubLogin = "MiguelGit";
    const projectId = data.projects[0].id;
    const pr = (
      id: string,
      fields: Partial<PullRequest> = {},
    ): PullRequest => ({
      ...base,
      id,
      title: id,
      number: 1,
      projectId,
      url: "https://github.com/team/repo/pull/1",
      state: "open",
      reviewRequested: ["miguelgit"],
      ...fields,
    });
    data.pullRequests = [
      pr("mine"),
      pr("other", { reviewRequested: ["roquegit"] }),
      pr("merged", { state: "merged" }),
      pr("draft", { state: "draft" }),
    ];
    data.tasks = [task("review", { status: "review" })];
    data.pendingActions = [
      {
        id: "confirmation",
        memberId: "miguel",
        summary: "Confirm",
        state: "pending",
        action: "task.delete",
        values: {},
        expiresAt: "2026-10-06T00:00:00Z",
        createdAt: now,
      },
    ];
    const home = homeFor(workspaceFor(data, data.members[0], now));
    expect(home.reviewPRs.map((item) => item.id)).toEqual(["mine"]);
    expect(home.needsMeCount).toBe(3);
    expect(
      homeFor(workspaceFor(data, data.members[0], now), "2026-10-06T00:01:00Z")
        .pendingActions,
    ).toEqual([]);
    delete data.members[0].githubLogin;
    expect(homeFor(workspaceFor(data, data.members[0], now)).reviewPRs).toEqual(
      [],
    );
  });
  it("uses existing follow-up dates in Lisbon, excluding other owners, archived and future contacts", () => {
    const data = fixture();
    const company = data.organizations[0];
    data.organizations = [
      { ...company, id: "today", followUpOn: "2026-10-06" },
      { ...company, id: "late", followUpOn: "2026-10-05" },
      { ...company, id: "future", followUpOn: "2026-10-07" },
      { ...company, id: "no-date", followUpOn: null },
      { ...company, id: "archived", followUpOn: "2026-10-05", archived: true },
      { ...company, id: "other", followUpOn: "2026-10-05", ownerId: "vasco" },
    ];
    const home = homeFor(
      workspaceFor(data, data.members[0], "2026-10-05T23:30:00Z"),
    );
    expect(home.today).toBe("2026-10-06");
    expect(home.followUps.map((item) => item.id)).toEqual(["late", "today"]);
  });
  it("supports direct start/complete with the usual version, permission and Activity safeguards", () => {
    const data = fixture();
    data.tasks = [task("action")];
    executeCommand(
      data,
      data.members[0],
      {
        action: "task.status",
        values: { id: "action", version: 1, status: "doing" },
      },
      now,
    );
    expect(
      homeFor(workspaceFor(data, data.members[0], now)).tasks[0].status,
    ).toBe("doing");
    executeCommand(
      data,
      data.members[0],
      {
        action: "task.status",
        values: { id: "action", version: 2, status: "done" },
      },
      now,
    );
    expect(homeFor(workspaceFor(data, data.members[0], now)).tasks).toEqual([]);
    expect(
      data.activity.some(
        (item) => item.type === "task.completed" && item.entityId === "action",
      ),
    ).toBe(true);
    expect(() =>
      executeCommand(
        data,
        data.members[0],
        {
          action: "task.status",
          values: { id: "action", version: 1, status: "doing" },
        },
        now,
      ),
    ).toThrow("changed");
  });
  it("validates GitHub mapping and prevents changing another user's identity", () => {
    const data = fixture();
    const me = data.members[0];
    executeCommand(
      data,
      me,
      { action: "member.github", values: { githubLogin: "MiguelGit" } },
      now,
    );
    expect(workspaceFor(data, me, now).me.githubLogin).toBe("MiguelGit");
    expect(() =>
      executeCommand(
        data,
        me,
        {
          action: "member.github",
          values: { memberId: "afonso", githubLogin: "Other" },
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      executeCommand(
        data,
        me,
        {
          action: "member.github",
          values: { githubLogin: "https://github.com/me" },
        },
        now,
      ),
    ).toThrow("username");
    expect(() =>
      executeCommand(
        data,
        data.members[1],
        { action: "member.github", values: { githubLogin: "miguelgit" } },
        now,
      ),
    ).toThrow("already linked");
  });
});
