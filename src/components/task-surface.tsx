"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitPullRequest,
  GripVertical,
  ListFilter,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  taskSizes,
  taskSizeLabels,
  taskStatuses,
  type Task,
  type TaskPriority,
  type TaskSize,
  type TaskStatus,
} from "@/domain/model";
import { dateKey, relativeDate, shortDate } from "@/domain/time";
import { isBoardMember } from "@/domain/team";
import { formFields, SaveStatus, useAutosave } from "./autosave";
import { useWorkspace } from "./context";
import { ActivityFeed } from "./activity";
import { Popover } from "./popover";
import { PersonAvatar } from "./person-avatar";

const boardStatuses: TaskStatus[] = [
  "backlog",
  "todo",
  "doing",
  "review",
  "done",
];
const boardLabels = taskStatuses;
const priorities: Record<TaskPriority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const priorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};
const sizeRank: Record<string, number> = {
  xs: 0,
  s: 1,
  m: 2,
  l: 3,
  xl: 4,
  none: 5,
};
const boardStatus = (status: TaskStatus): TaskStatus =>
  status === "blocked" ? "backlog" : status;

export interface SelectOption {
  value: string;
  label: string;
  avatar?: { id: string; name: string };
  dotClass?: string;
  badge?: string;
  icon?: React.ReactNode;
}

