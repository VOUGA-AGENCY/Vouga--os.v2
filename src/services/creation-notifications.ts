import type { Member, Store } from "@/domain/model";
import {
  canSeeMeeting,
  canSeeNote,
  canSeeProject,
  canSeeTask,
} from "@/domain/permissions";
import { shortDate } from "@/domain/time";
import { enqueue } from "./activity-service";

type EntityType =
  "task" | "calendar" | "project" | "note" | "company" | "reminder";
export type CreationNotice = {
  entityType: EntityType;
  entityId: string;
  memberId: string;
  actorId: string;
};
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

// Revalidate access and membership at delivery time, not only when queued.
// No model calls: all notifications use the same fixed templates.
export function creationNotice(data: Store, notice: CreationNotice) {
  const member = data.members.find((item) => item.id === notice.memberId);
  if (
    !member?.telegramChatId ||
    member.archived ||
    data.accounts.some(
      (account) => account.memberId === member.id && account.disabled,
    )
  )
    return null;
  const actor =
    data.members.find((item) => item.id === notice.actorId)?.name ?? "Alguém";
  let text: string;
  switch (notice.entityType) {
    case "task": {
      const item = data.tasks.find((task) => task.id === notice.entityId);
      if (
        !item ||
        item.ownerId !== member.id ||
        !canSeeTask(member, item, data)
      )
        return null;
      text = `Nova tarefa · ${item.title}\n${actor} criou uma tarefa para ti.${item.dueOn ? `\nPrazo: ${shortDate(item.dueOn)}` : ""}`;
      break;
    }
    case "calendar": {
      const item = data.meetings.find(
        (event) =>
          (event.groupId ?? event.id) === notice.entityId &&
          !event.cancelled &&
          event.participantIds.includes(member.id) &&
          canSeeMeeting(member, event),
      );
      if (!item) return null;
      text = `Novo evento · ${item.title}\n${actor} incluiu-te nos participantes.\n${item.allDay ? `${shortDate(item.startsAt)} · Todo o dia` : dateTime(item.startsAt)}`;
      break;
    }
    case "project": {
      const item = data.projects.find(
        (project) => project.id === notice.entityId,
      );
      if (
        !item ||
        item.status === "archived" ||
        !(item.ownerId === member.id || item.memberIds.includes(member.id)) ||
        !canSeeProject(member, item)
      )
        return null;
      text = `Novo projeto · ${item.name}\n${actor} incluiu-te na equipa.`;
      break;
    }
    case "note": {
      const item = data.notes.find((note) => note.id === notice.entityId);
      if (
        !item ||
        item.archived ||
        !(
          item.createdBy === member.id || item.recipientIds?.includes(member.id)
        ) ||
        !canSeeNote(member, item, data)
      )
        return null;
      text = `Nova nota · ${item.title}\n${actor} criou uma nota para ti.`;
      break;
    }
    case "company": {
      const item = data.organizations.find(
        (company) => company.id === notice.entityId,
      );
      if (!item || item.archived || item.ownerId !== member.id) return null;
      text = `Nova organização · ${item.name}\n${actor} definiu-te como responsável.`;
      break;
    }
    case "reminder": {
      const item = data.reminders.find(
        (reminder) => reminder.id === notice.entityId,
      );
      if (!item || item.done || item.ownerId !== member.id) return null;
      text = `Novo lembrete · ${item.title}\n${actor} criou um lembrete para ti.\n${dateTime(item.at)}`;
      break;
    }
    default:
      return null;
  }
  return { chatId: member.telegramChatId, memberId: member.id, text };
}

// The outbox is committed atomically with the new record. Existing data/imports
// are never scanned into new notifications; edits do not repeat creation alerts.
export function queueCreationNotices(
  data: Store,
  before: Store,
  actor: Member,
  now: string,
) {
  const queue = (
    entityType: EntityType,
    entityId: string,
    recipients: string[],
  ) => {
    for (const memberId of new Set(recipients)) {
      const notice = { entityType, entityId, memberId, actorId: actor.id };
      if (!creationNotice(data, notice)) continue;
      enqueue(
        data,
        `created:${entityType}:${entityId}:${memberId}`,
        "telegram.created",
        notice,
        now,
      );
    }
  };
  for (const task of data.tasks)
    if (!before.tasks.some((old) => old.id === task.id))
      queue("task", task.id, [task.ownerId]);
  const existingGroups = new Set(
    before.meetings.map((event) => event.groupId ?? event.id),
  );
  const existingEventIds = new Set(before.meetings.map((event) => event.id));
  for (const event of data.meetings)
    if (existingEventIds.has(event.id))
      existingGroups.add(event.groupId ?? event.id);
  for (const event of data.meetings) {
    const id = event.groupId ?? event.id;
    if (!existingGroups.has(id)) queue("calendar", id, event.participantIds);
  }
  for (const project of data.projects)
    if (!before.projects.some((old) => old.id === project.id))
      queue("project", project.id, [project.ownerId, ...project.memberIds]);
  for (const note of data.notes)
    if (!before.notes.some((old) => old.id === note.id))
      queue("note", note.id, [note.createdBy, ...(note.recipientIds ?? [])]);
  for (const company of data.organizations)
    if (!before.organizations.some((old) => old.id === company.id))
      queue("company", company.id, [company.ownerId]);
  for (const reminder of data.reminders)
    if (!before.reminders.some((old) => old.id === reminder.id))
      queue("reminder", reminder.id, [reminder.ownerId]);
}
