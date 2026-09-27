import type {
  Meeting,
  Member,
  Note,
  Project,
  Task,
  WorkspaceData,
} from "./model";
import { AppError } from "./validation";
export const canSeeProject = (me: Member, project: Project) =>
  me.role === "admin" ||
  project.ownerId === me.id ||
  project.memberIds.includes(me.id);
export const canSeeTask = (me: Member, task: Task, data: WorkspaceData) =>
  me.role === "admin" ||
  task.ownerId === me.id ||
  !!data.projects.find((p) => p.id === task.projectId && canSeeProject(me, p));
export const canSeeMeeting = (me: Member, meeting: Meeting) =>
  me.role === "admin" ||
  meeting.visibility === "team" ||
  meeting.calendarOwnerId === me.id ||
  meeting.createdBy === me.id ||
  meeting.participantIds.includes(me.id);
export const canEditMeeting = (me: Member, meeting: Meeting) =>
  me.role === "admin" ||
  meeting.calendarOwnerId === me.id ||
  meeting.createdBy === me.id;
export const canSeeNote = (me: Member, note: Note, data: WorkspaceData) =>
  note.visibility === "private"
    ? note.createdBy === me.id
    : note.visibility === "shared"
      ? note.createdBy === me.id || !!note.recipientIds?.includes(me.id)
    : !note.projectId ||
      !!data.projects.find(
        (p) => p.id === note.projectId && canSeeProject(me, p),
      );
export function allow(condition: boolean) {
  if (!condition) throw new AppError("Não tens acesso a este registo.", 403);
}
