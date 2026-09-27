import { randomUUID } from "node:crypto";
import type { Member, Store } from "@/domain/model";
import type { ActivityEvent } from "@/domain/integration-model";
import {
  canSeeMeeting,
  canSeeNote,
  canSeeProject,
  canSeeTask,
} from "@/domain/permissions";
export function canSeeActivity(data: Store, me: Member, event: ActivityEvent) {
  if (
    event.metadata?.meetingId &&
    !data.meetings.some(
      (m) => m.id === event.metadata.meetingId && canSeeMeeting(me, m),
    )
  )
    return false;
  if (event.entityType === "task")
    return data.tasks.some(
      (task) => task.id === event.entityId && canSeeTask(me, task, data),
    );
  if (event.entityType === "calendar")
    return data.meetings.some(
      (meeting) => meeting.id === event.entityId && canSeeMeeting(me, meeting),
    );
  if (event.entityType === "note")
    return data.notes.some(
      (note) => note.id === event.entityId && canSeeNote(me, note, data),
    );
  if (event.projectId)
    return data.projects.some(
      (project) => project.id === event.projectId && canSeeProject(me, project),
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
) {
  for (const task of data.tasks) {
    const old = before.tasks.find((item) => item.id === task.id);
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
    (item) => !before.taskComments.some((old) => old.id === item.id),
  )) {
    const task = data.tasks.find((item) => item.id === comment.taskId)!;
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
  for (const company of data.organizations) {
    const old = before.organizations.find((item) => item.id === company.id);
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
    (item) => !before.interactions.some((old) => old.id === item.id),
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
    const old = before.meetings.find((item) => item.id === meeting.id);
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
