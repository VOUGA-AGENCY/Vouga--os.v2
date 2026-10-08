import type {
  Meeting,
  Member,
  Note,
  Project,
  Task,
  WorkspaceData,
} from "./model";
import { isActiveMember, isBoardMember, isTaskAssignee } from "./team";
import { AppError } from "./validation";
export const canSeeProject = (me: Member, project: Project) =>
  me.role === "admin" ||
  project.ownerId === me.id ||
  project.memberIds.includes(me.id);
export const canSeeTask = (me: Member, task: Task, data: WorkspaceData) =>
  task.visibility === "board"
    ? isBoardMember(me)
    : task.visibility === "private"
      ? isTaskAssignee(task, me.id)
      : isActiveMember(me) &&
        (me.role === "admin" ||
          task.ownerId === me.id ||
          (task.assigneeIds?.includes(me.id) ?? false) ||
          !!data.projects.find(
            (p) => p.id === task.projectId && canSeeProject(me, p),
          ));
export const canSeeMeeting = (me: Member, meeting: Meeting) =>
  me.role === "admin" ||
  meeting.calendarKey === "contacto" ||
  (meeting.calendarKey === "personal" && meeting.calendarOwnerId === me.id);
export const canEditMeeting = (me: Member, meeting: Meeting) =>
  canSeeMeeting(me, meeting);
export const canSeeNote = (me: Member, note: Note, data: WorkspaceData) =>
  (!note.meetingId ||
    data.meetings.some(
      (m) => m.id === note.meetingId && canSeeMeeting(me, m),
    )) &&
  (note.visibility === "private"
    ? note.createdBy === me.id
    : note.visibility === "shared"
      ? note.createdBy === me.id || !!note.recipientIds?.includes(me.id)
      : !note.projectId ||
        !!data.projects.find(
          (p) => p.id === note.projectId && canSeeProject(me, p),
        ));
export function allow(condition: boolean) {
  if (!condition)
    throw new AppError("You do not have access to this record.", 403);
}
