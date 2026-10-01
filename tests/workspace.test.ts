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
    ).toThrow("Não tens acesso");
  });
  it("denies reading via writes to an unrelated project", () => {
    expect(() =>
      run(
        "project.update",
        { projectId: "discovery", body: "forged" },
        engineer,
      ),
    ).toThrow("Não tens acesso");
    expect(() =>
      run("task.save", { title: "x", projectId: "discovery" }, engineer),
    ).toThrow("Não tens acesso");
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
      "Não tens acesso",
    );
  });
  it("prevents a reader from making somebody else's shared note private", () => {
    expect(() =>
      run("note.save", { ...data.notes[0], visibility: "private" }, engineer),
    ).toThrow("Não tens acesso");
  });
  it("rejects invalid foreign keys and personal task assignment by an engineer", () => {
    expect(() => run("task.save", { title: "x", ownerId: "missing" })).toThrow(
      "pessoa da equipa",
    );
    expect(() =>
      run("task.save", { title: "x", ownerId: "miguel" }, engineer),
    ).toThrow("Não tens acesso");
    expect(() =>
      run("organization.save", { name: "x", ownerId: "unknown" }),
    ).toThrow("pessoa da equipa");
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
    ).toThrow("Nota de estado");
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
  it("pins and unpins a company without touching its status history", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    const interactions = data.interactions.length;
    run("organization.pin", {
      id: organization.id,
      version: organization.version,
    });
    expect(organization.pinned).toBe(true);
    run("organization.pin", {
      id: organization.id,
      version: organization.version,
    });
    expect(organization.pinned).toBe(false);
    expect(data.interactions).toHaveLength(interactions);
    expect(
      data.activity.some(
        (event) => event.companyId === "norte" && event.type !== "company.created",
      ),
    ).toBe(false);
  });
  it("saves a company location and keeps it when a save omits it", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    const details = {
      id: organization.id,
      name: organization.name,
      stage: organization.stage,
      ownerId: organization.ownerId,
    };
    run("organization.save", {
      ...details,
      version: organization.version,
      location: "  Águeda, Aveiro ",
    });
    expect(organization.location).toBe("Águeda, Aveiro");
    run("organization.save", { ...details, version: organization.version });
    expect(organization.location).toBe("Águeda, Aveiro");
  });
  it("keeps coordinates with their address and drops them when it moves", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    const details = {
      id: organization.id,
      name: organization.name,
      stage: organization.stage,
      ownerId: organization.ownerId,
    };
    run("organization.save", {
      ...details,
      version: organization.version,
      location: "Maia",
      address: "Rua Engenheiro Frederico Ulrich, 4470-605 Maia",
      coordinates: { lat: 41.2566, lng: -8.6481 },
    });
    expect(organization.coordinates).toEqual({ lat: 41.2566, lng: -8.6481 });
    run("organization.save", { ...details, version: organization.version });
    expect(organization.coordinates).toEqual({ lat: 41.2566, lng: -8.6481 });
    run("organization.save", {
      ...details,
      version: organization.version,
      address: "Outra morada, 4470-001 Maia",
    });
    expect(organization.coordinates).toBeUndefined();
    expect(() =>
      run("organization.save", {
        ...details,
        version: organization.version,
        coordinates: { lat: 51.5, lng: -0.12 },
      }),
    ).toThrow("Coordenadas inválidas");
  });
  it("validates NIFs, keeps them unique and stores other facilities", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    const details = {
      id: organization.id,
      name: organization.name,
      stage: organization.stage,
      ownerId: organization.ownerId,
    };
    expect(() =>
      run("organization.save", { ...details, version: organization.version, nif: "502541866" }),
    ).toThrow("dígito de controlo");
    run("organization.save", {
      ...details,
      version: organization.version,
      nif: "502541865",
      siteKind: "armazem",
      sites: [{ kind: "sede", address: "Rua Nossa Senhora de Fátima, 26", location: "Gondomar" }],
    });
    expect(organization.nif).toBe("502541865");
    expect(organization.siteKind).toBe("armazem");
    expect(organization.sites).toMatchObject([{ kind: "sede", location: "Gondomar" }]);
    const other = data.organizations.find((item) => item.id !== "norte")!;
    expect(() =>
      run("organization.save", {
        id: other.id,
        version: other.version,
        name: other.name,
        stage: other.stage,
        ownerId: other.ownerId,
        nif: "502541865",
      }),
    ).toThrow("com este NIF");
  });
  it("stores turnover and headcount per year and rejects inconsistent data", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    const details = {
      id: organization.id,
      name: organization.name,
      stage: organization.stage,
      ownerId: organization.ownerId,
    };
    run("organization.save", {
      ...details,
      version: organization.version,
      financials: [
        { year: 2024, turnover: 5000000, employees: 45 },
        { year: 2023, turnover: "4000000", employees: "40" },
      ],
    });
    expect(organization.financials).toEqual([
      { year: 2023, turnover: 4000000, employees: 40 },
      { year: 2024, turnover: 5000000, employees: 45 },
    ]);
    expect(() =>
      run("organization.save", {
        ...details,
        version: organization.version,
        financials: [{ year: 2024 }, { year: 2024 }],
      }),
    ).toThrow("anos repetidos");
    expect(() =>
      run("organization.save", {
        ...details,
        version: organization.version,
        financials: [{ year: 2024, turnover: -1 }],
      }),
    ).toThrow("Volume de negócios inválido");
  });
  it("stores Iberinform brackets and rejects anything else", () => {
    const organization = data.organizations.find(
      (item) => item.id === "norte",
    )!;
    const details = {
      id: organization.id,
      name: organization.name,
      stage: organization.stage,
      ownerId: organization.ownerId,
    };
    run("organization.save", {
      ...details,
      version: organization.version,
      size: {
        source: "Iberinform",
        url: "https://www.iberinform.pt/empresa/24976641/x",
        nif: "516626159",
        turnover: { label: "2.000.000 - 10.000.000€", min: 2000000, max: 10000000 },
        trend: "aumenta",
        employees: { label: "26 - 50", min: 26, max: 50 },
        checkedAt: "2026-09-29T10:00:00.000Z",
      },
    });
    expect(organization.size).toMatchObject({ trend: "aumenta", employees: { min: 26 } });
    expect(() =>
      run("organization.save", {
        ...details,
        version: organization.version,
        size: { source: "Outro", url: "https://example.com" },
      }),
    ).toThrow("Dados de dimensão inválidos");
  });
  it("records where a company created from a prospect came from", () => {
    run("organization.save", {
      name: "Prospeto Teste",
      stage: "new",
      location: "Trofa",
      initialNote: "Origem: prospeção (OpenStreetMap).",
    });
    const created = data.organizations.find((item) => item.name === "Prospeto Teste")!;
    expect(data.interactions.at(-1)).toMatchObject({
      organizationId: created.id,
      body: "Origem: prospeção (OpenStreetMap).",
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
    ).toThrow("alterado entretanto");
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
    ).toThrow("depois do início");
    expect(() =>
      run("meeting.save", {
        title: "x",
        startsAt: "2026-02-30T10:00",
        endsAt: "2026-03-01T11:00",
      }),
    ).toThrow("inválida");
  });
  it("accepts only GitHub PR URLs and avoids duplicate links", () => {
    expect(() =>
      run("pr.save", {
        projectId: "operations",
        title: "x",
        url: "javascript:alert(1)",
      }),
    ).toThrow("link GitHub");
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
    ).toThrow("já está ligado");
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
      "Não tens acesso",
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
    ).toThrow("Escolhe pelo menos");
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
