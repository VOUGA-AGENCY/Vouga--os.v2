"use client";
import { useEffect, useState } from "react";
import { CalendarDays, MessageSquare, Plus, X } from "lucide-react";
import {
  projectStatuses,
  stages,
  taskStatuses,
  type Snapshot,
} from "@/domain/model";
import { canEditMeeting } from "@/domain/permissions";
import { addDays, dateKey, localDateTime, shortDate } from "@/domain/time";
import { useWorkspace, type Editor } from "./context";
import { Dialog } from "./dialog";

function SideEditor({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="side-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="side-panel" role="dialog" aria-modal="true" aria-label={title}><header className="side-panel-header"><span>{title}</span><button aria-label="Close event" onClick={onClose}><X size={17}/></button></header><div className="side-panel-scroll">{children}</div></aside></div>;
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
  label = "Guardar",
  extra,
}: FormProps) {
  const { command } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="record-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        const fields: Record<string, unknown> = Object.fromEntries(form);
        for (const key of ["memberIds", "participantIds"])
          if (form.has(`${key}Present`)) fields[key] = form.getAll(key);
        for (const key of ["pinned", "archived"])
          if (form.has(`${key}Present`)) fields[key] = form.has(key);
        setBusy(true);
        setError("");
        try {
          await command(action, { ...values, ...fields });
          onClose();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Não foi possível guardar.",
          );
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
            Cancelar
          </button>
        )}
        <button className="button-primary" disabled={busy}>
          {busy ? "A guardar…" : label}
        </button>
      </footer>
    </form>
  );
}
function Person({
  data,
  name = "ownerId",
  value,
  label = "Responsável",
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
        <label>
          Projeto
          <select name="projectId" defaultValue={projectId ?? ""}>
            <option value="">Sem projeto</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Organização
        <select name="organizationId" defaultValue={organizationId ?? ""}>
          <option value="">Sem organização</option>
          {data.organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
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
      <legend>
        {name === "memberIds" ? "Equipa do projeto" : "Participantes"}
      </legend>
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
      <Dialog title={item ? "Tarefa" : "Nova tarefa"} onClose={onClose}>
        <SaveForm
          action="task.save"
          values={item ? { id, version: item.version } : {}}
          onClose={onClose}
        >
          <label>
            O que precisa de ser feito?
            <input
              name="title" className="composer-title" placeholder="Title"
              defaultValue={item?.title}
              maxLength={160}
              required
              autoFocus
            />
          </label>
          <div className="form-grid">
            <Person data={data} value={item?.ownerId} />
            <label>
              Prazo
              <input
                type="date"
                name="dueOn"
                defaultValue={item?.dueOn ?? ""}
              />
            </label>
          </div>
          <Relations
            data={data}
            projectId={item?.projectId ?? editor.projectId}
            organizationId={item?.organizationId ?? editor.organizationId}
          />
          <label>
            Estado
            <select name="status" defaultValue={item?.status ?? "todo"}>
              {Object.entries(taskStatuses).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contexto
            <textarea
              name="body"
              defaultValue={item?.body}
              maxLength={10000}
              rows={4}
              placeholder="O que é preciso saber para avançar?"
            />
          </label>
        </SaveForm>
      </Dialog>
    );
  }
  if (type === "meeting") {
    const item = data.meetings.find((m) => m.id === id);
    if (item && (!canEditMeeting(data.me, item) || item.allDay || item.recurringEventId))
      return (
        <SideEditor title={item.title} onClose={onClose}>
          <div className="dialog-body form-stack">
            <p>
              {localDateTime(item.startsAt).replace("T", " · ")} —{" "}
              {localDateTime(item.endsAt).slice(11)} · Lisboa
            </p>
            <p>{item.body || "Sem notas adicionais."}</p>
            {canEditMeeting(data.me,item) && <SaveForm action="meeting.participants" values={{id:item.id,version:item.version}} onClose={onClose} label="Save participants"><Members data={data} name="participantIds" selected={item.participantIds}/></SaveForm>}
            <p className="muted">
              Calendário {item.calendarKey === "contacto" ? "Contacto" : "Office"}.
              Participantes: {item.participantIds.map((id) => data.members.find((member) => member.id === id)?.name).join(", ") || "Por associar"}.
              Externos: {item.externalParticipants?.join(", ") || "—"}
              {item.googleEventUrl && <a href={item.googleEventUrl} target="_blank" rel="noreferrer">Open Google Calendar</a>}
            </p>
          </div>
        </SideEditor>
      );
    const day = editor.date ?? dateKey(data.now);
    const startTime = `${day}T${editor.time ?? "10:00"}`;
    const [hours, minutes] = (editor.time ?? "10:00").split(":").map(Number);
    const endMinutes = hours * 60 + minutes + (editor.duration ?? 30);
    const endTime = `${addDays(day, Math.floor(endMinutes / 1440))}T${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    return <SideEditor title={item ? "Event" : "New event"} onClose={onClose}><SaveForm action="meeting.save" values={item ? { id, version: item.version } : {}} onClose={onClose} label={item ? "Save event" : "Create event"}>
      <input className="composer-title" name="title" aria-label="Event title" placeholder="Event title" defaultValue={item?.title} required maxLength={160} autoFocus/>
      <textarea className="composer-description" name="body" aria-label="Event description" placeholder="Add a description…" defaultValue={item?.body} rows={3}/>
      <div className="composer-properties"><label>Starts<input name="startsAt" type="datetime-local" defaultValue={item ? localDateTime(item.startsAt) : startTime} required/></label><label>Ends<input name="endsAt" type="datetime-local" defaultValue={item ? localDateTime(item.endsAt) : endTime} required/></label><label>Calendar<select name="calendarKey" defaultValue={item?.calendarKey ?? ((editor.organizationId || item?.organizationId) && !(editor.projectId || item?.projectId) ? "contacto" : "office")}><option value="office">Office</option><option value="contacto">Contacto</option></select></label><label>Type<select name="kind" defaultValue={item?.kind ?? "meeting"}><option value="meeting">Meeting</option><option value="event">Event</option></select></label></div>
      <Members data={data} name="participantIds" selected={item?.participantIds ?? [data.me.id]}/><p className="composer-hint">Os participantes internos recebem os lembretes por Telegram.</p><label>External participants<input name="externalParticipants" defaultValue={item?.externalParticipants?.join(", ")} placeholder="nome@empresa.pt, …"/></label>{item?.googleEventUrl && <a className="text-button" href={item.googleEventUrl} target="_blank" rel="noreferrer">Open Google Calendar</a>}{item && <p className="composer-hint">Google sync · {item.syncStatus ?? "local"}</p>}{item?.syncStatus === "conflict" && <div className="composer-properties"><span>Revê o evento no Google e escolhe a versão a manter.</span>{(["google","os"] as const).map((keep) => <button type="button" key={keep} onClick={async () => {try {const response=await fetch("/api/integrations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"calendar.resolve",id:item.id,version:item.version,keep})});const result=await response.json();if(!response.ok)throw new Error(result.error);await workspace.refresh();onClose();}catch(error){workspace.notify(error instanceof Error?error.message:"Falha ao resolver.");}}}>Manter versão {keep === "google" ? "Google" : "OS"}</button>)}</div>}
      <div className="composer-properties"><Relations data={data} projectId={item?.projectId ?? editor.projectId} organizationId={item?.organizationId ?? editor.organizationId}/></div>
      {item && <button type="button" className="text-button danger" onClick={() => void workspace.command("meeting.cancel", { id, version: item.version }).then(onClose).catch((error) => workspace.notify(error.message))}>{item.cancelled ? "Restore event" : "Cancel event"}</button>}
    </SaveForm></SideEditor>;
  }
  if (type === "organization")
    return <OrganizationEditor data={data} id={id} onClose={onClose} />;
  if (type === "project") {
    const item = data.projects.find((project) => project.id === id);
    return <Dialog title={item ? "Edit project" : "New project"} onClose={onClose} wide><SaveForm action="project.save" values={item ? { id, version: item.version } : {}} onClose={onClose} label={item ? "Save project" : "Create project"}>
      <input className="composer-title" name="name" aria-label="Project name" placeholder="Project name" defaultValue={item?.name} required maxLength={160} autoFocus/>
      <textarea className="composer-description" name="objective" aria-label="Project summary" placeholder="Add a short summary…" defaultValue={item?.objective} rows={3}/>
      <div className="composer-properties"><label>Status<select name="status" defaultValue={item?.status ?? "active"}>{Object.entries(projectStatuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><Person data={data} value={item?.ownerId} label="Lead"/><label>Target<input type="date" name="dueOn" defaultValue={item?.dueOn ?? ""}/></label><Relations data={data} organizationId={item?.organizationId} project={false}/></div>
      <Members data={data} name="memberIds" selected={item?.memberIds ?? [data.me.id]}/>
      <input className="composer-line" name="nextStep" aria-label="Next action" placeholder="Next action…" defaultValue={item?.nextStep} maxLength={500}/>
      <details className="composer-extra"><summary>Repository</summary><input name="repositoryUrl" type="url" aria-label="GitHub repository" placeholder="https://github.com/team/project" defaultValue={item?.repositoryUrl}/></details>
    </SaveForm></Dialog>;
  }
  const pr = data.pullRequests.find((p) => p.id === id);
  return (
    <Dialog
      title={pr ? "Pull request" : "Ligar pull request"}
      onClose={onClose}
    >
      <SaveForm
        action="pr.save"
        values={pr ? { id, version: pr.version } : {}}
        onClose={onClose}
      >
        <input
          type="hidden"
          name="projectId"
          value={pr?.projectId ?? editor.projectId}
        />
        <label>
          Título
          <input
            name="title" className="composer-title" placeholder="Title"
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
            placeholder="https://github.com/equipa/repo/pull/123"
          />
        </label>
        <label>
          Estado
          <select name="state" defaultValue={pr?.state ?? "open"}>
            <option value="open">Aberto</option>
            <option value="draft">Rascunho</option>
            <option value="merged">Integrado</option>
            <option value="closed">Fechado</option>
          </select>
        </label>
        <p className="field-hint">
          O estado é atualizado aqui manualmente. A sincronização com GitHub
          será ligada numa próxima fase.
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
  if (!item) return <Dialog title="New company" onClose={onClose}><SaveForm action="organization.save" onClose={onClose} label="Create company"><input className="composer-title" name="name" aria-label="Company name" placeholder="Company name" maxLength={160} required autoFocus/><p className="muted">Add notes and meetings to its timeline after creating it.</p><div className="form-grid"><label>Status<select name="stage" defaultValue="new">{Object.entries(stages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><Person data={data}/></div></SaveForm></Dialog>;
  return (
    <Dialog title={item?.name ?? "Novo contacto"} onClose={onClose} wide>
      {item && <div className="organization-summary">
        <div><span className="row-meta">Pessoas</span><strong>{data.contacts.filter((person) => person.organizationId === id).map((person) => person.name).join(", ") || item.person || "—"}</strong><button className="text-button" onClick={() => setAddingContact(!addingContact)}>{addingContact ? "Cancelar" : "+ Pessoa"}</button></div>
        {addingContact && <form className="inline-contact-form" onSubmit={(event) => {event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries()); void command("contact.add", {...values, organizationId:id}).then(() => setAddingContact(false)).catch((error) => notify(error.message));}}><input name="name" aria-label="Nome da pessoa" placeholder="Nome" required/><input name="email" type="email" aria-label="Email da pessoa" placeholder="Email"/><input name="phone" aria-label="Telefone da pessoa" placeholder="Telefone"/><button className="button-secondary">Adicionar</button></form>}
        <div><span className="row-meta">Última interação</span><strong>{interactions[0] ? shortDate(interactions[0].createdAt) : "—"}</strong></div>
        <div><span className="row-meta">Próximo passo</span><strong>{item.nextStep || "—"}</strong><span className="row-meta">{item.followUpOn || ""}</span></div>
        <div><span className="row-meta">Projetos</span><strong>{data.projects.filter((project) => project.organizationId === id).map((project) => project.name).join(", ") || "—"}</strong></div>
        <div><span className="row-meta">Reuniões</span><strong>{data.meetings.filter((meeting) => meeting.organizationId === id && !meeting.cancelled).length}</strong></div>
        <div><span className="row-meta">Notas</span><strong>{data.notes.filter((note) => note.organizationId === id && !note.archived).length}</strong></div>
      </div>}
      {item && (
        <div className="editor-tabs">
          <button
            className={tab === "conversation" ? "tab active" : "tab"}
            onClick={() => setTab("conversation")}
          >
            <MessageSquare size={14} />
            Conversa
          </button>
          <button
            className={tab === "details" ? "tab active" : "tab"}
            onClick={() => setTab("details")}
          >
            Detalhes
          </button>
          <button
            className="text-button"
            onClick={() => edit({ type: "meeting", organizationId: id })}
          >
            <CalendarDays size={14} />
            Marcar reunião
          </button>
        </div>
      )}
      {tab === "conversation" && item ? (
        <SaveForm
          action="interaction.add"
          values={{ organizationId: id, version: item.version }}
          onClose={onClose}
          label="Registar conversa"
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
            O que ficou da conversa?
            <textarea
              name="body"
              required
              rows={3}
              autoFocus
              placeholder="Regista o essencial."
            />
          </label>
          <div className="form-grid">
            <label>
              Canal
              <select name="channel">
                <option value="note">Nota</option>
                <option value="call">Chamada</option>
                <option value="email">Email</option>
                <option value="meeting">Reunião</option>
              </select>
            </label>
            <label>
              Estado
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
            Próximo passo
            <input
              name="nextStep"
              defaultValue={item.nextStep}
              maxLength={500}
            />
          </label>
          <label>
            Retomar em
            <input
              type="date"
              name="followUpOn"
              defaultValue={item.followUpOn ?? addDays(dateKey(data.now), 1)}
            />
          </label>
        </SaveForm>
      ) : (
        <SaveForm
          action="organization.save"
          values={item ? { id, version: item.version } : {}}
          onClose={onClose}
        >
          <label>
            Organização
            <input
              name="name"
              defaultValue={item?.name}
              required
              maxLength={160}
              autoFocus
            />
          </label>
          <label>
            Pessoa de contacto
            <input name="person" defaultValue={item?.person} maxLength={160} />
          </label>
          <div className="form-grid">
            <label>
              Email
              <input type="email" name="email" defaultValue={item?.email} />
            </label>
            <label>
              Telefone
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
              Estado
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
            Próximo passo
            <input
              name="nextStep"
              defaultValue={item?.nextStep}
              maxLength={500}
            />
          </label>
          <label>
            Retomar em
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
                Arquivar organização
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
      label="Registar atualização"
      extra={
        <span className="subtle">
          <Plus size={13} /> Contexto para a equipa
        </span>
      }
    >
      <label>
        O que mudou?
        <textarea
          name="body"
          required
          rows={3}
          placeholder="O que avançou, o que falta ou o que está bloqueado."
        />
      </label>
    </SaveForm>
  );
}
