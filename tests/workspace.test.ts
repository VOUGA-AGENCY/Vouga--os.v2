import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { emptyDraft, parseCapture } from "@/domain/capture";
import { workspaceFor } from "@/projections/workspace";
import { calendarExport } from "@/projections/calendar-export";
import {
  addDays,
  dateKey,
  isDateKey,
  localDateTime,
  toInstant,
} from "@/domain/time";
import type { Member, Store } from "@/domain/model";

const now = "2026-09-24T08:00:00.000Z";
const fixture = createSeed("test-only-password", now);
let data: Store;
let admin: Member;
let engineer: Member;
beforeEach(() => {
  data = structuredClone(fixture);
  admin = data.members[0];
  engineer = data.members[2];
});
const run = (
  action: string,
  values: Record<string, unknown>,
  actor?: Member,
  at = now,
) => executeCommand(data, actor ?? admin, { action, values }, at);

describe("role boundaries and projections", () => {
  it("returns only the engineer's projects and permitted tasks", () => {
    const view = workspaceFor(data, engineer, now);
    expect(view.projects.map((p) => p.id)).toEqual(["operations"]);
    expect(view.tasks.map((t) => t.id)).toEqual(["flow", "access"]);
    expect(JSON.stringify(view)).not.toContain("passwordHash");
    expect(view).not.toHaveProperty("sessions");
    expect(view.organizations).toHaveLength(3);
  });
  it("does not trust a role forged by a caller", () => {
    expect(() =>
      run(
        "task.status",
        { id: "proposal", version: 1, status: "done" },
        { ...engineer, role: "admin" },
      ),
    ).toThrow("do not have access");
  });
  it("denies reading via writes to an unrelated project", () => {
    expect(() =>
      run(
        "project.update",
        { projectId: "discovery", body: "forged" },
        engineer,
      ),
    ).toThrow("do not have access");
    expect(() =>
      run("task.save", { title: "x", projectId: "discovery" }, engineer),
    ).toThrow("do not have access");
  });
  it("allows an engineer to book Contacto for an administrator", () => {
    run(
      "meeting.save",
      {
        title: "Reunião delegada",
        calendarOwnerId: "afonso",
        calendarKey: "contacto",
        participantIds: ["afonso"],
        startsAt: "2026-09-25T14:00",
        endsAt: "2026-09-25T14:30",
      },
      engineer,
    );
    const meeting = data.meetings.at(-1)!;
    expect(meeting.createdBy).toBe("vasco");
    expect(meeting.calendarOwnerId).toBe("afonso");
    expect(workspaceFor(data, data.members[1], now).meetings).toContainEqual(
      meeting,
    );
    expect(workspaceFor(data, engineer, now).meetings).toContainEqual(meeting);
  });
  it("only shows other people's calendar events to engineers when explicitly shared", () => {
    run("meeting.save", {
      title: "Planeamento privado",
      visibility: "private",
      startsAt: "2026-09-25T10:00",
      endsAt: "2026-09-25T10:30",
    });
    const privateMeeting = data.meetings.at(-1)!;
    run("meeting.save", {
      title: "Planeamento de equipa",
      calendarKey: "contacto",
      startsAt: "2026-09-25T11:00",
      endsAt: "2026-09-25T11:30",
      visibility: "team",
    });
    const sharedMeeting = data.meetings.at(-1)!;
    const view = workspaceFor(data, engineer, now);
    expect(view.meetings).not.toContainEqual(privateMeeting);
    expect(view.meetings).toContainEqual(sharedMeeting);
  });
  it("keeps a private note private even from another admin", () => {
    run(
      "note.save",
      { title: "Pessoal", body: "contexto privado", visibility: "private" },
      engineer,
    );
    const note = data.notes.at(-1)!;
    expect(
      workspaceFor(data, admin, now).notes.some((n) => n.id === note.id),
    ).toBe(false);
    expect(() => run("note.pin", { id: note.id, version: 1 })).toThrow(
      "do not have access",
    );
  });
  it("prevents a reader from making somebody else's shared note private", () => {
    expect(() =>
      run("note.save", { ...data.notes[0], visibility: "private" }, engineer),
    ).toThrow("do not have access");
  });
  it("rejects invalid foreign keys and personal task assignment by an engineer", () => {
    expect(() => run("task.save", { title: "x", ownerId: "missing" })).toThrow(
      "Select a team member",
    );
    expect(() =>
      run("task.save", { title: "x", ownerId: "miguel" }, engineer),
    ).toThrow("do not have access");
    expect(() =>
      run("organization.save", { name: "x", ownerId: "unknown" }),
    ).toThrow("Select a team member");
  });
});

