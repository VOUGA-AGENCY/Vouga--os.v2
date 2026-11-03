import { telegramEnabled } from "@/services/features";
import { randomUUID } from "node:crypto";
import type { Member, Store } from "@/domain/model";
import type { ActivityEvent } from "@/domain/integration-model";
import {
  canSeeMeeting,
  canSeeNote,
  canSeeProject,
  canSeeTask,
} from "@/domain/permissions";
export interface ActivityVisibility {
  meetings: ReadonlySet<string>;
  tasks: ReadonlySet<string>;
  notes: ReadonlySet<string>;
  projects: ReadonlySet<string>;
}

export function canSeeActivity(
  data: Store,
  me: Member,
  event: ActivityEvent,
  visible?: ActivityVisibility,
) {
  const meetingId = event.metadata?.meetingId;
  if (
    meetingId &&
    !(visible
      ? visible.meetings.has(meetingId as string)
      : data.meetings.some((m) => m.id === meetingId && canSeeMeeting(me, m)))
  )
    return false;
  if (event.entityType === "task")
    return visible
      ? visible.tasks.has(event.entityId)
      : data.tasks.some(
          (task) => task.id === event.entityId && canSeeTask(me, task, data),
        );
  if (event.entityType === "calendar")
    return visible
      ? visible.meetings.has(event.entityId)
      : data.meetings.some(
          (meeting) =>
            meeting.id === event.entityId && canSeeMeeting(me, meeting),
        );
  if (event.entityType === "note")
    return visible
      ? visible.notes.has(event.entityId)
      : data.notes.some(
          (note) => note.id === event.entityId && canSeeNote(me, note, data),
        );
  if (event.projectId)
    return visible
      ? visible.projects.has(event.projectId)
      : data.projects.some(
          (project) =>
            project.id === event.projectId && canSeeProject(me, project),
        );
  return event.entityType === "company";
}

export function recordActivity(data: Store, input: Omit<ActivityEvent, "id">) {
  if (
    input.externalKey &&
    data.activity.some((event) => event.externalKey === input.externalKey)
  )
    return;
  data.activity.push({ id: randomUUID(), ...input });
}
export function captureChanges(
  data: Store,
  before: Store,
  actor: Member,
  source: ActivityEvent["source"],
  now: string,
  scope: "all" | "tasks" = "all",
) {
  const oldTasks = new Map(before.tasks.map(item => [item.id, item]));
  const oldComments = new Set(before.taskComments.map(item => item.id));
  const tasks = new Map(data.tasks.map(item => [item.id, item]));
  for (const task of data.tasks) {
    const old = oldTasks.get(task.id);
    if (old?.version === task.version) continue;
    const type = !old
      ? "task.created"
      : old.status !== task.status
        ? task.status === "done"
          ? "task.completed"
          : "task.status_changed"
        : "task.updated";
    recordActivity(data, {
      type,
      actorId: actor.id,
      timestamp: now,
      source,
      entityType: "task",
      entityId: task.id,
      projectId: task.projectId,
      companyId: task.organizationId,
      summary: `${task.title}${!old ? " · created" : old.status !== task.status ? ` → ${task.status}` : " · updated"}`,
      metadata: { from: old?.status, to: task.status },
    });
  }
  for (const comment of data.taskComments.filter(
    (item) => !oldComments.has(item.id),
  )) {
    const task = tasks.get(comment.taskId)!;
    recordActivity(data, {
      type: "task.comment_created",
      actorId: actor.id,
      timestamp: now,
      source,
      entityType: "task",
      entityId: task.id,
      projectId: task.projectId,
      summary: `Comment · ${task.title}`,
      metadata: { commentId: comment.id },
    });
  }
  if (scope === "tasks") return;
  const oldCompanies = new Map(before.organizations.map(item => [item.id, item]));
  const oldMeetings = new Map(before.meetings.map(item => [item.id, item]));
  const oldNotes = new Set(before.interactions.map(item => item.id));
  for (const company of data.organizations) {
    const old = oldCompanies.get(company.id);
    if (old && old.stage === company.stage) continue;
    recordActivity(data, {
      type: old ? "company.status_changed" : "company.created",
      actorId: actor.id,
      timestamp: now,
      source,
      entityType: "company",
      entityId: company.id,
      companyId: company.id,
      summary: `${company.name} → ${company.stage}`,
      metadata: { from: old?.stage, to: company.stage },
    });
  }
  for (const note of data.interactions.filter(
    (item) => !oldNotes.has(item.id),
  ))
    recordActivity(data, {
      type: "company.note_created",
      actorId: actor.id,
      timestamp: now,
      source,
      entityType: "company",
      entityId: note.organizationId,
      companyId: note.organizationId,
      summary: note.body,
      metadata: { interactionId: note.id, meetingId: note.meetingId },
    });
  for (const meeting of data.meetings) {
    const old = oldMeetings.get(meeting.id);
    if (old?.version === meeting.version) continue;
    recordActivity(data, {
      type: !old
        ? "calendar.event_created"
        : meeting.cancelled
          ? "calendar.event_cancelled"
          : "calendar.event_updated",
      actorId: actor.id,
      timestamp: now,
      source,
      entityType: "calendar",
      entityId: meeting.id,
      projectId: meeting.projectId,
      companyId: meeting.organizationId,
      summary: `${meeting.title} · ${meeting.cancelled ? "cancelled" : old ? "updated" : "scheduled"}`,
      metadata: { startsAt: meeting.startsAt, calendar: meeting.calendarKey },
    });
    if (meeting.calendarKey === "personal") {
      meeting.syncStatus = "local";
      continue;
    }
    meeting.syncStatus = "pending";
    enqueue(
      data,
      `calendar:${meeting.id}:${meeting.version}`,
      "calendar.push",
      { meetingId: meeting.id },
      now,
    );
  }
}
export function enqueue(
  data: Store,
  key: string,
  kind: Store["integrationJobs"][number]["kind"],
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  if (kind.startsWith("telegram.") && !telegramEnabled()) return;
  if (data.integrationJobs.some((job) => job.key === key)) return;
  data.integrationJobs.push({
    id: randomUUID(),
    key,
    kind,
    payload,
    state: "pending",
    attempts: 0,
    availableAt: now,
  });
}
