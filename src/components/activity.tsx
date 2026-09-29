"use client";
import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  FileText,
  GitBranch,
  MessageSquare,
  Users,
} from "lucide-react";
import type { ActivityEvent } from "@/domain/integration-model";
import type { ProjectUpdate } from "@/domain/model";
import { useWorkspace } from "./context";
import { PersonAvatar } from "./person-avatar";

type ActivityFilter = "all" | "project" | "github";
type FeedItem =
  | { kind: "activity"; value: ActivityEvent }
  | { kind: "update"; value: ProjectUpdate };

const typeLabels: Record<string, string> = {
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.status_changed": "Task status changed",
  "task.completed": "Task completed",
  "task.comment_created": "Comment added",
  "calendar.event_created": "Event scheduled",
  "calendar.event_updated": "Event updated",
  "calendar.event_cancelled": "Event cancelled",
  "company.created": "Company created",
  "company.status_changed": "CRM status changed",
  "company.note_created": "CRM note added",
  "github.commit_pushed": "Commits pushed",
  "github.pull_request_opened": "Pull request opened",
  "github.pull_request_updated": "Pull request updated",
  "github.pull_request_merged": "Pull request merged",
  "github.review_requested": "Review requested",
  "github.review_submitted": "Review submitted",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function iconFor(type: string, github: boolean) {
  if (github) return <GitBranch size={15} />;
  if (type.startsWith("task.")) return <CheckCircle2 size={15} />;
  if (type.startsWith("calendar.")) return <CalendarDays size={15} />;
  if (type.startsWith("company.")) return <Users size={15} />;
  if (type.includes("comment")) return <MessageSquare size={15} />;
  return <CircleDot size={15} />;
}

function metadataDetails(event: ActivityEvent) {
  const metadata = event.metadata ?? {};
  const details: string[] = [];
  if (metadata.branch) details.push(`Branch: ${String(metadata.branch).replace("refs/heads/", "")}`);
  if (metadata.number) details.push(`PR #${String(metadata.number)}`);
  if (metadata.author) details.push(`Author: ${String(metadata.author)}`);
  if (metadata.from && metadata.to) details.push(`${String(metadata.from)} → ${String(metadata.to)}`);
  if (metadata.calendar) details.push(`Calendar: ${String(metadata.calendar)}`);
  if (Array.isArray(metadata.commits)) details.push(`${metadata.commits.length} commits`);
  return details;
}

export function ActivityFeed({
  projectId,
  companyId,
  taskId,
}: {
  projectId?: string;
  companyId?: string;
  taskId?: string;
}) {
  const { data } = useWorkspace();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const activity = data.activity
    .filter(
      (event) =>
        (!projectId || event.projectId === projectId) &&
        (!companyId || event.companyId === companyId) &&
        (!taskId || (event.entityType === "task" && event.entityId === taskId)),
    );
  const updates = data.updates.filter((update) => update.projectId === projectId);
  const githubEntries = activity.filter((event) => event.source === "github");
  const projectEntries: FeedItem[] = [
    ...activity
      .filter((event) => event.source !== "github")
      .map((value) => ({ kind: "activity" as const, value })),
    ...updates.map((value) => ({ kind: "update" as const, value })),
  ];
  const allEntries: FeedItem[] = [
    ...activity.map((value) => ({ kind: "activity" as const, value })),
    ...updates.map((value) => ({ kind: "update" as const, value })),
  ].sort((a, b) => {
    const left = a.kind === "activity" ? a.value.timestamp : a.value.createdAt;
    const right = b.kind === "activity" ? b.value.timestamp : b.value.createdAt;
    return right.localeCompare(left);
  });
  const entries = filter === "github"
    ? githubEntries.map((value) => ({ kind: "activity" as const, value }))
    : filter === "project"
      ? projectEntries.sort((a, b) => {
          const left = a.kind === "activity" ? a.value.timestamp : a.value.createdAt;
          const right = b.kind === "activity" ? b.value.timestamp : b.value.createdAt;
          return right.localeCompare(left);
        })
      : allEntries;
  return (
    <div className="activity-feed">
      <div className="activity-overview">
        <div>
          <strong>Project history</strong>
          <span>{allEntries.length} events · {updates.length} updates</span>
        </div>
        <div className="activity-filters" role="tablist" aria-label="Filter activity">
          {([
            ["all", "All", allEntries.length],
            ["project", "Project", projectEntries.length],
            ["github", "GitHub", githubEntries.length],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}<span>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="activity-list">
        {entries.map((entry) => {
          if (entry.kind === "update") {
            const update = entry.value;
            return (
              <article className="activity-card activity-card-update" key={`update:${update.id}`}>
                <div className="activity-card-icon"><FileText size={15} /></div>
                <div className="activity-card-main">
                  <div className="activity-card-heading">
                    <strong>Project update</strong>
                    <time>{dateLabel(update.createdAt)}</time>
                  </div>
                  <p>{update.body}</p>
                  <div className="activity-card-meta">
                    <PersonAvatar member={data.members.find((member) => member.id === update.createdBy)} />
                    <span>{data.members.find((member) => member.id === update.createdBy)?.name ?? "Team"}</span>
                    <span>Internal</span>
                  </div>
                </div>
              </article>
            );
          }
          const event = entry.value;
          const details = metadataDetails(event);
          const actor = event.source === "github"
            ? event.actorName || "GitHub"
            : data.members.find((member) => member.id === event.actorId)?.name ?? "Sistema";
          return (
            <article className={`activity-card ${event.source === "github" ? "activity-card-github" : "activity-card-internal"}`} key={event.id}>
              <div className="activity-card-icon">{iconFor(event.type, event.source === "github")}</div>
              <div className="activity-card-main">
                <div className="activity-card-heading">
                  <strong>{typeLabels[event.type] ?? event.type}</strong>
                  <time>{dateLabel(event.timestamp)}</time>
                </div>
                <p>{event.summary}</p>
                <div className="activity-card-meta">
                  <PersonAvatar member={data.members.find((member) => member.id === event.actorId)} />
                  <span>{actor}</span>
                  <span>{event.source === "github" ? "GitHub" : "Workspace"}</span>
                </div>
                {details.length > 0 && (
                  <details className="activity-details">
                    <summary>Details</summary>
                    <div>{details.map((detail) => <span key={detail}>{detail}</span>)}</div>
                  </details>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!entries.length && (
        <p className="focus-empty">No activity yet.</p>
      )}
    </div>
  );
}