describe("ordinary work", () => {
  it("creates a task with only its title and completes it without extra evidence", () => {
    run("task.save", { title: "Enviar proposta" }, engineer);
    const task = data.tasks.at(-1)!;
    expect(task.ownerId).toBe("vasco");
    expect(task.dueOn).toBeNull();
    run("task.status", { id: task.id, version: 1, status: "done" }, engineer);
    expect(task.status).toBe("done");
  });
  it("persists task size (xs, s, m, l, xl) and priority, rejecting invalid sizes", () => {
    run(
      "task.save",
      { title: "Refactor API", size: "m", priority: "high" },
      engineer,
    );
    const task = data.tasks.at(-1)!;
    expect(task.size).toBe("m");
    expect(task.priority).toBe("high");

    run(
      "task.save",
      { id: task.id, version: task.version, title: "Refactor API", size: "xl" },
      engineer,
    );
    expect(task.size).toBe("xl");

    run(
      "task.save",
      { id: task.id, version: task.version, title: "Refactor API", size: "" },
      engineer,
    );
    expect(task.size).toBeNull();

    expect(() =>
      run("task.save", { title: "Invalid size", size: "huge" }, engineer),
    ).toThrow("Size");
  });
  it("enforces issue linking in todo/backlog and PR linking only when in progress", () => {
    run("pr.save", {
      projectId: "operations",
      title: "Flow PR",
      url: "https://github.com/example/repo/pull/99",
    });
    const pr = data.pullRequests.find((item) => item.number === 99)!;
    const task = data.tasks.find((item) => item.id === "flow")!;

    run("task.status", { id: task.id, version: task.version, status: "todo" }, engineer);
    expect(() =>
      run("task.linkPR", { id: task.id, version: task.version, pullRequestId: pr.id }, engineer),
    ).toThrow("in progress");

    run(
      "task.linkIssue",
      {
        id: task.id,
        version: task.version,
        issueNumber: 42,
        issueUrl: "https://github.com/example/repo/issues/42",
      },
      engineer,
    );
    expect(task.issueNumber).toBe(42);
    expect(task.issueUrl).toBe("https://github.com/example/repo/issues/42");

    run("task.status", { id: task.id, version: task.version, status: "doing" }, engineer);
    run("task.linkPR", { id: task.id, version: task.version, pullRequestId: pr.id }, engineer);
    expect(task.pullRequestId).toBe(pr.id);

    // Unlink PR
    run("task.linkPR", { id: task.id, version: task.version, pullRequestId: null }, engineer);
    expect(task.pullRequestId).toBeNull();

    // Link via URL
    run(
      "task.linkPR",
      {
        id: task.id,
        version: task.version,
        pullRequestUrl: "https://github.com/example/repo/pull/101",
      },
      engineer,
    );
    expect(task.pullRequestId).toBeTruthy();
    const createdPr = data.pullRequests.find((p) => p.number === 101);
    expect(createdPr).toBeDefined();
    expect(task.pullRequestId).toBe(createdPr?.id);
  });
  it("supports assigning multiple people to a task and enforces project permissions", () => {
    // Engineer cannot assign a non-project member (afonso is not in operations)
    expect(() =>
      run(
        "task.save",
        {
          title: "Invalid assignment",
          projectId: "operations",
          assigneeIds: ["vasco", "afonso"],
        },
        engineer,
      ),
    ).toThrow("do not have access");

    // Admin cannot assign someone who is not on the project team
    expect(() =>
      run(
        "task.save",
        {
          title: "Invalid assignment by admin",
          projectId: "operations",
          assigneeIds: ["vasco", "afonso"],
        },
        admin,
      ),
    ).toThrow("Add the assignee to the project team");

    // Engineer can assign members in operations (vasco and miguel)
    run(
      "task.save",
      {
        title: "Multi-assignee feature",
        projectId: "operations",
        assigneeIds: ["vasco", "miguel"],
      },
      engineer,
    );
    const task = data.tasks.find((t) => t.title === "Multi-assignee feature")!;
    expect(task.ownerId).toBe("vasco");
    expect(task.assigneeIds).toEqual(["vasco", "miguel"]);

    // Saving with invalid URL for PR should fail
    expect(() =>
      run(
        "task.save",
        {
          id: task.id,
          version: task.version,
          title: "Multi-assignee feature",
          pullRequestUrl: "not-a-pr-url",
        },
        engineer,
      ),
    ).toThrow("GitHub link");

    // Saving with PR url while backlog should fail
    expect(() =>
      run(
        "task.save",
        {
          id: task.id,
          version: task.version,
          title: "Multi-assignee feature",
          status: "backlog",
          pullRequestUrl: "https://github.com/example/repo/pull/102",
        },
        engineer,
      ),
    ).toThrow("in progress");

    // Saving with PR url when doing should succeed and link the PR
    run(
      "task.save",
      {
        id: task.id,
        version: task.version,
        title: "Multi-assignee feature",
        status: "doing",
        pullRequestUrl: "https://github.com/example/repo/pull/102",
      },
      engineer,
    );
    expect(task.status).toBe("doing");
    const pr102 = data.pullRequests.find((p) => p.number === 102);
    expect(pr102).toBeDefined();
    expect(task.pullRequestId).toBe(pr102?.id);
  });
  it("keeps task comments and status changes in one visible timeline", () => {
    run(
      "task.comment",
      { taskId: "flow", body: "API pronta para revisão" },
      engineer,
    );
    run("task.status", { id: "flow", version: 2, status: "review" }, engineer);
    const view = workspaceFor(data, engineer, now);
    expect(
      view.taskComments.some(
        (item) =>
          item.taskId === "flow" && item.body === "API pronta para revisão",
      ),
    ).toBe(true);
    expect(
      view.taskActivity.some(
        (item) => item.taskId === "flow" && item.body.includes("Review"),
      ),
    ).toBe(true);
    expect(
      workspaceFor(data, admin, now).taskComments.some(
        (item) => item.taskId === "flow",
      ),
    ).toBe(true);
  });
  it("requires a status note and records the CRM transition", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    expect(() =>
      run("organization.stage", {
        id: organization.id,
        version: organization.version,
        stage: "meeting",
      }),
    ).toThrow("Status note");
    run("organization.stage", {
      id: organization.id,
      version: organization.version,
      stage: "meeting",
      note: "Reunião com a direção",
    });
    expect(organization.stage).toBe("meeting");
    expect(data.interactions.at(-1)).toMatchObject({
      organizationId: "norte",
      stageTo: "meeting",
      body: "Reunião com a direção",
    });
  });
  it("links a company event to its calendar and timeline", () => {
    run("meeting.save", {
      title: "Reunião Santosom",
      organizationId: "norte",
      startsAt: "2026-09-25T10:00",
      endsAt: "2026-09-25T10:30",
      participantIds: ["afonso"],
    });
    const meeting = data.meetings.at(-1)!;
    expect(data.interactions.at(-1)).toMatchObject({
      organizationId: "norte",
      meetingId: meeting.id,
    });
    expect(workspaceFor(data, data.members[1], now).meetings).toContainEqual(
      meeting,
    );
  });
  it("rejects stale edits without replacing newer content", () => {
    run("task.status", { id: "proposal", version: 1, status: "doing" });
    expect(() =>
      run("task.save", { id: "proposal", version: 1, title: "old" }),
    ).toThrow("changed in the meantime");
    expect(data.tasks[0].status).toBe("doing");
  });
  it("retains history while setting a CRM next step and follow-up", () => {
    run(
      "interaction.add",
      {
        organizationId: "norte",
        version: 1,
        body: "Cliente pediu nova data",
        nextStep: "Ligar ao Pedro",
        followUpOn: "2026-10-01",
        stage: "contacted",
      },
      engineer,
    );
    expect(data.interactions).toHaveLength(2);
    expect(data.organizations[1].followUpOn).toBe("2026-10-01");
  });
  it("rejects zero-length and invalid calendar ranges", () => {
    expect(() =>
      run("meeting.save", {
        title: "x",
        startsAt: "2026-09-25T10:00",
        endsAt: "2026-09-25T10:00",
      }),
    ).toThrow("end must be after the start");
    expect(() =>
      run("meeting.save", {
        title: "x",
        startsAt: "2026-02-30T10:00",
        endsAt: "2026-03-01T11:00",
      }),
    ).toThrow("Invalid date or time");
  });
  it("accepts only GitHub PR URLs and avoids duplicate links", () => {
    expect(() =>
      run("pr.save", {
        projectId: "operations",
        title: "x",
        url: "javascript:alert(1)",
      }),
    ).toThrow("GitHub link");
    run("pr.save", {
      projectId: "operations",
      title: "Fluxo",
      url: "https://github.com/example/repo/pull/12",
    });
    expect(data.pullRequests[0].number).toBe(12);
    expect(() =>
      run("pr.save", {
        projectId: "operations",
        title: "Fluxo",
        url: "https://github.com/example/repo/pull/12/",
      }),
    ).toThrow("already linked");
  });
});

