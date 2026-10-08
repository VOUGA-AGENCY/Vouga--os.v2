import type { Entity, Store } from "@/domain/model";
// Keep an anonymous archived author ID so existing history never dangles.
export function removeDepartedMember(data: Store, now: string) {
  const id = "patrick",
    replacement = "miguel";
  const member = data.members.find((member) => member.id === id);
  let reassigned = 0;
  const touch = (item: Entity) => {
    item.version++;
    item.updatedAt = now;
    reassigned++;
  };
  if (member) {
    member.archived = true;
    member.name = "Former team member";
    member.email = "";
    delete member.telegramChatId;
    delete member.telegramUserId;
  }
  data.accounts = data.accounts.filter((account) => account.memberId !== id);
  data.sessions = data.sessions.filter((session) => session.memberId !== id);
  data.telegramLinks = data.telegramLinks.filter(
    (link) => link.memberId !== id,
  );
  data.oauthStates = data.oauthStates.filter((state) => state.memberId !== id);
  data.pendingActions = data.pendingActions.filter(
    (action) => action.memberId !== id,
  );
  data.agentReceipts = data.agentReceipts.filter(
    (receipt) => receipt.memberId !== id,
  );
  data.captureReceipts = data.captureReceipts.filter(
    (receipt) => receipt.memberId !== id,
  );
  data.reminderReceipts = data.reminderReceipts.filter(
    (receipt) => receipt.memberId !== id,
  );
  data.notificationDeliveries = data.notificationDeliveries.filter(
    (delivery) => delivery.memberId !== id,
  );
  for (const task of data.tasks) {
    const ids = task.assigneeIds?.length ? task.assigneeIds : [task.ownerId];
    if (task.ownerId === id || ids.includes(id)) {
      task.assigneeIds = [
        ...new Set(ids.map((person) => (person === id ? replacement : person))),
      ];
      task.ownerId = task.assigneeIds[0];
      touch(task);
    }
  }
  for (const project of data.projects) {
    if (project.ownerId === id || project.memberIds.includes(id)) {
      if (project.ownerId === id) project.ownerId = replacement;
      project.memberIds = [
        ...new Set(
          project.memberIds.map((person) =>
            person === id ? replacement : person,
          ),
        ),
      ];
      touch(project);
    }
  }
  for (const company of data.organizations)
    if (company.ownerId === id) {
      company.ownerId = replacement;
      touch(company);
    }
  for (const event of data.meetings) {
    if (event.calendarOwnerId === id || event.participantIds.includes(id)) {
      if (event.calendarOwnerId === id) event.calendarOwnerId = replacement;
      event.participantIds = [
        ...new Set(
          event.participantIds.map((person) =>
            person === id ? replacement : person,
          ),
        ),
      ];
      touch(event);
    }
  }
  for (const note of data.notes)
    if (note.recipientIds?.includes(id)) {
      note.recipientIds = [
        ...new Set(
          note.recipientIds.map((person) =>
            person === id ? replacement : person,
          ),
        ),
      ];
      touch(note);
    }
  for (const reminder of data.reminders)
    if (reminder.ownerId === id) {
      reminder.ownerId = replacement;
      touch(reminder);
    }
  for (const item of data.inbox)
    if (item.ownerId === id) {
      item.ownerId = replacement;
      touch(item);
    }
  return { removedAccess: !!member, reassignedRecords: reassigned };
}
