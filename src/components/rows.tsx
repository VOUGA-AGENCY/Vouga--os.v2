"use client";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  GitPullRequest,
} from "lucide-react";
import type { Meeting, Organization, Project, Task } from "@/domain/model";
import { projectStatuses, stages, taskStatuses } from "@/domain/model";
import { dateKey, relativeDate, shortDate, timeLabel } from "@/domain/time";
import { useWorkspace } from "./context";
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}
export function TaskRow({
  task,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
}) {
  const { data, edit, command, busy, notify } = useWorkspace();
  const project = data.projects.find((p) => p.id === task.projectId);
  const member = data.members.find((m) => m.id === task.ownerId);
  const overdue =
    task.dueOn && task.dueOn < dateKey(data.now) && task.status !== "done";
  return (
    <div
      className={`task-row ${task.status === "done" ? "task-row-done" : ""}`}
    >
      <button
        className={`task-check ${task.status === "done" ? "task-check-done" : ""}`}
        aria-label={`${task.status === "done" ? "Reabrir" : "Concluir"} ${task.title}`}
        disabled={busy}
        onClick={() =>
          void command("task.status", {
            id: task.id,
            version: task.version,
            status: task.status === "done" ? "todo" : "done",
          }).catch((e) => notify(e.message))
        }
      >
        {task.status === "done" && <Check size={13} />}
      </button>
      <button
        className="row-main"
        onClick={() => edit({ type: "task", id: task.id })}
      >
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          {project?.name ?? "Sem projeto"}
          {!compact && ` · ${member?.name}`}
          {task.status === "blocked" && (
            <span className="danger"> · Bloqueada</span>
          )}
          {task.status === "doing" && " · Em curso"}
        </span>
      </button>
      <span
        className={`row-date ${overdue ? "danger" : task.dueOn === dateKey(data.now) ? "accent" : ""}`}
      >
        {relativeDate(task.dueOn, dateKey(data.now))}
      </span>
    </div>
  );
}
export function MeetingRow({
  meeting,
  showDate = false,
}: {
  meeting: Meeting;
  showDate?: boolean;
}) {
  const { data, edit } = useWorkspace();
  const owner = data.members.find((m) => m.id === meeting.calendarOwnerId);
  return (
    <button
      className={`meeting-row ${meeting.cancelled ? "muted" : ""}`}
      onClick={() => edit({ type: "meeting", id: meeting.id })}
    >
      <span className="meeting-time">
        {showDate && <small>{shortDate(meeting.startsAt)}</small>}
        <time>{timeLabel(meeting.startsAt)}</time>
        <small>{timeLabel(meeting.endsAt)}</small>
      </span>
      <span className="meeting-rule" />
      <span className="row-main">
        <span className="row-title">{meeting.title}</span>
        <span className="row-meta">
          {meeting.cancelled
            ? "Cancelado"
            : meeting.kind === "event"
              ? "Evento"
              : "Reunião"}{" "}
          · {owner?.name}
          {meeting.createdBy !== meeting.calendarOwnerId && " · Delegada"}
        </span>
      </span>
      <ChevronRight className="row-chevron" size={15} />
    </button>
  );
}
export function OrganizationRow({
  organization: o,
}: {
  organization: Organization;
}) {
  const { data, edit } = useWorkspace();
  return (
    <button
      className="organization-row"
      onClick={() => edit({ type: "organization", id: o.id })}
    >
      <span className="organization-monogram" aria-hidden="true">
        {o.name.slice(0, 1)}
      </span>
      <span className="row-main">
        <span className="row-title">{o.name}</span>
        <span className="row-meta">
          {o.person || "Pessoa por identificar"} ·{" "}
          {data.members.find((m) => m.id === o.ownerId)?.name}
          <span className="organization-stage-mobile">
            {" "}
            · {stages[o.stage]}
          </span>
        </span>
      </span>
      <span className="organization-stage">
        <span className={`status-dot status-${o.stage}`} />
        {stages[o.stage]}
      </span>
      <span className="organization-next">
        <span>{o.nextStep || "Definir próximo passo"}</span>
        <small>
          {o.followUpOn
            ? relativeDate(o.followUpOn, dateKey(data.now))
            : "Sem data"}
        </small>
      </span>
      <ChevronRight size={15} />
    </button>
  );
}
export function ProjectRow({ project: p }: { project: Project }) {
  const { data, openProject } = useWorkspace();
  const org = data.organizations.find((o) => o.id === p.organizationId);
  const prs = data.pullRequests.filter(
    (pr) => pr.projectId === p.id && ["open", "draft"].includes(pr.state),
  );
  return (
    <button className="project-row" onClick={() => openProject(p.id)}>
      <span className="row-main">
        <span className="row-eyebrow">{org?.name ?? "Projeto interno"}</span>
        <span className="project-name">{p.name}</span>
        <span className="row-meta">
          {p.nextStep || "Próximo passo por definir"}
        </span>
        <span className="project-mobile-meta">
          {projectStatuses[p.status]} ·{" "}
          {relativeDate(p.dueOn, dateKey(data.now))}
        </span>
      </span>
      <span className="project-facts">
        <span>
          <span className={`status-dot status-${p.status}`} />
          {projectStatuses[p.status]}
        </span>
        <span>
          <Clock3 size={13} />
          {relativeDate(p.dueOn, dateKey(data.now))}
        </span>
        {prs.length > 0 && (
          <span>
            <GitPullRequest size={13} />
            {prs.length} {prs.length === 1 ? "PR ativo" : "PRs ativos"}
          </span>
        )}
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
}
export function StatusSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: Task["status"];
  onChange: (value: Task["status"]) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Estado da tarefa"
      value={value}
      onChange={(e) => onChange(e.target.value as Task["status"])}
      disabled={disabled}
    >
      {Object.entries(taskStatuses).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