describe("text capture", () => {
  it("recognizes Portuguese dates, project/organization and explicit calendar owner", () => {
    const [draft] = parseCapture(
      "Reunião com a Fábrica do Vale amanhã às 14h30 para o Roque",
      data,
      engineer,
      now,
    );
    expect(draft).toMatchObject({
      kind: "meeting",
      ownerId: "afonso",
      organizationId: "vale",
      date: "2026-09-25",
      time: "14:30",
    });
  });
  it("keeps ambiguous input in Inbox without losing it", () => {
    const [draft] = parseCapture(
      "Talvez devêssemos experimentar outra abordagem",
      data,
      admin,
      now,
    );
    expect(draft.kind).toBe("inbox");
    expect(draft.body).toBe("Talvez devêssemos experimentar outra abordagem");
    expect(draft.date).toBe("");
  });
  it("separates independent lines and never invents a meeting time", () => {
    const drafts = parseCapture(
      "Enviar proposta amanhã\nReunião com a equipa sexta",
      data,
      admin,
      now,
    );
    expect(drafts.map((d) => d.kind)).toEqual(["task", "meeting"]);
    expect(drafts[1].time).toBe("");
  });
  it("proposes a company, person and follow-up from one commercial note", () => {
    const [draft] = parseCapture(
      "Conheci o João da MetalX. Têm problemas de stock. Quer falar connosco em outubro. Lembra-me dia 2 de outubro.",
      data,
      admin,
      now,
    );
    expect(draft).toMatchObject({
      kind: "contact",
      title: "MetalX",
      person: "João",
      date: "2026-10-02",
      nextStep: "Retomar contacto",
    });
    const result = run("capture.commit", { key: "metalx", drafts: [draft] });
    const organization = data.organizations.find(
      (item) => item.name === "MetalX",
    );
    expect(result.ids).toContain(organization?.id);
    expect(organization?.followUpOn).toBe("2026-10-02");
    expect(
      data.contacts.some(
        (person) =>
          person.organizationId === organization?.id && person.name === "João",
      ),
    ).toBe(true);
  });
  it("proposes a linked meeting and preparation task from one sentence", () => {
    const drafts = parseCapture(
      "Marca uma reunião com a Santosom terça às 10 e cria uma tarefa para preparar a apresentação no dia anterior.",
      data,
      admin,
      now,
    );
    expect(drafts.map((draft) => draft.kind)).toEqual(["meeting", "task"]);
    expect(drafts[0].time).toBe("10:00");
    expect(drafts[1].date).toBe("2026-09-28");
    run("capture.commit", { key: "santosom", drafts });
    const organization = data.organizations.find(
      (item) => item.name === "Santosom",
    );
    expect(
      data.meetings.some(
        (meeting) => meeting.organizationId === organization?.id,
      ),
    ).toBe(true);
    expect(
      data.tasks.some(
        (task) =>
          task.organizationId === organization?.id &&
          task.dueOn === "2026-09-28",
      ),
    ).toBe(true);
  });
  it("proposes a CRM status change with a required history note", () => {
    const [draft] = parseCapture(
      "Passei na Norte Metal. Muda o estado para Talking e coloca uma nota a dizer que querem voltar a falar em outubro.",
      data,
      admin,
      now,
    );
    expect(draft).toMatchObject({
      kind: "crm",
      organizationId: "norte",
      stage: "contacted",
    });
    run("capture.commit", { key: "crm-transition", drafts: [draft] });
    expect(data.organizations.find((item) => item.id === "norte")?.stage).toBe(
      "contacted",
    );
    expect(data.interactions.at(-1)?.body).toContain("querem voltar a falar");
  });
  it("commits idempotently even if a response is lost", () => {
    const drafts = [
      { ...emptyDraft(admin), kind: "task", title: "Nova tarefa" },
    ];
    const first = run("capture.commit", { key: "one", drafts });
    const count = data.tasks.length;
    const second = run("capture.commit", { key: "one", drafts });
    expect(second.ids).toEqual(first.ids);
    expect(data.tasks).toHaveLength(count);
  });
  it("creates delegated meetings from reviewed capture fields", () => {
    run(
      "capture.commit",
      {
        key: "meeting",
        drafts: [
          {
            ...emptyDraft(engineer),
            kind: "meeting",
            title: "Revisão",
            ownerId: "vasco",
            date: "2026-09-25",
            time: "15:00",
            duration: "45",
          },
        ],
      },
      engineer,
    );
    const meeting = data.meetings.at(-1)!;
    expect(meeting.startsAt).toBe("2026-09-25T14:00:00.000Z");
    expect(meeting.participantIds).toEqual(["vasco"]);
  });
});

