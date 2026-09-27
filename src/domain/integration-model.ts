export const operationalCalendars = {
  office: { label: "Office", email: "office@vouga-agency.pt" },
  contacto: { label: "Contacto", email: "contacto@vouga-agency.pt" },
} as const;
export type CalendarKey = keyof typeof operationalCalendars;
export interface ActivityEvent {
  id: string;
  type: string;
  actorId: string;
  actorName?: string;
  timestamp: string;
  source: "os" | "google" | "github" | "agent" | "telegram";
  entityType: "task" | "project" | "company" | "calendar" | "note";
  entityId: string;
  projectId?: string | null;
  companyId?: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  externalKey?: string;
}
export interface ExternalConnection {
  id: string;
  provider: "google" | "github" | "telegram" | "groq";
  label: string;
  status: "disconnected" | "connected" | "error";
  credentials?: string;
  externalId?: string;
  syncToken?: string;
  lastSyncAt?: string;
  lastError?: string;
  channels?: {
    id: string;
    token: string;
    resourceId?: string;
    expiresAt: string;
  }[];
}
export interface IntegrationJob {
  id: string;
  key: string;
  kind: "calendar.push" | "calendar.pull" | "github.event" | "telegram.update" | "telegram.created";
  payload: Record<string, unknown>;
  state: "pending" | "processing" | "done" | "failed";
  attempts: number;
  availableAt: string;
  leaseUntil?: string;
  leaseToken?: string;
  error?: string;
}
export interface PendingAction {
  id: string;
  memberId: string;
  summary: string;
  action: string;
  values: Record<string, unknown>;
  expiresAt: string;
  state: "pending" | "confirmed" | "cancelled";
  createdAt: string;
}
export interface NotificationDelivery {
  key: string;
  memberId: string;
  state: "sending" | "sent" | "uncertain";
  createdAt: string;
  sentAt?: string;
}
export interface RepositoryLink {
  id: number;
  fullName: string;
  url: string;
}
