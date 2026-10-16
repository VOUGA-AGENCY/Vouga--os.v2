"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Circle,
  ListTodo,
  X,
} from "lucide-react";
import {
  homeAgenda,
  quickTaskDueOn,
  type QuickTaskTiming,
} from "@/domain/home";
import { taskStatuses, type Meeting, type Task } from "@/domain/model";
import { isBoardMember } from "@/domain/team";
import { dateKey, shortDate, timeLabel } from "@/domain/time";
import { useWorkspace } from "./context";
import { AssigneeMultiSelect, SelectBox } from "./task-surface";
import { PersonAvatar } from "./person-avatar";
import { flushEdits } from "./autosave";
import { DarkGradientBg } from "./ui/elegant-dark-pattern";

const timingLabels: Record<QuickTaskTiming, string> = {
  today: "Today",
  week: "This week",
  undated: "No date",
};
function QuickTask({ now }: { now: string }) {
  const { data, command, notify } = useWorkspace();
  const [timing, setTiming] = useState<QuickTaskTiming | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignees, setAssignees] = useState([data.me.id]);
  const [visibility, setVisibility] = useState<"private" | "team" | "board">(
    "private",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (timing) titleRef.current?.focus();
  }, [timing]);
  const dueOn = timing ? quickTaskDueOn(timing, now) : null;
  const people = data.members.filter((member) =>
    visibility === "private"
      ? member.id === data.me.id
      : visibility === "board"
        ? isBoardMember(member)
        : data.me.role === "admin" || member.id === data.me.id,
  );
  async function create() {
    if (!timing || saving || !title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await flushEdits();
      await command("task.save", {
        title: title.trim(),
        body: body.trim(),
        assigneeIds: assignees,
        visibility,
        dueOn: quickTaskDueOn(timing, now),
        status: "todo",
      });
      setTitle("");
      setBody("");
      setTiming(null);
      setAssignees([data.me.id]);
      setVisibility("private");
      if (!dueOn)
        notify("Task created without a deadline. Available in Tasks.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not create task. Your draft is still here.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="daybook-capture" aria-label="Quick task">
      <div className="daybook-capture-top">
        <span>New task</span>
        <div className="daybook-timing" role="group" aria-label="Task deadline">
          {(Object.keys(timingLabels) as QuickTaskTiming[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={timing === value}
              disabled={saving}
              onClick={() => setTiming(value)}
            >
              <span aria-hidden="true">+</span> {timingLabels[value]}
            </button>
          ))}
        </div>
      </div>
      {timing && (
        <form
          className="daybook-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="daybook-title-field">
            <input
              ref={titleRef}
              name="title"
              aria-label="Title"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={160}
              disabled={saving}
            />
            <button
              type="button"
              aria-label="Close task draft"
              disabled={saving}
              onClick={() => {
                setTiming(null);
                setError("");
              }}
            >
              <X size={15} />
            </button>
          </div>
          <textarea
            name="description"
            aria-label="Description"
            placeholder="Description, if needed…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={10000}
            rows={2}
            disabled={saving}
          />
          <div className="daybook-composer-bottom">
            <fieldset disabled={saving} className="daybook-properties">
              <AssigneeMultiSelect
                value={assignees}
                onChange={setAssignees}
                members={people}
              />
              <SelectBox
                name="visibility"
                value={visibility}
                label="Visibility"
                ariaLabel="Task visibility"
                options={[
                  { value: "private", label: "Private" },
                  { value: "team", label: "Team" },
                  ...(isBoardMember(data.me)
                    ? [{ value: "board", label: "Board" }]
                    : []),
                ]}
                onChange={(value) => {
                  const next = value as typeof visibility;
                  setVisibility(next);
                  setAssignees((ids) => {
                    if (next === "private") return [data.me.id];
                    if (next !== "board") return ids;
                    const eligible = ids.filter((id) =>
                      data.members.some(
                        (member) => member.id === id && isBoardMember(member),
                      ),
                    );
                    return eligible.length ? eligible : [data.me.id];
                  });
                }}
              />
            </fieldset>
            <span className="daybook-auto-date">
              {dueOn ? `Due ${shortDate(dueOn)}` : "Without deadline"}
            </span>
            <button
              className="daybook-create"
              disabled={saving || !title.trim()}
            >
              {saving ? "Creating…" : "Create task"}
              <ArrowRight size={14} />
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
function TaskRow({ task }: { task: Task }) {
  const { data, edit, command, notify } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const project = data.projects.find((p) => p.id === task.projectId);
  const people = data.members.filter((m) =>
    (task.assigneeIds?.length ? task.assigneeIds : [task.ownerId]).includes(
      m.id,
    ),
  );
  return (
    <div className="daybook-task">
      <button
        className="daybook-complete"
        aria-label={`Complete ${task.title}`}
        title="Complete task"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await flushEdits();
            await command("task.status", {
              id: task.id,
              version: task.version,
              status: "done",
            });
          } catch (e) {
            notify(e instanceof Error ? e.message : "Could not complete task.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <Circle size={16} className="daybook-check-circle" />
        <Check size={13} className="daybook-check-tick" />
      </button>
      <button
        className="daybook-task-title"
        onClick={() => edit({ type: "task", id: task.id })}
      >
        <span>{task.title}</span>
        {project && <small>{project.name}</small>}
      </button>
      <small className={`daybook-status daybook-status-${task.status}`}>
        {taskStatuses[task.status]}
      </small>
      <span className="daybook-assignees">
        {people.map((m) => (
          <PersonAvatar key={m.id} member={m} />
        ))}
      </span>
    </div>
  );
}
function MeetingRow({ meeting, now }: { meeting: Meeting; now: string }) {
  const { data, edit } = useWorkspace();
  const company = data.organizations.find(
    (c) => c.id === meeting.organizationId,
  );
  const participantIds = new Set([
    ...meeting.participantIds,
    ...(meeting.calendarKey === "personal" ? [meeting.calendarOwnerId] : []),
  ]);
  const participants = data.members.filter((member) =>
    participantIds.has(member.id),
  );
  return (
    <button
      className={`daybook-meeting ${Date.parse(meeting.endsAt) < Date.parse(now) ? "is-past" : ""}`}
      onClick={() => edit({ type: "meeting", id: meeting.id })}
    >
      <span className="daybook-event-time">
        {meeting.allDay ? "All day" : timeLabel(meeting.startsAt)}
      </span>
      <span className="daybook-meeting-copy">
        <strong>{meeting.title}</strong>
        <small>
          {[
            meeting.allDay
              ? ""
              : `${timeLabel(meeting.startsAt)}–${timeLabel(meeting.endsAt)}`,
            company?.name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
      <span className="daybook-assignees">
        {participants.map((member) => (
          <PersonAvatar key={member.id} member={member} />
        ))}
      </span>
      <ArrowRight size={13} />
    </button>
  );
}
const weekday = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(`${day}T12:00:00Z`));
export function Today() {
  const { data } = useWorkspace();
  const [now, setNow] = useState(data.now);
  useEffect(() => {
    const update = () => setNow(new Date().toISOString());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 60000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const agenda = homeAgenda(data, now);
  const upcoming = agenda.next.filter(
    (day) => day.tasks.length || day.meetings.length,
  );
  return (
    <DarkGradientBg className="daybook-pattern">
      <div className="daybook">
        <header className="daybook-header">
          <h1>Home</h1>
          <span>
            {new Intl.DateTimeFormat("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Europe/Lisbon",
            }).format(new Date(now))}
          </span>
        </header>
        <QuickTask now={now} />
        <div className="daybook-agenda">
          <section className="daybook-today" aria-labelledby="daybook-today">
            <header className="daybook-section-header">
              <h2 id="daybook-today">Today</h2>
              <span>{shortDate(dateKey(now))}</span>
            </header>
            <section className="daybook-list" aria-label="Today's tasks">
              <header className="daybook-list-heading">
                <ListTodo size={15} />
                <h3>Tasks</h3>
                {!!agenda.today.tasks.length && (
                  <span>{agenda.today.tasks.length}</span>
                )}
              </header>
              {agenda.today.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              {!agenda.today.tasks.length && (
                <p className="daybook-empty">No tasks due today.</p>
              )}
            </section>
            <section className="daybook-list" aria-label="Today's meetings">
              <header className="daybook-list-heading">
                <CalendarDays size={15} />
                <h3>Meetings</h3>
                {!!agenda.today.meetings.length && (
                  <span>{agenda.today.meetings.length}</span>
                )}
              </header>
              {agenda.today.meetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} now={now} />
              ))}
              {!agenda.today.meetings.length && (
                <p className="daybook-empty">No meetings today.</p>
              )}
            </section>
          </section>
          <section className="daybook-upcoming" aria-labelledby="daybook-next">
            <header className="daybook-section-header">
              <h2 id="daybook-next">Next 7 days</h2>
              <span>
                {shortDate(agenda.next[0].day)} –{" "}
                {shortDate(agenda.next[6].day)}
              </span>
            </header>
            {!upcoming.length && (
              <p className="daybook-empty">
                Nothing scheduled for the next 7 days.
              </p>
            )}
            {upcoming.map((day) => (
              <section
                className="daybook-date-group"
                key={day.day}
                aria-label={`${weekday(day.day)} ${shortDate(day.day)}`}
              >
                <h3 className="daybook-date-heading">
                  {weekday(day.day)}
                  <span>{shortDate(day.day)}</span>
                </h3>
                {!!day.tasks.length && (
                  <div className="daybook-upcoming-list">
                    <h4>
                      <ListTodo size={13} />
                      Tasks
                    </h4>
                    {day.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
                {!!day.meetings.length && (
                  <div className="daybook-upcoming-list">
                    <h4>
                      <CalendarDays size={13} />
                      Meetings
                    </h4>
                    {day.meetings.map((meeting) => (
                      <MeetingRow
                        key={meeting.id}
                        meeting={meeting}
                        now={now}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </section>
        </div>
      </div>
    </DarkGradientBg>
  );
}