describe("Home without notification duplication", () => {
  it("keeps approaching meetings, deadlines and CRM follow-ups out of OS alerts", () => {
    run("meeting.save", {
      title: "Reunião",
      startsAt: "2026-09-24T10:00",
      endsAt: "2026-09-24T10:30",
    });
    expect(workspaceFor(data, admin, now).alerts).toEqual([]);
    expect(workspaceFor(data, engineer, now).alerts).toEqual([]);
  });
});

describe("Lisbon time and export", () => {
  it("converts summer and winter wall times independently of machine timezone", () => {
    expect(toInstant("2026-09-24T10:00")).toBe("2026-09-24T09:00:00.000Z");
    expect(toInstant("2026-12-24T10:00")).toBe("2026-12-24T10:00:00.000Z");
    expect(localDateTime("2026-09-24T09:00:00.000Z")).toBe("2026-09-24T10:00");
  });
  it("rejects invalid dates and the spring DST gap", () => {
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(toInstant("2026-03-29T01:30")).toBeNull();
    expect(toInstant("2026-09-24T25:00")).toBeNull();
  });
  it("handles month boundaries and Lisbon's midnight", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(dateKey("2026-09-24T23:30Z")).toBe("2026-09-25");
  });
  it("escapes ICS newlines and folds by UTF-8 bytes", () => {
    data.meetings[0].title = "Á".repeat(80) + ",\nInjected";
    data.meetings[1].cancelled = true;
    const ics = calendarExport(data.meetings, now);
    expect(ics).not.toContain("UID:review@");
    expect(ics).toContain("\\,\\nInjected");
    expect(
      ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
  });
});

