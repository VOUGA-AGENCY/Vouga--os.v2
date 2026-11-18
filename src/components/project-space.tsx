"use client";

import { Check, Download, FileText, FolderClosed, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Project, ProjectDeadline } from "@/domain/model";
import { dateKey, shortDate } from "@/domain/time";
import { useWorkspace } from "./context";
import { Dialog } from "./dialog";

type Entry = { id: string; title: string };
type Document = Entry & {
  body: string;
  mimeType: string | null;
  version: number;
  history: { authorName: string; at: string }[];
};

function projectFileUrl(project: string, doc?: string, mode?: string) {
  const params = new URLSearchParams({ project });
  if (doc) params.set("doc", doc);
  if (mode) params.set("mode", mode);
  return `/api/projects/space?${params}`;
}

async function projectRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not open the project file.");
  return result as T;
}

export function DocumentTree({ project }: { project: Project }) {
  const [entries, setEntries] = useState<Entry[]>([{ id: "context", title: "context.md" }]);
  const [active, setActive] = useState<string>();
  const [loaded, setLoaded] = useState<Document>();
  const [mode, setMode] = useState<"new" | "edit" | "read">();
  const [format, setFormat] = useState<"markdown" | "file">("markdown");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const doc = loaded?.id === active ? loaded : undefined;
  useEffect(() => {
    const controller = new AbortController();
    projectRequest<Entry[]>(projectFileUrl(project.id), { signal: controller.signal }).then(setEntries).catch(err => {
      if (!controller.signal.aborted) setLoadError(err.message);
    });
    return () => controller.abort();
  }, [project.id]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    projectRequest<Document>(projectFileUrl(project.id, active), { signal: controller.signal }).then(setLoaded).catch(err => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [active, project.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const importing = mode === "new" && format === "file";
      const { id } = await projectRequest<{ id: string }>(projectFileUrl(project.id), importing
        ? { method: "POST", body: form }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            action: "markdown", id: mode === "edit" ? doc?.id : undefined,
            version: doc?.version, title: form.get("title"), body: form.get("body"),
          }) });
      const [list, updated] = await Promise.all([
        projectRequest<Entry[]>(projectFileUrl(project.id)),
        projectRequest<Document>(projectFileUrl(project.id, id)),
      ]);
      setEntries(list);
      setLoaded(updated);
      setActive(id);
      setMode("read");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally { setSaving(false); }
  }

  return (
    <section className="space-files" aria-label="Project files">
      <div className="space-tree-root"><FolderClosed size={16} /> {project.name}/</div>
      <ul className="space-tree">
        {entries.map(entry => (
          <li key={entry.id}>
            <button onClick={() => { setError(""); setActive(entry.id); setMode("read"); }}>
              <FileText size={14} /><span>{entry.title}</span>
            </button>
          </li>
        ))}
        <li><button onClick={() => { setError(""); setFormat("markdown"); setMode("new"); }}><Plus size={14} /> New</button></li>
      </ul>
      {loadError && <p role="alert">{loadError}</p>}
      {mode && (
        <Dialog wide={mode !== "new"} className="space-dialog" title={mode === "new" ? "New file" : doc?.title ?? "Project file"} onClose={() => {
          if (!saving) { setMode(undefined); setActive(undefined); setLoaded(undefined); }
        }}>
          {mode === "new" || mode === "edit" ? (
            <form className="space-form" onSubmit={save} key={mode}>
              {mode === "new" && <>
                <div className="space-choice" aria-label="File type">
                  <button type="button" aria-pressed={format === "markdown"} onClick={() => setFormat("markdown")}>Create .md</button>
                  <button type="button" aria-pressed={format === "file"} onClick={() => setFormat("file")}>Import file</button>
                </div>
                <label>Title<input name="title" required maxLength={150} placeholder={format === "markdown" ? "notes.md" : "File title"} /></label>
              </>}
              {mode === "new" && format === "file"
                ? <label>File<input type="file" name="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif" required /><small>PDF, DOCX, TXT or image · up to 4 MB</small></label>
                : <label>Markdown<textarea name="body" rows={12} defaultValue={mode === "edit" ? doc?.body : ""} maxLength={60_000} /></label>}
              <footer><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save file"}</button></footer>
            </form>
          ) : doc ? (
            <div className="space-document">
              <div className="space-document-actions">
                {!doc.mimeType && <button onClick={() => { setError(""); setMode("edit"); }}>Edit</button>}
                <a href={projectFileUrl(project.id, doc.id, "download")} download={doc.title}><Download size={14} /> Download</a>
              </div>
              {doc.mimeType === "application/pdf" ? (
                <iframe title={doc.title} src={projectFileUrl(project.id, doc.id, "preview")} />
              ) : doc.mimeType?.startsWith("image/") ? (
                /* eslint-disable-next-line @next/next/no-img-element -- Authenticated file URL */
                <img src={projectFileUrl(project.id, doc.id, "preview")} alt={doc.title} />
              ) : doc.mimeType ? <pre>{doc.body || "No text available."}</pre>
                : <article><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml
                  components={{ img: () => null }}>{doc.body || "*No content yet.*"}</ReactMarkdown></article>}
              {!!doc.history.length && <details className="space-history"><summary>History</summary>
                <ol>{doc.history.map((revision, index) => <li key={index}>{revision.authorName} · {new Date(revision.at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}</li>)}</ol>
              </details>}
            </div>
          ) : !error && <p className="space-document" role="status">Loading…</p>}
          {error && <p className="space-error" role="alert">{error}</p>}
        </Dialog>
      )}
    </section>
  );
}

