import { describe, expect, test } from "vitest";
import { executeCommand } from "@/application/commands";
import { createSeed } from "@/persistence/seed";

const now = "2026-09-27T12:00:00.000Z";

function workspace() {
  const data = createSeed("test-only-password", now);
  const actor = data.members.find((member) => member.id === "miguel")!;
  executeCommand(data, actor, {
    action: "meeting.save",
    values: {
      title: "Reunião com cliente",
      kind: "meeting",
      startsAt: "2026-09-28T10:00",
      endsAt: "2026-09-28T11:00",
      allDay: false,
      calendarKey: "office",
      projectId: data.projects[0].id,
    },
  });
  const meeting = data.meetings.find(
    (item) => item.title === "Reunião com cliente",
  )!;
  return { data, actor, meeting };
}

// The event editor always sends the times with every save.
const times = { startsAt: "2026-09-28T10:00", endsAt: "2026-09-28T11:00" };

const pushesFor = (
  data: ReturnType<typeof workspace>["data"],
  meetingId: string,
) =>
  data.integrationJobs.filter(
    (job) => job.kind === "calendar.push" && job.payload.meetingId === meetingId,
  );

describe("editing a Google calendar event", () => {
  test("several autosaves before the push runs queue a single Google update", () => {
    const { data, actor, meeting } = workspace();
    for (const title of ["Reunião A", "Reunião B", "Reunião C"])
      executeCommand(data, actor, {
        action: "meeting.save",
        values: { ...times, id: meeting.id, version: meeting.version, title },
      });
    expect(pushesFor(data, meeting.id)).toHaveLength(1);
    expect(meeting.title).toBe("Reunião C");
    expect(meeting.syncStatus).toBe("pending");
  });

  test("an edit after the push started queues a new one", () => {
    const { data, actor, meeting } = workspace();
    pushesFor(data, meeting.id)[0].state = "processing";
    executeCommand(data, actor, {
      action: "meeting.save",
      values: { ...times, id: meeting.id, version: meeting.version, title: "Nova hora" },
    });
    expect(pushesFor(data, meeting.id)).toHaveLength(2);
  });

  test("an edit while a failed push waits to retry queues a new one", () => {
    const { data, actor, meeting } = workspace();
    pushesFor(data, meeting.id)[0].attempts = 1;
    executeCommand(data, actor, {
      action: "meeting.save",
      values: { ...times, id: meeting.id, version: meeting.version, title: "Depois da falha" },
    });
    expect(pushesFor(data, meeting.id)).toHaveLength(2);
  });

  test("an edit that does not send the project keeps it", () => {
    const { data, actor, meeting } = workspace();
    const project = meeting.projectId;
    expect(project).toBeTruthy();
    executeCommand(data, actor, {
      action: "meeting.save",
      values: { ...times, id: meeting.id, version: meeting.version, title: "Só o título" },
    });
    expect(meeting.projectId).toBe(project);
  });

  test("an edit that clears the project removes it", () => {
    const { data, actor, meeting } = workspace();
    executeCommand(data, actor, {
      action: "meeting.save",
      values: { ...times, id: meeting.id, version: meeting.version, projectId: "" },
    });
    expect(meeting.projectId).toBeNull();
  });
});
