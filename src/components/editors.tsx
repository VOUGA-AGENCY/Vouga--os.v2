"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, MessageSquare, Plus, X } from "lucide-react";
import {
  projectStatuses,
  stages,
  taskSizeLabels,
  taskStatuses,
  type Snapshot,
} from "@/domain/model";
import { calendarOptions, calendarTarget } from "@/domain/calendars";
import { canEditMeeting } from "@/domain/permissions";
import { addDays, dateKey, localDateTime, shortDate } from "@/domain/time";
import { useWorkspace, type Editor } from "./context";
import { flushEdits, formFields, SaveStatus, useAutosave } from "./autosave";
import { Dialog } from "./dialog";
import { RelationSelect } from "./relation-select";

function SideEditor({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="side-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="side-panel-header">
          <span>{title}</span>
          <button aria-label="Close event" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="side-panel-scroll">{children}</div>
      </aside>
    </div>
  );
}

type FormProps = {
  children: React.ReactNode;
  action: string;
  values?: Record<string, unknown>;
  onClose: () => void;
  label?: string;
  extra?: React.ReactNode;
};
function SaveForm({
  children,
  action,
  values = {},
  onClose,
  label = "Save",
  extra,
}: FormProps) {
  const { command } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const autosave = useAutosave(
    action,
    typeof values.id === "string" ? values.id : undefined,
    Number(values.version),
  );
  const baseline = useRef<Record<string, unknown> | null>(null);
  function changed(form: HTMLFormElement) {
    if (!values.id) return;
    const fields = formFields(form);
    if (JSON.stringify(fields) === JSON.stringify(baseline.current)) return;
    baseline.current = fields;
    autosave.patch({ ...values, ...fields });
  }
  return (
    <form
      className="record-composer"
      ref={(form) => {
        if (form && baseline.current === null)
          baseline.current = formFields(form);
      }}
      onBlur={(event) => {
        changed(event.currentTarget);
        void autosave.flush().catch(() => undefined);
      }}
      onInput={(event) => {
        if (!values.id) return;
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === "hidden")
          changed(event.currentTarget);
        else if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          const fields = formFields(event.currentTarget);
          if (JSON.stringify(fields) !== JSON.stringify(baseline.current)) {
            baseline.current = fields;
            autosave.stage({ ...values, ...fields });
          }
        }
      }}
      onChange={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement &&
            ["hidden", "checkbox", "date", "datetime-local"].includes(
              target.type,
            ))
        )
          changed(event.currentTarget);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        const fields: Record<string, unknown> = Object.fromEntries(form);
        for (const key of ["memberIds", "participantIds", "calendarTargets"])
          if (form.has(`${key}Present`)) fields[key] = form.getAll(key);
        for (const key of ["pinned", "archived", "allDay"])
          if (form.has(`${key}Present`)) fields[key] = form.has(key);
        setBusy(true);
        setError("");
        try {
          if (values.id) {
            changed(e.currentTarget);
            await autosave.flush();
          } else {
            await command(action, { ...values, ...fields });
            onClose();
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-stack dialog-body">
        {children}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="dialog-footer">
        {extra ?? (
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        )}
        {values.id ? (
          <SaveStatus saver={autosave.saver} />
        ) : (
          <button className="button-primary" disabled={busy}>
            {busy ? "Saving…" : label}
          </button>
        )}
      </footer>
    </form>
  );
}
function Person({
  data,
  name = "ownerId",
  value,
  label = "Owner",
}: {
  data: Snapshot;
  name?: string;
  value?: string;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? data.me.id}>
        {data.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Relations({
  data,
  projectId,
  organizationId,
  project = true,
}: {
  data: Snapshot;
  projectId?: string | null;
  organizationId?: string | null;
  project?: boolean;
}) {
  return (
    <div className="form-grid">
      {project && (
        <RelationSelect
          name="projectId"
          label="Project"
          emptyLabel="No project"
          defaultValue={projectId ?? ""}
          options={data.projects}
        />
      )}
      <RelationSelect
        name="organizationId"
        label="Organization"
        emptyLabel="No organization"
        defaultValue={organizationId ?? ""}
        options={data.organizations}
      />
    </div>
  );
}
function Members({
  data,
  name,
  selected,
}: {
  data: Snapshot;
  name: "memberIds" | "participantIds";
  selected: string[];
}) {
  return (
    <fieldset>
      <legend>{name === "memberIds" ? "Project team" : "Participants"}</legend>
      <input name={`${name}Present`} type="hidden" value="1" />
      <div className="checkbox-group">
        {data.members.map((m) => (
          <label className="checkbox-label" key={m.id}>
            <input
              type="checkbox"
              name={name}
              value={m.id}
              defaultChecked={selected.includes(m.id)}
            />
            {m.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function RecordEditor({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const workspace = useWorkspace();
  // Freeze the edited version. Background refreshes must not turn stale form data
  // into a valid write against a newer version.
  const [data] = useState(workspace.data);
  const { type, id } = editor;
  if (type === "task") {
    const item = data.tasks.find((t) => t.id === id);
    return (
      <Dialog title={item ? "Task" : "New task"} onClose={onClose}>
        <SaveForm
          action="task.save"
          values={item ? { id, version: item.version } : {}}
          onClose={onClose}
        >
          <label>
            What needs to be done?
            <input
              name="title"
              className="composer-title"
              placeholder="Title"
              defaultValue={item?.title}
              maxLength={160}
              required
              autoFocus
            />
          </label>
          <div className="form-grid">
            <Person data={data} value={item?.ownerId} />
            <label>
              Visibility
              <select
                name="visibility"
                defaultValue={item?.visibility ?? "team"}
              >
                <option value="team">Team</option>
                <option value="private">Private · just me</option>
              </select>
            </label>
            <label>
              Deadline
              <input
                type="date"
                name="dueOn"
                defaultValue={item?.dueOn ?? ""}
              />
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={item?.priority ?? "none"}>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              Size
              <select name="size" defaultValue={item?.size ?? ""}>
                <option value="">None</option>
                {Object.entries(taskSizeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Relations
            data={data}
            projectId={item?.projectId ?? editor.projectId}
            organizationId={item?.organizationId ?? editor.organizationId}
          />
          <label>
            Status
            <select name="status" defaultValue={item?.status ?? "todo"}>
              {Object.entries(taskStatuses).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Context
            <textarea
              name="body"
              defaultValue={item?.body}
              maxLength={10000}
              rows={4}
              placeholder="What needs to be known to move forward?"
            />
          </label>
        </SaveForm>
      </Dialog>
    );
  }
  if (type === "meeting") {
    const item = data.meetings.find((m) => m.id === id);
    if (item && !canEditMeeting(data.me, item))
      return (
        <SideEditor title={item.title} onClose={onClose}>
          <div className="dialog-body form-stack">
            <p>
              {localDateTime(item.startsAt).replace("T", " · ")} —{" "}
              {localDateTime(item.endsAt).slice(11)} · Lisbon
            </p>
            <p>{item.body || "No additional notes."}</p>
            {canEditMeeting(data.me, item) && (
              <SaveForm
                action="meeting.participants"
                values={{ id: item.id, version: item.version }}
                onClose={onClose}
                label="Save participants"
              >
                <Members
                  data={data}
                  name="participantIds"
                  selected={item.participantIds}
                />
              </SaveForm>
            )}
            <p className="muted">
              Calendar {item.calendarKey === "contacto" ? "Contacto" : "Office"}
              . Participants:{" "}
              {item.participantIds
                .map(
                  (id) => data.members.find((member) => member.id === id)?.name,
                )
                .join(", ") || "For associating"}
              . External: {item.externalParticipants?.join(", ") || "—"}
              {item.googleEventUrl && (
                <a href={item.googleEventUrl} target="_blank" rel="noreferrer">
                  Open Google Calendar
                </a>
              )}
            </p>
          </div>
        </SideEditor>
      );
    const day = editor.date ?? dateKey(data.now);
    const startTime = `${day}T${editor.time ?? "10:00"}`;
    const [hours, minutes] = (editor.time ?? "10:00").split(":").map(Number);
    const endMinutes = hours * 60 + minutes + (editor.duration ?? 30);
    const endTime = `${addDays(day, Math.floor(endMinutes / 1440))}T${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const selectedCalendars = item
      ? data.meetings
          .filter(
            (event) =>
              !event.cancelled &&
              (event.id === item.id ||
                (item.groupId && event.groupId === item.groupId)),
          )
          .map(calendarTarget)
      : [
          editor.organizationId
            ? "contacto"
            : data.me.role === "admin"
              ? "office"
              : `personal:${data.me.id}`,
        ];
    return (
      <SideEditor title={item ? "Event" : "New event"} onClose={onClose}>
        <SaveForm
          action="meeting.save"
          values={item ? { id, version: item.version } : {}}
          onClose={onClose}
          label={item ? "Save event" : "Create event"}
        >
          <input
            className="composer-title"
            name="title"
            aria-label="Event title"
            placeholder="Event title"
            defaultValue={item?.title}
            required
            maxLength={160}
            autoFocus
          />
          <textarea
            className="composer-description"
            name="body"
            aria-label="Event description"
            placeholder="Event description…"
            defaultValue={item?.body}
            rows={3}
          />
          <div className="event-date-fields">
            <label>
              Starts
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={item ? localDateTime(item.startsAt) : startTime}
                required
              />
            </label>
            <label>
              Ends
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={item ? localDateTime(item.endsAt) : endTime}
                required
              />
            </label>
          </div>
          <input type="hidden" name="kind" value="event" />
          <input type="hidden" name="allDayPresent" value="1" />
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="allDay"
              defaultChecked={item?.allDay}
            />
            All day
          </label>
          <fieldset>
            <legend>Calendars</legend>
            <input type="hidden" name="calendarTargetsPresent" value="1" />
            <div className="calendar-selection">
              {calendarOptions(data.me, data.members).map((option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    name="calendarTargets"
                    value={option.id}
                    defaultChecked={selectedCalendars.includes(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Members
            data={data}
            name="participantIds"
            selected={item?.participantIds ?? [data.me.id]}
          />
          <label>
            External participants
            <input
              name="externalParticipants"
              defaultValue={item?.externalParticipants?.join(", ")}
              placeholder="nome@empresa.pt, …"
            />
          </label>
          {item?.googleEventUrl && (
            <a
              className="text-button"
              href={item.googleEventUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Google Calendar
            </a>
          )}
          {item && (
            <p className="composer-hint">
              Google sync · {item.syncStatus ?? "local"}
            </p>
          )}
          {item?.syncStatus === "conflict" && (
            <div className="composer-properties">
              <span>
                Review the event in Google and choose which version to keep.
              </span>
              {(["google", "os"] as const).map((keep) => (
                <button
                  type="button"
                  key={keep}
                  onClick={async () => {
                    try {
                      const response = await fetch("/api/integrations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "calendar.resolve",
                          id: item.id,
                          version: item.version,
                          keep,
                        }),
                      });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error);
                      await workspace.refresh();
                      onClose();
                    } catch (error) {
                      workspace.notify(
                        error instanceof Error
                          ? error.message
                          : "Could not resolve.",
                      );
                    }
                  }}
                >
                  Keep {keep === "google" ? "Google" : "OS"} version
                </button>
              ))}
            </div>
          )}
          <div className="composer-properties">
            <Relations
              data={data}
              projectId={item?.projectId ?? editor.projectId}
              organizationId={item?.organizationId ?? editor.organizationId}
            />
          </div>
          {item && (
            <button
              type="button"
              className="text-button danger"
              onClick={() => {
                if (
                  !item.cancelled &&
                  !window.confirm(`Delete the event “${item.title}”?`)
                )
                  return;
                void flushEdits()
                  .then(() =>
                    workspace.command("meeting.cancel", {
                      id,
                      version: item.version,
                    }),
                  )
                  .then(onClose)
                  .catch((error) => workspace.notify(error.message));
              }}
            >
              {item.cancelled ? "Restore event" : "Delete event"}
            </button>
          )}
        </SaveForm>
      </SideEditor>
    );
  }
  if (type === "organization")
    return <OrganizationEditor data={data} id={id} onClose={onClose} />;
  if (type === "project") {
    const item = data.projects.find((project) => project.id === id);
    return (
      <Dialog
        title={item ? "Edit project" : "New project"}
        onClose={onClose}
        wide
      >
        <SaveForm
          action="project.save"
          values={item ? { id, version: item.version } : {}}
          onClose={onClose}
          label={item ? "Save project" : "Create project"}
          extra={
            item ? (
              <>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete the project “${item.name}” and all its tasks?`,
                      )
                    )
                      return;
                    void flushEdits()
                      .then(() =>
                        workspace.command("project.delete", {
                          id: item.id,
                          version: item.version,
                        }),
                      )
                      .then(onClose)
                      .catch((error) => workspace.notify(error.message));
                  }}
                >
                  Delete project
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </>
            ) : undefined
          }
        >
          <input
            className="composer-title"
            name="name"
            aria-label="Project name"
            placeholder="Project name"
            defaultValue={item?.name}
            required
            maxLength={160}
            autoFocus
          />
          <textarea
            className="composer-description"
            name="objective"
            aria-label="Project summary"
            placeholder="Add a short summary…"
            defaultValue={item?.objective}
            rows={3}
          />
          <div className="composer-properties">
            <label>
              Status
              <select name="status" defaultValue={item?.status ?? "active"}>
                {Object.entries(projectStatuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Person data={data} value={item?.ownerId} label="Lead" />
            <label>
              Target
              <input
                type="date"
                name="dueOn"
                defaultValue={item?.dueOn ?? ""}
              />
            </label>
            <Relations
              data={data}
              organizationId={item?.organizationId}
              project={false}
            />
          </div>
          <Members
            data={data}
            name="memberIds"
            selected={item?.memberIds ?? [data.me.id]}
          />
          <input
            className="composer-line"
            name="nextStep"
            aria-label="Next action"
            placeholder="Next action…"
            defaultValue={item?.nextStep}
            maxLength={500}
          />
          <details className="composer-extra">
            <summary>Repository</summary>
            <input
              name="repositoryUrl"
              type="url"
              aria-label="GitHub repository"
              placeholder="https://github.com/team/project"
              defaultValue={item?.repositoryUrl}
            />
          </details>
        </SaveForm>
      </Dialog>
    );
  }
  const pr = data.pullRequests.find((p) => p.id === id);
  return (
    <Dialog title={pr ? "Pull request" : "Link pull request"} onClose={onClose}>
      <SaveForm
        action="pr.save"
        values={pr ? { id, version: pr.version } : {}}
        onClose={onClose}
        extra={
          pr ? (
            <>
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  if (!window.confirm(`Delete the pull request “${pr.title}”?`))
                    return;
                  void flushEdits()
                    .then(() =>
                      workspace.command("pr.delete", {
                        id: pr.id,
                        version: pr.version,
                      }),
                    )
                    .then(onClose)
                    .catch((error) => workspace.notify(error.message));
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
            </>
          ) : undefined
        }
      >
        <input
          type="hidden"
          name="projectId"
          value={pr?.projectId ?? editor.projectId}
        />
        <label>
          Title
          <input
            name="title"
            className="composer-title"
            placeholder="Title"
            defaultValue={pr?.title}
            required
            maxLength={160}
            autoFocus
          />
        </label>
        <label>
          Link GitHub
          <input
            name="url"
            type="url"
            defaultValue={pr?.url}
            required
            placeholder="https://github.com/team/repo/pull/123"
          />
        </label>
        <label>
          Status
          <select name="state" defaultValue={pr?.state ?? "open"}>
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <p className="field-hint">
          GitHub updates linked repositories through the App. Links added
          manually remain available here.
        </p>
      </SaveForm>
    </Dialog>
  );
}

function OrganizationEditor({
  data,
  id,
  onClose,
}: {
  data: Snapshot;
  id?: string;
  onClose: () => void;
}) {
  const { edit, command, notify } = useWorkspace();
  const item = data.organizations.find((o) => o.id === id);
  const [tab, setTab] = useState(item ? "conversation" : "details");
  const [addingContact, setAddingContact] = useState(false);
  const interactions = data.interactions
    .filter((i) => i.organizationId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!item)
    return (
      <Dialog title="New company" onClose={onClose}>
        <SaveForm
          action="organization.save"
          onClose={onClose}
          label="Create company"
        >
          <input
            className="composer-title"
            name="name"
            aria-label="Company name"
            placeholder="Company name"
            maxLength={160}
            required
            autoFocus
          />
          <p className="muted">
            Add notes and meetings to its timeline after creating it.
          </p>
          <div className="form-grid">
            <label>
              Status
              <select name="stage" defaultValue="new">
                {Object.entries(stages).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Person data={data} />
          </div>
        </SaveForm>
      </Dialog>
    );
  return (
    <Dialog title={item?.name ?? "New contact"} onClose={onClose} wide>
      {item && (
        <div className="organization-summary">
          <div>
            <span className="row-meta">People</span>
            <strong>
              {data.contacts
                .filter((person) => person.organizationId === id)
                .map((person) => person.name)
                .join(", ") ||
                item.person ||
                "—"}
            </strong>
            <button
              className="text-button"
              onClick={() => setAddingContact(!addingContact)}
            >
              {addingContact ? "Cancel" : "+ Person"}
            </button>
          </div>
          {addingContact && (
            <form
              className="inline-contact-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const values = Object.fromEntries(new FormData(form).entries());
                void command("contact.add", { ...values, organizationId: id })
                  .then(() => setAddingContact(false))
                  .catch((error) => notify(error.message));
              }}
            >
              <input
                name="name"
                aria-label="Person name"
                placeholder="Name"
                required
              />
              <input
                name="email"
                type="email"
                aria-label="Email da pessoa"
                placeholder="Email"
              />
              <input
                name="phone"
                aria-label="Person phone"
                placeholder="Phone"
              />
              <button className="button-secondary">Add</button>
            </form>
          )}
          <div>
            <span className="row-meta">Last interaction</span>
            <strong>
              {interactions[0] ? shortDate(interactions[0].createdAt) : "—"}
            </strong>
          </div>
          <div>
            <span className="row-meta">Next step</span>
            <strong>{item.nextStep || "—"}</strong>
            <span className="row-meta">{item.followUpOn || ""}</span>
          </div>
          <div>
            <span className="row-meta">Projects</span>
            <strong>
              {data.projects
                .filter((project) => project.organizationId === id)
                .map((project) => project.name)
                .join(", ") || "—"}
            </strong>
          </div>
          <div>
            <span className="row-meta">Meetings</span>
            <strong>
              {
                data.meetings.filter(
                  (meeting) =>
                    meeting.organizationId === id && !meeting.cancelled,
                ).length
              }
            </strong>
          </div>
          <div>
            <span className="row-meta">Notes</span>
            <strong>
              {
                data.notes.filter(
                  (note) => note.organizationId === id && !note.archived,
                ).length
              }
            </strong>
          </div>
        </div>
      )}
      {item && (
        <div className="editor-tabs">
          <button
            className={tab === "conversation" ? "tab active" : "tab"}
            onClick={() =>
              void flushEdits()
                .then(() => setTab("conversation"))
                .catch((error) => notify(error.message))
            }
          >
            <MessageSquare size={14} />
            Conversation
          </button>
          <button
            className={tab === "details" ? "tab active" : "tab"}
            onClick={() =>
              void flushEdits()
                .then(() => setTab("details"))
                .catch((error) => notify(error.message))
            }
          >
            Details
          </button>
          <button
            className="text-button"
            onClick={() => edit({ type: "meeting", organizationId: id })}
          >
            <CalendarDays size={14} />
            Schedule meeting
          </button>
        </div>
      )}
      {tab === "conversation" && item ? (
        <SaveForm
          key="conversation"
          action="interaction.add"
          values={{ organizationId: id, version: item.version }}
          onClose={onClose}
          label="Log conversation"
        >
          {interactions.length > 0 && (
            <div className="interaction-history">
              {interactions.slice(0, 8).map((i) => (
                <article key={i.id}>
                  <span className="row-meta">
                    {data.members.find((m) => m.id === i.createdBy)?.name} ·{" "}
                    {shortDate(i.createdAt)}
                  </span>
                  <p>{i.body}</p>
                </article>
              ))}
            </div>
          )}
          <label>
            What came out of the conversation?
            <textarea
              name="body"
              required
              rows={3}
              autoFocus
              placeholder="Record the essentials."
            />
          </label>
          <div className="form-grid">
            <label>
              Channel
              <select name="channel">
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
              </select>
            </label>
            <label>
              Status
              <select name="stage" defaultValue={item.stage}>
                {Object.entries(stages).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Next step
            <input
              name="nextStep"
              defaultValue={item.nextStep}
              maxLength={500}
            />
          </label>
          <label>
            Follow up on
            <input
              type="date"
              name="followUpOn"
              defaultValue={item.followUpOn ?? addDays(dateKey(data.now), 1)}
            />
          </label>
        </SaveForm>
      ) : (
        <SaveForm
          key="details"
          action="organization.save"
          values={item ? { id, version: item.version } : {}}
          onClose={onClose}
        >
          <label>
            Organization
            <input
              name="name"
              defaultValue={item?.name}
              required
              maxLength={160}
              autoFocus
            />
          </label>
          <label>
            Contact person
            <input name="person" defaultValue={item?.person} maxLength={160} />
          </label>
          <div className="form-grid">
            <label>
              Email
              <input type="email" name="email" defaultValue={item?.email} />
            </label>
            <label>
              Phone
              <input
                name="phone"
                type="tel"
                defaultValue={item?.phone}
                maxLength={50}
              />
            </label>
          </div>
          <div className="form-grid">
            <Person data={data} value={item?.ownerId} />
            <label>
              Status
              <select name="stage" defaultValue={item?.stage ?? "new"}>
                {Object.entries(stages).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Next step
            <input
              name="nextStep"
              defaultValue={item?.nextStep}
              maxLength={500}
            />
          </label>
          <label>
            Follow up on
            <input
              name="followUpOn"
              type="date"
              defaultValue={item?.followUpOn ?? ""}
            />
          </label>
          {item && (
            <>
              <input name="archivedPresent" type="hidden" value="1" />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="archived"
                  defaultChecked={item.archived}
                />
                Archive organization
              </label>
            </>
          )}
        </SaveForm>
      )}
    </Dialog>
  );
}

export function ProjectUpdateForm({
  id,
  onDone,
}: {
  id: string;
  onDone: () => void;
}) {
  return (
    <SaveForm
      action="project.update"
      values={{ projectId: id }}
      onClose={onDone}
      label="Log update"
      extra={
        <span className="subtle">
          <Plus size={13} /> Context for the team
        </span>
      }
    >
      <label>
        What changed?
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Progress, blockers or next steps."
        />
      </label>
    </SaveForm>
  );
}