const statusLabels = { planned: "Planned", doing: "In progress", done: "Done" };
export function ProjectTimeline({ project, deadlineId }: { project: Project; deadlineId?: string }) {
  const { data, command } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(deadlineId ?? null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const entries = [...(project.deadlines ?? [])].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const selected = entries.find(entry => entry.id === editing);
  const members = data.members.filter(member => member.id === project.ownerId || project.memberIds.includes(member.id));
  function open(id: string) { setError(""); setRemoving(false); setEditing(id); }
  async function persist(action: string, values: Record<string, unknown>) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await command(action, { ...values, projectId: project.id, id: selected?.id });
      setEditing(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); }
    finally { setSaving(false); }
  }
  const today = dateKey(data.now);
  const next = entries.find(entry => entry.dueOn >= today && entry.status !== "done");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void persist("project.deadline", Object.fromEntries(form));
  }
  function timeline(entry: ProjectDeadline) {
    const overdue = entry.dueOn < today && entry.status !== "done";
    return (
      <li key={entry.id} className="pipeline-milestone">
        <button onClick={() => open(entry.id)} data-status={entry.status} data-next={entry.id === next?.id}>
          <span className="pipeline-date">
            <time dateTime={entry.dueOn}>{shortDate(entry.dueOn)}</time>
            {entry.status === "done" ? <Check size={13} aria-label="Done" />
              : overdue ? <span>Overdue</span>
              : entry.id === next?.id ? <span>Next</span> : null}
          </span>
          <span className="pipeline-point" />
          <strong>{entry.title}</strong>
        </button>
      </li>
    );
  }
  return <section className="space-pipeline" aria-label="Timeline">
    <header><h2>Timeline</h2><button onClick={() => open("new")}><Plus size={14} /> Deliverable</button></header>
    {entries.length ? <div className="pipeline-scroll"><ol className="pipeline-track">
      {entries.filter(entry => entry.dueOn < today).map(timeline)}
      <li className="pipeline-today">
        <strong>Today</strong><span className="pipeline-point" /><time dateTime={today}>{shortDate(today)}</time>
      </li>
      {entries.filter(entry => entry.dueOn >= today).map(timeline)}
    </ol></div> : <p>No deliverables yet.</p>}
    {editing !== null && <Dialog className="space-dialog" title={selected ? "Deliverable" : "New deliverable"} onClose={() => { if (!saving) setEditing(null); }}>
      <form className="space-form" onSubmit={save}>
        <label>Title<input name="title" defaultValue={selected?.title} required maxLength={150} /></label>
        <label>Deadline<input type="date" name="dueOn" defaultValue={selected?.dueOn} required /></label>
        <label>Owner<select name="ownerId" defaultValue={selected?.ownerId ?? project.ownerId} required>
          {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select></label>
        <label>Status<select name="status" defaultValue={selected?.status ?? "planned"}>
          {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        {error && <p role="alert">{error}</p>}
        <footer>
          {selected && <button type="button" disabled={saving} onClick={() => {
            if (removing) void persist("project.deadline.delete", {});
            else setRemoving(true);
          }}>{removing ? "Confirm removal" : "Remove"}</button>}
          <button disabled={saving}>{saving ? "Saving…" : "Save deliverable"}</button>
        </footer>
      </form>
    </Dialog>}
  </section>;
}