export function SelectBox({
  name,
  value,
  onChange,
  options,
  label,
  ariaLabel,
}: {
  name: string;
  value: string;
  onChange?: (val: string) => void;
  options: SelectOption[];
  label?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((opt) => opt.value === value) ?? options[0];

  return (
    <div
      className={`task-select-box ${open ? "is-open" : ""}`}
      ref={containerRef}
    >
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="task-select-trigger"
        aria-label={ariaLabel ?? label}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label && <span className="task-select-label">{label}</span>}
        <span className="task-select-value">
          {selected?.avatar && <PersonAvatar member={selected.avatar} />}
          {selected?.dotClass && <span className={selected.dotClass} />}
          {selected?.icon}
          {selected?.badge ? (
            <span className={`task-size-badge task-size-${selected.value}`}>
              {selected.badge}
            </span>
          ) : (
            <span>{selected?.label ?? value}</span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`task-select-chevron ${open ? "open" : ""}`}
        />
      </button>

      {open && (
        <div className="task-select-dropdown" role="listbox">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`task-select-option ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
              >
                <div className="task-select-option-content">
                  {opt.avatar && <PersonAvatar member={opt.avatar} />}
                  {opt.dotClass && <span className={opt.dotClass} />}
                  {opt.icon}
                  {opt.badge ? (
                    <span className={`task-size-badge task-size-${opt.value}`}>
                      {opt.badge}
                    </span>
                  ) : (
                    <span>{opt.label}</span>
                  )}
                </div>
                {isSelected && (
                  <Check size={13} className="task-select-check" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AssigneeMultiSelect({
  value,
  onChange,
  members,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  members: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedMembers = members.filter((m) => value.includes(m.id));

  function toggle(id: string) {
    if (value.includes(id)) {
      if (value.length > 1) {
        onChange(value.filter((item) => item !== id));
      }
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div
      className={`task-select-box ${open ? "is-open" : ""}`}
      ref={containerRef}
    >
      {value.map((id) => (
        <input key={id} type="hidden" name="assigneeIds" value={id} />
      ))}
      <input type="hidden" name="ownerId" value={value[0] ?? ""} />

      <button
        type="button"
        className="task-select-trigger"
        aria-label="Assignees"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="task-select-label">Assignee</span>
        <span className="task-select-value">
          {selectedMembers.length === 0 ? (
            <span>Unassigned</span>
          ) : selectedMembers.length === 1 ? (
            <>
              <PersonAvatar member={selectedMembers[0]} />
              <span>{selectedMembers[0].name}</span>
            </>
          ) : (
            <>
              <div className="task-avatar-stack">
                {selectedMembers.map((m) => (
                  <PersonAvatar key={m.id} member={m} />
                ))}
              </div>
              <span>
                {selectedMembers.map((m) => m.name.split(" ")[0]).join(", ")}
              </span>
            </>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`task-select-chevron ${open ? "open" : ""}`}
        />
      </button>

      {open && (
        <div
          className="task-select-dropdown"
          role="listbox"
          aria-multiselectable="true"
        >
          <div className="task-select-dropdown-header">
            <span>Assign team members ({value.length})</span>
          </div>
          {members.map((member) => {
            const isSelected = value.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`task-select-option ${isSelected ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(member.id);
                }}
              >
                <div className="task-select-option-content">
                  <PersonAvatar member={member} />
                  <span>{member.name}</span>
                </div>
                <div
                  className={`task-checkbox-box ${isSelected ? "is-checked" : ""}`}
                >
                  {isSelected && (
                    <Check size={11} className="task-checkbox-check" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskLine({ task }: { task: Task }) {
  const { data, edit } = useWorkspace();
  const project = data.projects.find((item) => item.id === task.projectId);
  const assignees = (
    task.assigneeIds?.length ? task.assigneeIds : [task.ownerId]
  )
    .map((id) => data.members.find((item) => item.id === id))
    .filter(Boolean) as { id: string; name: string }[];
  const comments = data.taskComments.filter(
    (item) => item.taskId === task.id,
  ).length;
  const files = data.taskAttachments.filter(
    (item) => item.taskId === task.id,
  ).length;
  return (
    <button
      className="task-line"
      onClick={() => edit({ type: "task", id: task.id })}
    >
      <span
        className={`task-state task-state-${task.status}`}
        aria-label={taskStatuses[task.status]}
      />
      <span className="task-line-title">{task.title}</span>
      {project && <span className="task-line-context">{project.name}</span>}
      {task.priority && task.priority !== "none" && (
        <span className="task-line-priority">{priorities[task.priority]}</span>
      )}
      {task.size && (
        <span className={`task-size-badge task-size-${task.size}`}>
          {task.size.toUpperCase()}
        </span>
      )}
      {task.pullRequestId ? (
        <span className="task-line-pr">
          <GitPullRequest size={12} />
          PR
        </span>
      ) : task.issueNumber ? (
        <span className="task-line-issue">
          <CircleDot size={12} />#{task.issueNumber}
        </span>
      ) : null}
      {comments > 0 && (
        <span className="task-line-count">
          <MessageSquare size={12} />
          {comments}
        </span>
      )}
      {files > 0 && (
        <span className="task-line-count">
          <Paperclip size={12} />
          {files}
        </span>
      )}
      <span className="task-line-owner">
        {assignees.length <= 1 ? (
          <PersonAvatar member={assignees[0]} />
        ) : (
          <div className="task-avatar-stack">
            {assignees.map((m) => (
              <PersonAvatar key={m.id} member={m} />
            ))}
          </div>
        )}
      </span>
      <span
        className={`task-line-date ${
          task.dueOn && task.dueOn < dateKey(data.now) && task.status !== "done"
            ? "is-overdue"
            : ""
        }`}
      >
        {relativeDate(task.dueOn, dateKey(data.now))}
      </span>
    </button>
  );
}

export function TaskSurface({
  projectId,
  mode,
  onModeChange,
}: {
  projectId?: string;
  mode?: "list" | "board";
  onModeChange?: (mode: "list" | "board") => void;
}) {
  const { data, command, edit, notify } = useWorkspace();
  const [localView, setLocalView] = useState<"list" | "board">("board");
  const view = mode ?? localView;
  const setView = onModeChange ?? setLocalView;
  const [group, setGroup] = useState<
    "status" | "project" | "owner" | "due" | "size"
  >("status");
  const [sort, setSort] = useState<"date" | "priority" | "size" | "status">(
    "date",
  );
  const [filter, setFilter] = useState<"open" | "mine" | "all" | "board">(
    "open",
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [pending, setPending] = useState<Record<string, TaskStatus>>({});
  const tasks = useMemo(
    () =>
      data.tasks
        .filter(
          (task) =>
            (!projectId || task.projectId === projectId) &&
            (filter !== "mine" ||
              task.ownerId === data.me.id ||
              (task.assigneeIds?.includes(data.me.id) ?? false)) &&
            (filter !== "open" || task.status !== "done") &&
            (filter !== "board" || task.visibility === "board") &&
            (!statusFilter || task.status === statusFilter) &&
            (!ownerFilter ||
              task.ownerId === ownerFilter ||
              (task.assigneeIds?.includes(ownerFilter) ?? false)) &&
            (!sizeFilter || (task.size ?? "") === sizeFilter) &&
            task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .map((task) =>
          pending[task.id] ? { ...task, status: pending[task.id] } : task,
        )
        .sort((a, b) =>
          sort === "priority"
            ? priorityRank[a.priority ?? "none"] -
              priorityRank[b.priority ?? "none"]
            : sort === "size"
              ? sizeRank[a.size ?? "none"] - sizeRank[b.size ?? "none"]
              : sort === "status"
                ? boardStatuses.indexOf(boardStatus(a.status)) -
                  boardStatuses.indexOf(boardStatus(b.status))
                : (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"),
        ),
    [
      data,
      projectId,
      filter,
      query,
      pending,
      sort,
      statusFilter,
      ownerFilter,
      sizeFilter,
    ],
  );
  const labelFor = (task: Task) =>
    group === "project"
      ? (data.projects.find((item) => item.id === task.projectId)?.name ??
        "No project")
      : group === "owner"
        ? (task.assigneeIds?.length ? task.assigneeIds : [task.ownerId])
            .map((id) => data.members.find((item) => item.id === id)?.name)
            .filter(Boolean)
            .join(", ") || "Unassigned"
        : group === "due"
          ? !task.dueOn
            ? "No deadline"
            : task.dueOn < dateKey(data.now)
              ? "Overdue"
              : task.dueOn === dateKey(data.now)
                ? "Today"
                : "Later"
          : group === "size"
            ? task.size
              ? `Size: ${task.size.toUpperCase()}`
              : "No size"
            : boardLabels[boardStatus(task.status)];
  const groups = Array.from(new Set(tasks.map(labelFor)));
  async function move(taskId: string, status: TaskStatus) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    setPending((old) => ({ ...old, [taskId]: status }));
    try {
      await command("task.status", {
        id: task.id,
        version: task.version,
        status,
      });
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not move the task.",
      );
    } finally {
      setPending((old) => {
        const next = { ...old };
        delete next[taskId];
        return next;
      });
    }
  }
  return (
    <div className="task-surface">
      <div className="task-toolbar">
        <div className="task-quick-filters">
          <button
            className={filter === "open" ? "active" : ""}
            onClick={() => setFilter("open")}
          >
            Open
          </button>
          <button
            className={filter === "mine" ? "active" : ""}
            onClick={() => setFilter("mine")}
          >
            My tasks
          </button>
          {!projectId && isBoardMember(data.me) && (
            <button
              className={filter === "board" ? "active" : ""}
              onClick={() => setFilter("board")}
            >
              Board tasks
            </button>
          )}
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
        </div>
        <label className="task-search">
          <Search size={14} />
          <input
            aria-label="Search tasks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
          />
        </label>
        <Popover
          label="Filter tasks"
          icon={<ListFilter size={15} />}
          active={!!statusFilter || !!ownerFilter || !!sizeFilter}
        >
          <h3>Filters</h3>
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Any status</option>
              {Object.entries(taskStatuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select
              value={sizeFilter}
              onChange={(event) => setSizeFilter(event.target.value)}
            >
              <option value="">Any size</option>
              {Object.entries(taskSizes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
            >
              <option value="">Anyone</option>
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              setStatusFilter("");
              setOwnerFilter("");
              setSizeFilter("");
            }}
          >
            Clear filters
          </button>
        </Popover>
        <Popover label="Display options" icon={<SlidersHorizontal size={15} />}>
          <div className="task-view-toggle">
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
            <button
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              Board
            </button>
          </div>
          {view === "list" && (
            <label>
              Grouping
              <select
                aria-label="Group by"
                value={group}
                onChange={(event) =>
                  setGroup(event.target.value as typeof group)
                }
              >
                <option value="status">Status</option>
                <option value="size">Size</option>
                <option value="project">Project</option>
                <option value="owner">Person</option>
                <option value="due">Deadline</option>
              </select>
            </label>
          )}
          <label>
            Ordering
            <select
              aria-label="Sort by"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="date">Date</option>
              <option value="priority">Priority</option>
              <option value="size">Size</option>
              <option value="status">Status</option>
            </select>
          </label>
        </Popover>
        <button
          className="round-control"
          title="New task"
          aria-label="New task"
          onClick={() => edit({ type: "task", projectId })}
        >
          <Plus size={16} />
        </button>
      </div>
      {view === "list" ? (
        <div className="task-groups">
          {groups.length ? (
            groups.map((label) => (
              <section key={label} className="task-group">
                <header>
                  {label}
                  <span>
                    {tasks.filter((task) => labelFor(task) === label).length}
                  </span>
                </header>
                {tasks
                  .filter((task) => labelFor(task) === label)
                  .map((task) => (
                    <TaskLine key={task.id} task={task} />
                  ))}
              </section>
            ))
          ) : (
            <p className="task-empty">No tasks in this view.</p>
          )}
        </div>
      ) : (
        <div className="task-board">
          {boardStatuses.map((status) => {
            const column = tasks.filter(
              (task) => boardStatus(task.status) === status,
            );
            return (
              <section
                className="task-board-column"
                key={status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void move(event.dataTransfer.getData("text/task-id"), status);
                }}
              >
                <header>
                  <span className={`task-state task-state-${status}`} />
                  {boardLabels[status]} <span>{column.length}</span>
                </header>
                {column.map((task) => {
                  const comments = data.taskComments.filter(
                    (item) => item.taskId === task.id,
                  ).length;
                  const files = data.taskAttachments.filter(
                    (item) => item.taskId === task.id,
                  ).length;
                  const pr = task.pullRequestId
                    ? data.pullRequests.find(
                        (item) => item.id === task.pullRequestId,
                      )
                    : null;
                  return (
                    <button
                      key={task.id}
                      className="task-board-card"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/task-id", task.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => edit({ type: "task", id: task.id })}
                    >
                      <span className="task-board-card-title">
                        <GripVertical size={13} />
                        {task.title}
                      </span>
                      {pr ? (
                        <small className="task-card-pr">
                          <GitPullRequest size={11} />
                          {`PR #${pr.number} · ${pr.state}`}
                        </small>
                      ) : task.issueNumber ? (
                        <small className="task-card-issue">
                          <CircleDot size={11} />
                          {`Issue #${task.issueNumber}`}
                        </small>
                      ) : null}
                      <span className="task-board-card-meta">
                        <span className="task-card-assignees">
                          {(task.assigneeIds?.length
                            ? task.assigneeIds
                            : [task.ownerId]
                          )
                            .map((id) =>
                              data.members.find((item) => item.id === id),
                            )
                            .filter(Boolean)
                            .map((m) => (
                              <PersonAvatar key={m!.id} member={m!} />
                            ))}
                        </span>
                        {task.dueOn && (
                          <span>
                            <CalendarDays size={12} />
                            {shortDate(task.dueOn)}
                          </span>
                        )}
                        {task.priority && task.priority !== "none" && (
                          <span>{priorities[task.priority]}</span>
                        )}
                        {task.size && (
                          <span
                            className={`task-size-badge task-size-${task.size}`}
                          >
                            {task.size.toUpperCase()}
                          </span>
                        )}
                        {comments > 0 && (
                          <span>
                            <MessageSquare size={12} />
                            {comments}
                          </span>
                        )}
                        {files > 0 && (
                          <span>
                            <Paperclip size={12} />
                            {files}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                <button
                  className="task-board-add"
                  onClick={() => edit({ type: "task", projectId })}
                >
                  <Plus size={13} /> Add task
                </button>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskPanel({
  id,
  projectId,
  onClose,
}: {
  id?: string;
  projectId?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="side-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <TaskPanelContent
        key={id ?? "new"}
        id={id}
        projectId={projectId}
        onClose={onClose}
      />
    </div>
  );
}

function TaskPanelContent({
  id,
  projectId,
  onClose,
}: {
  id?: string;
  projectId?: string;
  onClose: () => void;
}) {
  const { data, command, notify, refresh, capture, confirm } = useWorkspace();
  const task = data.tasks.find((item) => item.id === id);
  const comments = data.taskComments.filter((item) => item.taskId === id);
  const files = data.taskAttachments.filter((item) => item.taskId === id);
  const firstStructured = data.activity
    .filter((event) => event.entityType === "task" && event.entityId === id)
    .map((event) => event.timestamp)
    .sort()[0];
  const activity = data.taskActivity.filter(
    (item) =>
      item.taskId === id &&
      (!firstStructured || item.createdAt < firstStructured),
  );
  const timeline = [
    ...comments.map((item) => ({
      id: item.id,
      at: item.createdAt,
      by: item.createdBy,
      body: item.body,
      type: "comment" as const,
    })),
    ...activity.map((item) => ({
      id: item.id,
      at: item.createdAt,
      by: item.createdBy,
      body: item.body,
      type: "activity" as const,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");

  // Controlled form property values (fresh per key)
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "none",
  );
  const [size, setSize] = useState<TaskSize | "">(task?.size ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task?.assigneeIds && task.assigneeIds.length > 0
      ? task.assigneeIds
      : task?.ownerId
        ? [task.ownerId]
        : [data.me.id],
  );
  const [selectedProjectId, setSelectedProjectId] = useState(
    task?.projectId ?? projectId ?? "",
  );
  const [visibility, setVisibility] = useState<"team" | "private" | "board">(
    task?.visibility ?? "team",
  );
  const autosave = useAutosave("task.save", task?.id, task?.version);
  const [prUrlInput, setPrUrlInput] = useState("");
  const [linkingPr, setLinkingPr] = useState(false);

  const isBacklogOrTodo = status === "backlog" || status === "todo";

  async function taskAction(action: string, fields: Record<string, unknown>) {
    await autosave.flush();
    const snapshot = await command(action, {
      ...fields,
      version: data.tasks.find((item) => item.id === task?.id)?.version,
    });
    const updated = snapshot.tasks.find((item) => item.id === task?.id);
    if (updated) autosave.saver.committed(updated.version);
  }
  async function upload(file: File) {
    if (!task) return;
    setUploading(true);
    setError("");
    try {
      await autosave.flush();
      const form = new FormData();
      form.set("taskId", task.id);
      form.set("file", file);
      const response = await fetch("/api/files", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Upload failed.");
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Option lists for SelectBoxes
  const statusOptions: SelectOption[] = Object.entries(taskStatuses).map(
    ([key, label]) => ({
      value: key,
      label,
      dotClass: `task-state task-state-${key}`,
    }),
  );

  const priorityOptions: SelectOption[] = Object.entries(priorities).map(
    ([key, label]) => ({
      value: key,
      label,
    }),
  );

  const projectOptions: SelectOption[] = [
    { value: "", label: "No project" },
    ...data.projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];

  const visibilityOptions: SelectOption[] = [
    { value: "team", label: "Team" },
    { value: "private", label: "Private · just me" },
    ...(isBoardMember(data.me)
      ? [{ value: "board", label: "Board · Miguel & Roque" }]
      : []),
  ];

  return (
    <aside
      className="side-panel"
      role="dialog"
      aria-modal="true"
      aria-label={task?.title ?? "New task"}
    >
      <header className="side-panel-header">
        <span>{task ? "Task" : "New task"}</span>
        <div className="side-panel-header-actions">
          <button type="button" onClick={() => capture()}>
            Ask Agent
          </button>
          <button type="button" aria-label="Close task" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="side-panel-scroll">
        <form
          key={task?.id ?? "new"}
          className="task-detail-form"
          onInput={(event) => {
            const target = event.target;
            if (
              (target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement) &&
              target.name &&
              target.type !== "hidden"
            )
              autosave.stage({ [target.name]: target.value });
          }}
          onBlur={(event) => {
            const target = event.target;
            if (
              target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement
            ) {
              if (target.name && target.type !== "hidden")
                autosave.patch({ [target.name]: target.value });
            }
          }}
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = formFields(event.currentTarget);
            setError("");
            try {
              if (task) {
                await autosave.flush();
                return;
              }
              await command("task.save", {
                ...fields,
                organizationId: "",
              });
              if (!task) onClose();
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : "Could not save.",
              );
            }
          }}
        >
          <input
            className="task-detail-title"
            name="title"
            defaultValue={task?.title ?? ""}
            placeholder="Task title"
            required
            autoFocus={!task}
          />

          <textarea
            name="body"
            defaultValue={task?.body ?? ""}
            placeholder="Add a description…"
            rows={4}
          />

          {/* Feature Size Quick Selector directly in task description area */}
          <div className="task-feature-size-bar">
            <input type="hidden" name="size" value={size} />
            <span className="task-feature-size-title">Feature Size</span>
            <div className="task-feature-size-pills">
              {(["xs", "s", "m", "l", "xl"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`task-size-pill ${size === s ? "is-selected" : ""}`}
                  onClick={() => {
                    const next = size === s ? "" : s;
                    setSize(next);
                    autosave.patch({ size: next });
                  }}
                  title={taskSizeLabels[s]}
                >
                  <span className="task-size-pill-tag">{s.toUpperCase()}</span>
                  <span className="task-size-pill-name">{taskSizes[s]}</span>
                </button>
              ))}
              {size && (
                <button
                  type="button"
                  className="task-size-clear-btn"
                  title="Clear size"
                  aria-label="Clear size"
                  onClick={() => {
                    setSize("");
                    autosave.patch({ size: "" });
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Property select boxes */}
          <div className="task-detail-properties">
            <SelectBox
              name="status"
              label="Status"
              value={status}
              onChange={(val) => {
                setStatus(val as TaskStatus);
                autosave.patch({ status: val });
              }}
              options={statusOptions}
            />
            <SelectBox
              name="priority"
              label="Priority"
              value={priority}
              onChange={(val) => {
                setPriority(val as TaskPriority);
                autosave.patch({ priority: val });
              }}
              options={priorityOptions}
            />
            <AssigneeMultiSelect
              value={assigneeIds}
              onChange={(ids) => {
                setAssigneeIds(ids);
                autosave.patch({ assigneeIds: ids });
              }}
              members={data.members.filter((member) =>
                visibility === "private"
                  ? member.id === data.me.id
                  : visibility !== "board" || isBoardMember(member),
              )}
            />
            <SelectBox
              name="projectId"
              label="Project"
              value={selectedProjectId}
              onChange={(id) => {
                setSelectedProjectId(id);
                autosave.patch({ projectId: id });
              }}
              options={
                visibility === "team" ? projectOptions : [projectOptions[0]]
              }
            />
            <label className="task-detail-date-pill">
              <span className="task-select-label">Deadline</span>
              <input
                name="dueOn"
                type="date"
                defaultValue={task?.dueOn ?? ""}
                className="task-date-input"
              />
            </label>
            <SelectBox
              name="visibility"
              label="Visibility"
              value={visibility}
              onChange={(val) => {
                const next = val as "team" | "private" | "board";
                const ids =
                  next === "private"
                    ? [data.me.id]
                    : next === "board"
                      ? assigneeIds.filter((id) =>
                          data.members.some(
                            (member) =>
                              member.id === id && isBoardMember(member),
                          ),
                        )
                      : assigneeIds;
                const assignees = ids.length ? ids : [data.me.id];
                setVisibility(next);
                setAssigneeIds(assignees);
                if (next !== "team") setSelectedProjectId("");
                autosave.patch({
                  visibility: next,
                  assigneeIds: assignees,
                  ...(next !== "team" ? { projectId: "" } : {}),
                });
              }}
              options={visibilityOptions}
            />
          </div>

          {/* Associated GitHub Issue - shown when task is in To Do or Backlog */}
          {isBacklogOrTodo ? (
            <section className="task-detail-sub-section">
              <div className="task-section-header">
                <CircleDot size={14} />
                <h3>Associated GitHub Issue</h3>
              </div>
              <div className="task-issue-container">
                <div className="task-issue-fields">
                  <label className="task-issue-field">
                    <span>Issue #</span>
                    <input
                      type="number"
                      name="issueNumber"
                      defaultValue={task?.issueNumber ?? ""}
                      placeholder="104"
                      min="1"
                    />
                  </label>
                  <label className="task-issue-field task-issue-field-url">
                    <span>URL</span>
                    <input
                      type="url"
                      name="issueUrl"
                      defaultValue={task?.issueUrl ?? ""}
                      placeholder="https://github.com/org/repo/issues/104"
                    />
                  </label>
                </div>
                {task?.issueUrl ? (
                  <a
                    href={task.issueUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="task-issue-linked-card"
                  >
                    <CircleDot size={13} />
                    <span>Issue #{task.issueNumber || "link"}</span>
                    <ExternalLink size={12} />
                  </a>
                ) : task?.issueNumber ? (
                  <span className="task-issue-linked-card">
                    <CircleDot size={13} />
                    <span>Issue #{task.issueNumber}</span>
                  </span>
                ) : null}
                <p className="task-section-hint">
                  Tasks in To Do or Backlog can link an issue. Pull requests can
                  only be linked once the task is in progress.
                </p>
              </div>
            </section>
          ) : task ? (
            <>
              {/* Preserve issue fields when saving while in progress */}
              <input
                type="hidden"
                name="issueNumber"
                value={task.issueNumber ?? ""}
              />
              <input
                type="hidden"
                name="issueUrl"
                value={task.issueUrl ?? ""}
              />
            </>
          ) : null}

          {/* Panel footer with Save button and relocated modern Delete button */}
          <div className="task-panel-footer">
            {task ? (
              <SaveStatus saver={autosave.saver} />
            ) : (
              <button type="submit" className="task-detail-save">
                Create task
              </button>
            )}
            {task && (
              <button
                type="button"
                className="task-delete-btn"
                aria-label="Delete task"
                onClick={async () => {
                  if (!(await confirm(`Delete the task “${task.title}”?`, "Delete")))
                    return;
                  void autosave
                    .flush()
                    .then(() =>
                      command("task.delete", {
                        id: task.id,
                        version: task.version,
                      }),
                    )
                    .then(onClose)
                    .catch((reason) =>
                      notify(
                        reason instanceof Error
                          ? reason.message
                          : "Could not delete.",
                      ),
                    );
                }}
              >
                <Trash2 size={13} />
                <span>Delete task</span>
              </button>
            )}
          </div>
        </form>

        {task && (
          <>
            {/* Pull request section - only available when task is in progress (doing / review / done) */}
            {!isBacklogOrTodo && (
              <section className="task-detail-section">
                <div className="task-section-header">
                  <GitPullRequest size={14} />
                  <h3>Pull request</h3>
                </div>
                <div className="task-pr-container">
                  {task.pullRequestId ? (
                    <div className="task-pr-connected-card">
                      <div className="task-pr-card-main">
                        <div className="task-pr-card-info">
                          <span
                            className={`task-pr-state-badge state-${
                              data.pullRequests.find(
                                (item) => item.id === task.pullRequestId,
                              )?.state ?? "open"
                            }`}
                          >
                            {data.pullRequests.find(
                              (item) => item.id === task.pullRequestId,
                            )?.state ?? "linked"}
                          </span>
                          {(() => {
                            const pr = data.pullRequests.find(
                              (item) => item.id === task.pullRequestId,
                            );
                            return pr ? (
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noreferrer"
                                className="task-pr-card-title"
                              >
                                #{pr.number} · {pr.title}
                                <ExternalLink size={12} />
                              </a>
                            ) : (
                              <span className="task-pr-card-title">
                                Pull request linked
                              </span>
                            );
                          })()}
                        </div>
                        <button
                          type="button"
                          className="task-pr-unlink-btn"
                          title="Unlink pull request"
                          onClick={() =>
                            void taskAction("task.linkPR", {
                              id: task.id,
                              version: task.version,
                              pullRequestId: "",
                            }).catch((error) =>
                              notify(
                                error instanceof Error
                                  ? error.message
                                  : "Could not unlink PR.",
                              ),
                            )
                          }
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="task-pr-connect-box">
                      {data.pullRequests.filter(
                        (pr) =>
                          !selectedProjectId ||
                          pr.projectId === selectedProjectId,
                      ).length > 0 && (
                        <div className="task-pr-picker-row">
                          <select
                            aria-label="Linked pull request"
                            className="task-select-input"
                            value=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              void taskAction("task.linkPR", {
                                id: task.id,
                                version: task.version,
                                pullRequestId: event.target.value,
                              }).catch((error) =>
                                notify(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not link PR.",
                                ),
                              );
                            }}
                          >
                            <option value="">
                              Select an existing pull request...
                            </option>
                            {data.pullRequests
                              .filter(
                                (pr) =>
                                  !selectedProjectId ||
                                  pr.projectId === selectedProjectId,
                              )
                              .map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  #{pr.number} · {pr.title} ({pr.state})
                                </option>
                              ))}
                          </select>
                          <span className="task-pr-divider">or paste URL</span>
                        </div>
                      )}
                      <div className="task-pr-url-row">
                        <input
                          type="url"
                          className="task-pr-url-input"
                          placeholder="https://github.com/org/repo/pull/123"
                          value={prUrlInput}
                          onChange={(e) => setPrUrlInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="button-secondary task-pr-connect-btn"
                          disabled={!prUrlInput.trim() || linkingPr}
                          onClick={async () => {
                            if (!prUrlInput.trim()) return;
                            setLinkingPr(true);
                            try {
                              await taskAction("task.linkPR", {
                                id: task.id,
                                version: task.version,
                                pullRequestUrl: prUrlInput.trim(),
                              });
                              setPrUrlInput("");
                            } catch (err) {
                              notify(
                                err instanceof Error
                                  ? err.message
                                  : "Could not connect PR.",
                              );
                            } finally {
                              setLinkingPr(false);
                            }
                          }}
                        >
                          {linkingPr ? "Connecting…" : "Connect PR"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {(task.issueNumber || task.issueUrl) && (
                  <div className="task-subtle-issue">
                    <CircleDot size={12} />
                    <span>Linked issue: </span>
                    {task.issueUrl ? (
                      <a href={task.issueUrl} target="_blank" rel="noreferrer">
                        #{task.issueNumber || "link"} <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span>#{task.issueNumber}</span>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Attachments */}
            <section className="task-detail-section">
              <h3>
                Attachments <span>{files.length}</span>
              </h3>
              {files.map((file) => (
                <a
                  className="task-file"
                  key={file.id}
                  href={`/api/files?id=${encodeURIComponent(file.id)}`}
                >
                  <Paperclip size={14} />
                  {file.name}
                  <span>{Math.ceil(file.size / 1024)} KB</span>
                </a>
              ))}
              <label className="task-file-upload">
                <Plus size={14} />
                {uploading ? "Uploading…" : "Attach file"}
                <input
                  type="file"
                  accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </section>

            {/* Activity & Comments */}
            <section className="task-detail-section">
              <h3>Activity</h3>
              <ActivityFeed taskId={task.id} />
              <div className="task-timeline">
                {timeline.map((item) => (
                  <article key={item.id}>
                    <span>
                      {data.members.find((member) => member.id === item.by)
                        ?.name ?? "Team"}{" "}
                      ·{" "}
                      {new Date(item.at).toLocaleString("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!comment.trim()) return;
                  try {
                    await command("task.comment", {
                      taskId: task.id,
                      body: comment,
                    });
                    setComment("");
                  } catch (reason) {
                    notify(
                      reason instanceof Error
                        ? reason.message
                        : "Comment failed.",
                    );
                  }
                }}
              >
                <textarea
                  aria-label="Add comment"
                  placeholder="Write a comment…"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                />
                <button className="task-detail-save" disabled={!comment.trim()}>
                  Post comment
                </button>
              </form>
            </section>
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
