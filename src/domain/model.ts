import type {
  ActivityEvent,
  ExternalConnection,
  IntegrationJob,
  PendingAction,
  NotificationDelivery,
  CalendarKey,
  RepositoryLink,
} from "./integration-model";
export type Role = "admin" | "engineer";
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  archived?: boolean;
  githubLogin?: string;
  telegramChatId?: string;
  telegramUserId?: string;
}
export interface Entity {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
export const taskStatuses = {
  backlog: "Backlog",
  todo: "To do",
  doing: "In progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
} as const;
export const projectStatuses = {
  planned: "Planned",
  active: "In progress",
  waiting: "Waiting for client",
  delivered: "Delivered",
  archived: "Archived",
} as const;
export const stages = {
  new: "New",
  contacted: "Contacted",
  meeting: "Meeting",
  proposal: "Proposal",
  client: "Client",
  dormant: "Dormant",
} as const;
export type TaskStatus = keyof typeof taskStatuses;
export type ProjectStatus = keyof typeof projectStatuses;
export type Stage = keyof typeof stages;
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export const taskSizes = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
} as const;
export type TaskSize = keyof typeof taskSizes;
export const taskSizeLabels: Record<TaskSize, string> = {
  xs: "XS · Extra small",
  s: "S · Small",
  m: "M · Medium",
  l: "L · Large",
  xl: "XL · Extra large",
};
export interface Task extends Entity {
  title: string;
  body: string;
  status: TaskStatus;
  ownerId: string;
  assigneeIds?: string[];
  dueOn: string | null;
  projectId: string | null;
  organizationId: string | null;
  visibility?: "private" | "team" | "board";
  priority?: TaskPriority;
  size?: TaskSize | null;
  pullRequestId?: string | null;
  issueNumber?: number | null;
  issueUrl?: string | null;
}
export interface TaskComment extends Entity {
  taskId: string;
  body: string;
}
export interface TaskAttachment extends Entity {
  taskId: string;
  name: string;
  mimeType: string;
  size: number;
  storageName: string;
}
export interface TaskActivity extends Entity {
  taskId: string;
  body: string;
}
export interface Meeting extends Entity {
  title: string;
  kind: "meeting" | "event";
  body: string;
  startsAt: string;
  endsAt: string;
  calendarOwnerId: string;
  participantIds: string[];
  organizationId: string | null;
  projectId: string | null;
  cancelled: boolean;
  reminderMinutes: number;
  calendarKey?: CalendarKey | "personal";
  groupId?: string;
  externalParticipants?: string[];
  googleCalendarId?: string;
  googleEventId?: string;
  googleEventUrl?: string;
  googleEtag?: string;
  syncStatus?: "local" | "pending" | "synced" | "error" | "conflict";
  allDay?: boolean;
  recurringEventId?: string;

  visibility?: "private" | "team";
}
export interface Organization extends Entity {
  name: string;
  person: string;
  email: string;
  phone: string;
  stage: Stage;
  ownerId: string;
  nextStep: string;
  followUpOn: string | null;
  archived: boolean;
}
export interface Interaction extends Entity {
  organizationId: string;
  body: string;
  channel: "note" | "call" | "email" | "meeting";
  stageFrom?: Stage | null;
  stageTo?: Stage | null;
  meetingId?: string | null;
}
export interface Contact extends Entity {
  organizationId: string;
  name: string;
  email: string;
  phone: string;
}
export interface InboxItem extends Entity {
  body: string;
  ownerId: string;
  resolved: boolean;
}
export interface Project extends Entity {
  name: string;
  objective: string;
  nextStep: string;
  status: ProjectStatus;
  ownerId: string;
  memberIds: string[];
  organizationId: string | null;
  dueOn: string | null;
  repositoryUrl: string;
  repositories?: RepositoryLink[];
}
export interface ProjectUpdate extends Entity {
  projectId: string;
  body: string;
}
export interface Note extends Entity {
  title: string;
  body: string;
  projectId: string | null;
  organizationId?: string | null;
  meetingId?: string | null;
  contactId?: string | null;
  pinned: boolean;
  archived: boolean;
  visibility: "team" | "private" | "shared";
  recipientIds?: string[];
}
export interface Reminder extends Entity {
  title: string;
  ownerId: string;
  at: string;
  done: boolean;
}
export interface PullRequest extends Entity {
  projectId: string;
  title: string;
  url: string;
  number: number;
  state: "open" | "draft" | "merged" | "closed";
  repositoryId?: number;
  author?: string;
  branch?: string;
  reviewRequested?: string[];
}
export interface ReminderReceipt {
  key: string;
  memberId: string;
  snoozedUntil: string | null;
  dismissed: boolean;
}
export interface WorkspaceData {
  activity: ActivityEvent[];
  members: Member[];
  tasks: Task[];
  taskComments: TaskComment[];
  taskAttachments: TaskAttachment[];
  taskActivity: TaskActivity[];
  meetings: Meeting[];
  organizations: Organization[];
  interactions: Interaction[];
  contacts: Contact[];
  inbox: InboxItem[];
  projects: Project[];
  updates: ProjectUpdate[];
  notes: Note[];
  reminders: Reminder[];
  pullRequests: PullRequest[];
  reminderReceipts: ReminderReceipt[];
}
export interface Store extends WorkspaceData {
  schemaVersion: 5;
  externalConnections: ExternalConnection[];
  integrationJobs: IntegrationJob[];
  pendingActions: PendingAction[];
  notificationDeliveries: NotificationDelivery[];
  oauthStates: {
    hash: string;
    memberId: string;
    calendarKey: CalendarKey;
    expiresAt: string;
    verifier: string;
    status?: "processing" | "completed" | "failed";
  }[];
  telegramLinks: { hash: string; memberId: string; expiresAt: string }[];
  agentReceipts: {
    key: string;
    memberId: string;
    state: "running" | "done";
    response?: string;
    pendingIds?: string[];
    createdAt: string;
  }[];

  revision: number;
  accounts: {
    memberId: string;
    passwordHash: string;
    mustChangePassword?: boolean;
    temporaryExpiresAt?: string;
    disabled?: boolean;
    failedAttempts?: number;
    lockedUntil?: string;
  }[];
  sessions: { hash: string; memberId: string; expiresAt: string }[];
  captureReceipts: { memberId: string; key: string; ids: string[] }[];
}
export interface Alert {
  key: string;
  title: string;
  meta: string;
  at: string;
  target: "task" | "meeting" | "organization" | "project" | "reminder";
  id: string;
}
export interface Snapshot extends WorkspaceData {
  me: Member;
  revision: number;
  now: string;
  alerts: Alert[];
  pendingActions: Omit<PendingAction, "values" | "action">[];
}
export const captureKinds = {
  task: "Task",
  meeting: "Meeting",
  event: "Event",
  contact: "Contact",
  crm: "CRM update",
  note: "Note",
  update: "Project update",
  reminder: "Reminder",
  inbox: "Inbox",
} as const;
export type CaptureKind = keyof typeof captureKinds;
export interface CaptureDraft {
  kind: CaptureKind;
  title: string;
  body: string;
  ownerId: string;
  projectId: string;
  organizationId: string;
  organizationName: string;
  date: string;
  time: string;
  duration: string;
  person: string;
  nextStep: string;
  stage: string;
}