describe("Home notes and personal calendars", () => {
  it("creates private notes by default and shares only with named recipients", () => {
    const vasco = data.members.find((member) => member.id === "vasco")!;
    const ana = data.members.find((member) => member.id === "ana")!;
    run("note.save", { title: "Só Vasco" }, vasco);
    const personal = data.notes.at(-1)!;
    expect(workspaceFor(data, admin, now).notes).not.toContainEqual(personal);
    run(
      "note.save",
      { title: "Para Ana", visibility: "shared", recipientIds: [ana.id] },
      vasco,
    );
    const shared = data.notes.at(-1)!;
    expect(workspaceFor(data, vasco, now).notes).toContainEqual(shared);
    expect(workspaceFor(data, ana, now).notes).toContainEqual(shared);
    expect(workspaceFor(data, admin, now).notes).not.toContainEqual(shared);
    expect(() => run("note.save", { ...shared, body: "Changed" }, ana)).toThrow(
      "do not have access",
    );
    run("note.save", { ...shared, visibility: "private" }, vasco);
    expect(
      workspaceFor(data, ana, now).notes.some((note) => note.id === shared.id),
    ).toBe(false);
  });
  it("requires a real recipient for shared notes", () => {
    expect(() =>
      run("note.save", {
        title: "Missing recipient",
        visibility: "shared",
        recipientIds: [],
      }),
    ).toThrow("Select at least");
    expect(() =>
      run("note.save", {
        title: "Invalid recipient",
        visibility: "shared",
        recipientIds: ["unknown"],
      }),
    ).toThrow();
  });
  it("allows scheduling for selected participants without giving the organizer an alert", () => {
    const vasco = data.members.find((member) => member.id === "vasco")!;
    const ana = data.members.find((member) => member.id === "ana")!;
    run(
      "meeting.save",
      {
        title: "Reunião da Ana",
        calendarKey: "contacto",
        startsAt: "2026-09-24T10:00",
        endsAt: "2026-09-24T10:30",
        participantIds: [ana.id],
      },
      vasco,
    );
    const meeting = data.meetings.at(-1)!;
    expect(workspaceFor(data, ana, now).meetings).toContainEqual(meeting);
    expect(workspaceFor(data, ana, now).alerts).toEqual([]);
    expect(
      workspaceFor(data, vasco, now).alerts.some(
        (alert) => alert.id === meeting.id,
      ),
    ).toBe(false);
    expect(() =>
      run("meeting.save", {
        title: "Empty",
        startsAt: "2026-09-24T10:00",
        endsAt: "2026-09-24T10:30",
        participantIds: [],
      }),
    ).not.toThrow();
  });
  it("provides the six named profiles and individual login accounts", () => {
    for (const id of ["miguel", "afonso", "vasco", "patrick", "ana", "pedro"]) {
      expect(data.members.find((member) => member.id === id)?.role).toBe(
        ["miguel", "afonso"].includes(id) ? "admin" : "engineer",
      );
      expect(data.accounts.some((account) => account.memberId === id)).toBe(
        true,
      );
    }
  });
});
