"use client";
import { useMemo, useState } from "react";
import { CalendarDays, GripVertical, MessageSquare, Paperclip, Plus, Search, Trash2, X, ListFilter, SlidersHorizontal } from "lucide-react";
import { taskStatuses, type Task, type TaskPriority, type TaskStatus } from "@/domain/model";
import { dateKey, relativeDate, shortDate } from "@/domain/time";
import { useWorkspace } from "./context";
import { ActivityFeed } from "./activity";
import { Popover } from "./popover";
import { PersonAvatar } from "./person-avatar";

const boardStatuses: TaskStatus[] = ["backlog", "todo", "doing", "review", "done"];
const boardLabels = taskStatuses;
const priorities: Record<TaskPriority, string> = { none: "None", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const boardStatus = (status: TaskStatus): TaskStatus => status === "blocked" ? "backlog" : status;

export function TaskLine({ task }: { task: Task }) {
  const { data, edit } = useWorkspace();
  const project = data.projects.find((item) => item.id === task.projectId);
  const owner = data.members.find((item) => item.id === task.ownerId);
  const comments = data.taskComments.filter((item) => item.taskId === task.id).length;
  const files = data.taskAttachments.filter((item) => item.taskId === task.id).length;
  return <button className="task-line" onClick={() => edit({ type: "task", id: task.id })}>
    <span className={`task-state task-state-${task.status}`} aria-label={taskStatuses[task.status]} />
    <span className="task-line-title">{task.title}</span>
    {project && <span className="task-line-context">{project.name}</span>}
    {task.priority && task.priority !== "none" && <span className="task-line-priority">{priorities[task.priority]}</span>}
    {comments > 0 && <span className="task-line-count"><MessageSquare size={12}/>{comments}</span>}
    {files > 0 && <span className="task-line-count"><Paperclip size={12}/>{files}</span>}
    <span className="task-line-owner"><PersonAvatar member={owner}/></span>
    <span className={`task-line-date ${task.dueOn && task.dueOn < dateKey(data.now) && task.status !== "done" ? "is-overdue" : ""}`}>{relativeDate(task.dueOn, dateKey(data.now))}</span>
  </button>;
}

export function TaskSurface({ projectId, mode, onModeChange }: { projectId?: string; mode?: "list"|"board"; onModeChange?: (mode:"list"|"board")=>void }) {
  const { data, command, edit, notify } = useWorkspace();
  const [localView, setLocalView] = useState<"list" | "board">("board");
  const view = mode ?? localView;
  const setView = onModeChange ?? setLocalView;
  const [group, setGroup] = useState<"status" | "project" | "owner" | "due">("status");
  const [sort, setSort] = useState<"date" | "priority" | "status">("date");
  const [filter, setFilter] = useState<"open" | "mine" | "all">("open");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [pending, setPending] = useState<Record<string, TaskStatus>>({});
  const tasks = useMemo(() => data.tasks
    .filter((task) => (!projectId || task.projectId === projectId) &&
      (filter !== "mine" || task.ownerId === data.me.id) &&
      (filter !== "open" || task.status !== "done") &&
      (!statusFilter || task.status === statusFilter) && (!ownerFilter || task.ownerId === ownerFilter) &&
      task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .map((task) => pending[task.id] ? { ...task, status: pending[task.id] } : task)
    .sort((a, b) => sort === "priority" ? priorityRank[a.priority ?? "none"] - priorityRank[b.priority ?? "none"] :
      sort === "status" ? boardStatuses.indexOf(boardStatus(a.status)) - boardStatuses.indexOf(boardStatus(b.status)) :
      (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999")),
  [data, projectId, filter, query, pending, sort, statusFilter, ownerFilter]);
  const labelFor = (task: Task) => group === "project" ? data.projects.find((item) => item.id === task.projectId)?.name ?? "No project" :
    group === "owner" ? data.members.find((item) => item.id === task.ownerId)?.name ?? "Unassigned" :
    group === "due" ? !task.dueOn ? "No deadline" : task.dueOn < dateKey(data.now) ? "Overdue" : task.dueOn === dateKey(data.now) ? "Today" : "Later" :
    boardLabels[boardStatus(task.status)];
  const groups = Array.from(new Set(tasks.map(labelFor)));
  async function move(taskId: string, status: TaskStatus) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    setPending((old) => ({ ...old, [taskId]: status }));
    try { await command("task.status", { id: task.id, version: task.version, status }); }
    catch (error) { notify(error instanceof Error ? error.message : "Não foi possível mover a tarefa."); }
    finally { setPending((old) => { const next = { ...old }; delete next[taskId]; return next; }); }
  }
  return <div className="task-surface">
    <div className="task-toolbar">
      <div className="task-quick-filters"><button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Open</button><button className={filter === "mine" ? "active" : ""} onClick={() => setFilter("mine")}>My tasks</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button></div>
      <label className="task-search"><Search size={14}/><input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks"/></label>
      <Popover label="Filter tasks" icon={<ListFilter size={15}/>} active={!!statusFilter || !!ownerFilter}><h3>Filters</h3><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Any status</option>{Object.entries(taskStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Assignee<select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="">Anyone</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><button className="text-button" onClick={() => { setStatusFilter(""); setOwnerFilter(""); }}>Clear filters</button></Popover>
      <Popover label="Display options" icon={<SlidersHorizontal size={15}/>}><div className="task-view-toggle"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button><button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button></div>{view === "list" && <label>Grouping<select aria-label="Group by" value={group} onChange={(event) => setGroup(event.target.value as typeof group)}><option value="status">Status</option><option value="project">Project</option><option value="owner">Person</option><option value="due">Deadline</option></select></label>}<label>Ordering<select aria-label="Sort by" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date">Date</option><option value="priority">Priority</option><option value="status">Status</option></select></label></Popover>
      <button className="round-control" title="New task" aria-label="New task" onClick={() => edit({ type: "task", projectId })}><Plus size={16}/></button>
    </div>
    {view === "list" ? <div className="task-groups">{groups.length ? groups.map((label) => <section key={label} className="task-group"><header>{label}<span>{tasks.filter((task) => labelFor(task) === label).length}</span></header>{tasks.filter((task) => labelFor(task) === label).map((task) => <TaskLine key={task.id} task={task}/>)}</section>) : <p className="task-empty">No tasks in this view.</p>}</div> :
    <div className="task-board">{boardStatuses.map((status) => {
      const column = tasks.filter((task) => boardStatus(task.status) === status);
      return <section className="task-board-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void move(event.dataTransfer.getData("text/task-id"), status); }}>
        <header><span className={`task-state task-state-${status}`}/>{boardLabels[status]} <span>{column.length}</span></header>
        {column.map((task) => { const comments = data.taskComments.filter((item) => item.taskId === task.id).length; const files = data.taskAttachments.filter((item) => item.taskId === task.id).length; return <button key={task.id} className="task-board-card" draggable onDragStart={(event) => { event.dataTransfer.setData("text/task-id", task.id); event.dataTransfer.effectAllowed = "move"; }} onClick={() => edit({ type: "task", id: task.id })}>
          <span className="task-board-card-title"><GripVertical size={13}/>{task.title}</span>{task.pullRequestId && <small>{(() => { const pr = data.pullRequests.find((item) => item.id === task.pullRequestId); return pr ? `PR #${pr.number} · ${pr.state}` : ""; })()}</small>}
          <span className="task-board-card-meta"><span><PersonAvatar member={data.members.find((item) => item.id === task.ownerId)}/></span>{task.dueOn && <span><CalendarDays size={12}/>{shortDate(task.dueOn)}</span>}{task.priority && task.priority !== "none" && <span>{priorities[task.priority]}</span>}{comments > 0 && <span><MessageSquare size={12}/>{comments}</span>}{files > 0 && <span><Paperclip size={12}/>{files}</span>}</span>
        </button>; })}
        <button className="task-board-add" onClick={() => edit({ type: "task", projectId })}><Plus size={13}/> Add task</button>
      </section>;
    })}</div>}
  </div>;
}

export function TaskPanel({ id, projectId, onClose }: { id?: string; projectId?: string; onClose: () => void }) {
  const { data, command, notify, refresh, capture, confirm } = useWorkspace();
  const task = data.tasks.find((item) => item.id === id);
  const comments = data.taskComments.filter((item) => item.taskId === id);
  const files = data.taskAttachments.filter((item) => item.taskId === id);
  const firstStructured = data.activity.filter((event) => event.entityType === "task" && event.entityId === id).map((event) => event.timestamp).sort()[0];
  const activity = data.taskActivity.filter((item) => item.taskId === id && (!firstStructured || item.createdAt < firstStructured));
  const timeline = [...comments.map((item) => ({ id: item.id, at: item.createdAt, by: item.createdBy, body: item.body, type: "comment" })),
    ...activity.map((item) => ({ id: item.id, at: item.createdAt, by: item.createdBy, body: item.body, type: "activity" }))].sort((a, b) => a.at.localeCompare(b.at));
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");
  async function upload(file: File) {
    if (!task) return;
    setUploading(true); setError("");
    try { const form = new FormData(); form.set("taskId", task.id); form.set("file", file);
      const response = await fetch("/api/files", { method: "POST", body: form });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Upload falhou."); }
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload falhou."); }
    finally { setUploading(false); }
  }
  return <div className="side-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="side-panel" role="dialog" aria-modal="true" aria-label={task?.title ?? "New task"}>
    <header className="side-panel-header"><span>{task ? "Task" : "New task"}</span>{task && <button className="danger" aria-label="Delete task" onClick={async () => { if (!(await confirm(`Eliminar a tarefa “${task.title}”?`))) return; void command("task.delete", { id: task.id, version: task.version }).then(onClose).catch((reason) => notify(reason instanceof Error ? reason.message : "Não foi possível eliminar.")); }}><Trash2 size={15}/>Delete</button>}<button onClick={() => capture()}>Ask Agent</button><button aria-label="Close task" onClick={onClose}><X size={17}/></button></header>
    <div className="side-panel-scroll"><form key={task?.id ?? "new"} className="task-detail-form" onSubmit={async (event) => { event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget)); setError(""); try { await command("task.save", { ...fields, ...(task ? { id: task.id, version: task.version } : {}), organizationId: task?.organizationId ?? "" }); if (!task) onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível guardar."); } }}>
      <input className="task-detail-title" name="title" defaultValue={task?.title ?? ""} placeholder="Task title" required autoFocus={!task}/>
      <textarea name="body" defaultValue={task?.body ?? ""} placeholder="Add a description…" rows={4}/>
      <div className="task-detail-properties"><label>Status<select name="status" defaultValue={task?.status ?? "todo"}>{Object.entries(taskStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Assignee<select name="ownerId" defaultValue={task?.ownerId ?? data.me.id}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label>Project<select name="projectId" defaultValue={task?.projectId ?? projectId ?? ""}><option value="">No project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Deadline<input name="dueOn" type="date" defaultValue={task?.dueOn ?? ""}/></label>
        <label>Visibilidade<select name="visibility" defaultValue={task?.visibility ?? "team"}><option value="team">Equipa</option><option value="private">Privada · só eu</option></select></label>
        <label>Priority<select name="priority" defaultValue={task?.priority ?? "none"}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div><button className="task-detail-save">{task ? "Save changes" : "Create task"}</button>
    </form>
    {task && <><section className="task-detail-section"><h3>Pull request</h3><select aria-label="Linked pull request" value={task.pullRequestId ?? ""} onChange={(event) => void command("task.linkPR", {id:task.id,version:task.version,pullRequestId:event.target.value}).catch((error) => notify(error.message))}><option value="">No PR linked</option>{data.pullRequests.filter((pr) => pr.projectId === task.projectId).map((pr) => <option key={pr.id} value={pr.id}>#{pr.number} · {pr.title} · {pr.state}</option>)}</select>{data.pullRequests.filter((pr) => pr.id === task.pullRequestId).map((pr) => <a key={pr.id} href={pr.url} target="_blank" rel="noreferrer">PR #{pr.number} · {pr.state}</a>)}</section><section className="task-detail-section"><h3>Attachments <span>{files.length}</span></h3>{files.map((file) => <a className="task-file" key={file.id} href={`/api/files?id=${encodeURIComponent(file.id)}`}><Paperclip size={14}/>{file.name}<span>{Math.ceil(file.size / 1024)} KB</span></a>)}<label className="task-file-upload"><Plus size={14}/>{uploading ? "Uploading…" : "Attach file"}<input type="file" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }}/></label></section>
      <section className="task-detail-section"><h3>Activity</h3><ActivityFeed taskId={task.id}/><div className="task-timeline">{timeline.map((item) => <article key={item.id}><span>{data.members.find((member) => member.id === item.by)?.name ?? "Team"} · {new Date(item.at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</span><p>{item.body}</p></article>)}</div><form onSubmit={async (event) => { event.preventDefault(); if (!comment.trim()) return; try { await command("task.comment", { taskId: task.id, body: comment }); setComment(""); } catch (reason) { notify(reason instanceof Error ? reason.message : "Comentário falhou."); } }}><textarea aria-label="Add comment" placeholder="Write a comment…" value={comment} onChange={(event) => setComment(event.target.value)} rows={3}/><button className="task-detail-save" disabled={!comment.trim()}>Post comment</button></form></section></>}
    {error && <p className="form-error" role="alert">{error}</p>}</div>
  </aside></div>;
}
