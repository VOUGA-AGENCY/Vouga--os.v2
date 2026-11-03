import { describe, expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { canSeeActivity } from "@/services/activity-service";
import { browserWorkspaceFor, workspaceFor } from "@/projections/workspace";
import { applySnapshotPatch, snapshotChanges } from "@/projections/changes";
import { validateStore } from "@/persistence/supabase/collections";
import type { ActivityEvent } from "@/domain/integration-model";

const now = "2026-11-03T10:00:00Z";
function fixture() {
  const data = createSeed("startup-test-password", now);
  const admin = data.members[0];
  executeCommand(
    data,
    admin,
    {
      action: "task.save",
      values: {
        title: "Private task",
        visibility: "private",
        ownerId: admin.id,
      },
    },
    now,
  );
  executeCommand(
    data,
    admin,
    {
      action: "meeting.save",
      values: {
        title: "Office",
        calendarKey: "office",
        startsAt: "2026-11-03T11:00",
        endsAt: "2026-11-03T12:00",
      },
    },
    now,
  );
  const meeting = data.meetings.at(-1)!;
  for (const [entityType, entityId] of [
    ["calendar", meeting.id],
    ["task", data.tasks.at(-1)!.id],
    ["company", data.organizations[0].id],
    ["note", "missing"],
    ["task", "deleted-task"],
  ] as const) {
    data.activity.push({
      id: `test-${entityType}-${entityId}`,
      entityType,
      entityId,
      source: "google",
      type: "calendar.event_updated",
      actorId: admin.id,
      timestamp: now,
      summary: "History",
      metadata: {},
    });
  }
  data.activity.push({
    ...data.activity[0],
    id: "restricted-meeting-reference",
    metadata: { meetingId: meeting.id },
    entityType: "company",
    entityId: data.organizations[0].id,
  });
  data.activity.push({
    ...data.activity[0],
    id: "missing-project",
    entityType: "project",
    entityId: "missing",
    projectId: "missing",
  } as ActivityEvent);
  return data;
}

describe("workspace startup", () => {
  it("indexed Activity permissions match individual permission checks for every member", () => {
    const data = fixture();
    for (const member of data.members) {
      expect(workspaceFor(data, member, now).activity).toEqual(
        data.activity.filter((event) => canSeeActivity(data, member, event)),
      );
    }
  });
  it("omits only unused calendar history from browser payload, preserving full records and deltas", () => {
    const data = fixture();
    const me = data.members[0];
    const full = workspaceFor(data, me, now);
    const before = browserWorkspaceFor(data, me, now);
    expect(before.meetings).toEqual(full.meetings);
    expect(before.tasks).toEqual(full.tasks);
    expect(before.activity.some((event) => event.entityType === "task")).toBe(
      true,
    );
    expect(
      before.activity.some((event) => event.id.startsWith("test-calendar-")),
    ).toBe(false);
    expect(workspaceFor(data, me, now)).toEqual(full);
    executeCommand(
      data,
      me,
      {
        action: "meeting.save",
        values: {
          title: "New event",
          calendarKey: "contacto",
          startsAt: "2026-11-04T11:00",
          endsAt: "2026-11-04T12:00",
        },
      },
      now,
    );
    data.revision++;
    const after = browserWorkspaceFor(data, me, now);
    expect(applySnapshotPatch(before, snapshotChanges(before, after))).toEqual(
      after,
    );
    expect(after.meetings.at(-1)?.title).toBe("New event");
  });
  it("validates read identifiers and collections without constructing stored rows", () => {
    const data = fixture();
    expect(() => validateStore(data)).not.toThrow();
    data.meetings.push(data.meetings[0]);
    expect(() => validateStore(data)).toThrow("duplicado");
    data.meetings = undefined as never;
    expect(() => validateStore(data)).toThrow("meetings");
  });
});
