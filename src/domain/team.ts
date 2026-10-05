import type { Member, Task } from "./model";
// Roque retains his legacy ID; display names are not authorization identifiers.
export const isBoardMember = (member: Pick<Member, "id" | "archived">) =>
  !member.archived && ["miguel", "afonso", "roque"].includes(member.id);
export const isActiveMember = (member: Member) =>
  !member.archived && !["patrick", "engineer"].includes(member.id);
export const taskAssignees = (task: Pick<Task, "ownerId" | "assigneeIds">) =>
  task.assigneeIds?.length ? task.assigneeIds : [task.ownerId];
export const isTaskAssignee = (
  task: Pick<Task, "ownerId" | "assigneeIds">,
  id: string,
) => taskAssignees(task).includes(id);
