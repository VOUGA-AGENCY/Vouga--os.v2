import { isActiveMember } from "@/domain/team";
import { canSeeActivity } from "@/services/activity-service";
import type {
  Alert,
  Member,
  Snapshot,
  Store,
  WorkspaceData,
} from "@/domain/model";
import {
  canSeeMeeting,
  canSeeNote,
  canSeeProject,
  canSeeTask,
} from "@/domain/permissions";

export function workspaceFor(data: Store, me: Member, now: string): Snapshot {
  const projects = data.projects.filter((p) => canSeeProject(me, p));
  const tasks = data.tasks.filter((t) => canSeeTask(me, t, data));
  const taskIds = new Set(tasks.map((t) => t.id));
  const visible: WorkspaceData = {
    activity: data.activity.filter((event) => canSeeActivity(data, me, event)),
    members: data.members
      .filter(isActiveMember)
      .sort((a, b) => a.name.localeCompare(b.name, "pt"))
      .map(({ id, name, role, email, githubLogin }) => ({
        id,
        name,
        role,
        email,
        ...(githubLogin ? { githubLogin } : {}),
      })),
    projects,
    tasks,
    taskComments: data.taskComments.filter((comment) =>
      taskIds.has(comment.taskId),
    ),
    taskAttachments: data.taskAttachments.filter((attachment) =>
      taskIds.has(attachment.taskId),
    ),
    taskActivity: data.taskActivity.filter((activity) =>
      taskIds.has(activity.taskId),
    ),
    meetings: data.meetings.filter((m) => canSeeMeeting(me, m)),
    organizations: data.organizations,
    contacts: data.contacts,
    inbox: data.inbox.filter(
      (item) =>
        item.ownerId === me.id &&
        !item.resolved &&
        !item.body.startsWith("Associar participantes internos:"),
    ),
    interactions: data.interactions.filter(
      (i) =>
        !i.meetingId ||
        data.meetings.some((m) => m.id === i.meetingId && canSeeMeeting(me, m)),
    ),
    updates: data.updates.filter((u) =>
      projects.some((p) => p.id === u.projectId),
    ),
    notes: data.notes.filter((n) => canSeeNote(me, n, data)),
    reminders: data.reminders.filter((r) => r.ownerId === me.id),
    pullRequests: data.pullRequests.filter((pr) =>
      projects.some((p) => p.id === pr.projectId),
    ),
    reminderReceipts: data.reminderReceipts.filter((r) => r.memberId === me.id),
  };
  return {
    ...visible,
    me: visible.members.find((member) => member.id === me.id)!,
    now,
    revision: data.revision,
    alerts: [],
    pendingActions: data.pendingActions
      .filter(
        (action) =>
          action.memberId === me.id &&
          action.state === "pending" &&
          action.expiresAt > now,
      )
      .map(({ id, memberId, summary, state, expiresAt, createdAt }) => ({
        id,
        memberId,
        summary,
        state,
        expiresAt,
        createdAt,
      })),
  };
}
export function alertsFor(
  data: WorkspaceData,
  me: Member,
  now: string,
): Alert[] {
  void data;
  void me;
  void now;
  return [];
}
