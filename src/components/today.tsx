"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronRight,
  GitPullRequest,
  Inbox,
  Play,
  Plus,
} from "lucide-react";
import { calendarLabel } from "@/domain/calendars";
import { homeFor } from "@/domain/home";
import { taskStatuses, type Task } from "@/domain/model";
import { dateKey, relativeDate, timeLabel } from "@/domain/time";
import { useWorkspace } from "./context";
import { flushEdits } from "./autosave";
import { DarkGradientBg } from "./ui/elegant-dark-pattern";

function HomeTask({
  task,
  actions = false,
  today,
}: {
  task: Task;
  actions?: boolean;
  today: string;
}) {
  const { data, edit, command, notify } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const project = data.projects.find((item) => item.id === task.projectId);
  const company = data.organizations.find(
    (item) => item.id === task.organizationId,
  );
  async function move(status: "doing" | "done") {
    setSaving(true);
    try {
      await flushEdits();
      await command("task.status", {
        id: task.id,
        version: task.version,
        status,
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update task.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="home-task-row">
      <button
        className="home-task-open"
        onClick={() => edit({ type: "task", id: task.id })}
      >
        <span
          className={`task-state task-state-${task.status}`}
          aria-label={taskStatuses[task.status]}
        />
        <span className="home-row-copy">
          <strong>{task.title}</strong>
          <small>
            {project?.name ??
              company?.name ??
              (task.visibility === "board"
                ? "Board"
                : task.visibility === "private"
                  ? "Private"
                  : "Task")}{" "}
            · {taskStatuses[task.status]}
          </small>
        </span>
        {task.dueOn && (
          <span
            className={`home-row-date ${task.dueOn < today ? "is-overdue" : ""}`}
          >
            {relativeDate(task.dueOn, today)}
          </span>
        )}
      </button>
      {actions && (
        <div className="home-task-actions">
          {task.status === "todo" && (
            <button
              disabled={saving}
              onClick={() => void move("doing")}
              aria-label={`Start ${task.title}`}
              title="Start"
            >
              <Play size={14} />
            </button>
          )}
          <button
            disabled={saving}
            onClick={() => void move("done")}
            aria-label={`Complete ${task.title}`}
            title="Complete"
          >
            <Check size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export function Today() {
  const { data, edit, capture, command, notify, openProject } =
    useWorkspace();
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [now, setNow] = useState(data.now);
  // ETag refreshes can keep the same snapshot; the next event must still advance.
  useEffect(() => {
    const update = () => setNow(new Date().toISOString());
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  const home = homeFor(data, now);
  const event = home.nextEvent;
  const company = data.organizations.find(
    (item) => item.id === event?.organizationId,
  );
  const project = data.projects.find((item) => item.id === event?.projectId);
  const latestNote =
    company &&
    data.interactions
      .filter(
        (item) =>
          item.organizationId === company.id && item.channel !== "meeting",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const attention = [
    ...home.pendingActions.map((item) => (
      <button
        className="focus-line"
        key={`agent:${item.id}`}
        onClick={() => capture()}
      >
        <Inbox size={14} />
        <span className="home-row-copy">
          <strong>{item.summary}</strong>
          <small>Confirm in Agent</small>
        </span>
        <ChevronRight size={13} />
      </button>
    )),
    ...home.reviewTasks.map((task) => (
      <HomeTask key={`task:${task.id}`} task={task} today={home.today} />
    )),
    ...home.reviewPRs.map((pr) => (
      <a
        className="focus-line"
        key={`pr:${pr.id}`}
        href={pr.url}
        target="_blank"
        rel="noreferrer"
      >
        <GitPullRequest size={14} />
        <span className="home-row-copy">
          <strong>
            #{pr.number} · {pr.title}
          </strong>
          <small>
            {data.projects.find((item) => item.id === pr.projectId)?.name} ·
            Review requested
          </small>
        </span>
        <ChevronRight size={13} />
      </a>
    )),
  ];
  const followUps = home.followUps.map((item) => (
    <button
      className="focus-line"
      key={item.id}
      onClick={() => edit({ type: "organization", id: item.id })}
    >
      <span className="home-row-copy">
        <strong>{item.name}</strong>
        <small>{item.nextStep || item.person || "Follow up"}</small>
      </span>
      <span className="home-row-date">
        {relativeDate(item.followUpOn, home.today)}
      </span>
    </button>
  ));
  async function getSummary() {
    setSummarizing(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: true }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not get the summary.");
      setSummary(result.text);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Summary unavailable.");
    } finally {
      setSummarizing(false);
    }
  }
  return (
    <DarkGradientBg>
      <div className="home-focus home-operational">
        <header className="focus-header">
          <div>
            <h1>Home</h1>
            <span>
              {new Intl.DateTimeFormat("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Europe/Lisbon",
              }).format(new Date(now))}
            </span>
          </div>
          <button onClick={() => capture()}>
            <Plus size={15} />
            Ask or capture <kbd>⌘ K</kbd>
          </button>
        </header>
        <div className="home-operational-grid">
          <div className="home-column">
            <section className="focus-section" aria-label="My tasks">
              <header>
                <span>My tasks</span>
                <strong>{home.activeTasks.length}</strong>
                <Link href="/tasks" prefetch={false}>
                  All tasks <ChevronRight size={12} />
                </Link>
              </header>
              <div className="focus-list">
                {home.tasks.map((task) => (
                  <HomeTask
                    key={task.id}
                    task={task}
                    actions
                    today={home.today}
                  />
                ))}
                {!home.tasks.length && (
                  <p className="focus-empty">No tasks in progress or to do.</p>
                )}
              </div>
            </section>
            <section
              className="focus-section"
              aria-label="Commercial follow-ups"
            >
              <header>
                <span>Follow-ups</span>
                <strong>{home.followUps.length}</strong>
              </header>
              <div className="focus-list">
                {followUps.slice(0, 3)}
                {followUps.length > 3 && (
                  <details className="home-more">
                    <summary>{followUps.length - 3} more follow-ups</summary>
                    {followUps.slice(3)}
                  </details>
                )}
                {!followUps.length && (
                  <p className="focus-empty">No follow-ups due.</p>
                )}
              </div>
            </section>
          </div>
          <div className="home-column">
            <section className="focus-section" aria-label="Next commitment">
              <header>
                <span>Next event</span>
                <strong>
                  {home.todayEvents.length
                    ? `${home.todayEvents.length} remaining today`
                    : ""}
                </strong>
                <Link href="/agenda" prefetch={false}>
                  Calendar <ChevronRight size={12} />
                </Link>
              </header>
              {event ? (
                <div className="home-next-event">
                  <button
                    className="focus-line"
                    onClick={() => edit({ type: "meeting", id: event.id })}
                  >
                    <CalendarDays size={16} />
                    <span className="home-row-copy">
                      <strong>{event.title}</strong>
                      <small>
                        {Date.parse(event.startsAt) <= Date.parse(now)
                          ? "Today"
                          : relativeDate(
                              dateKey(event.startsAt),
                              home.today,
                            )}{" "}
                        ·{" "}
                        {event.allDay
                          ? "All day"
                          : `${timeLabel(event.startsAt)}–${timeLabel(event.endsAt)}`}{" "}
                        · {calendarLabel(event, data.members)}
                        {Date.parse(event.startsAt) <= Date.parse(now)
                          ? " · Happening now"
                          : ""}
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  {(company || project) && (
                    <div className="home-event-context">
                      {company && (
                        <button
                          onClick={() =>
                            edit({ type: "organization", id: company.id })
                          }
                        >
                          {company.name}
                          <ChevronRight size={12} />
                        </button>
                      )}
                      {project && (
                        <button onClick={() => openProject(project.id)}>
                          {project.name}
                          <ChevronRight size={12} />
                        </button>
                      )}
                      {latestNote && <p>{latestNote.body}</p>}
                    </div>
                  )}
                </div>
              ) : (
                <p className="focus-empty">
                  No upcoming events assigned to you.
                </p>
              )}
            </section>
            <section className="focus-section" aria-label="Needs me">
              <header>
                <span>Needs me</span>
                <strong>{home.needsMeCount}</strong>
              </header>
              <div className="focus-list">
                {attention.slice(0, 4)}
                {attention.length > 4 && (
                  <details className="home-more">
                    <summary>{attention.length - 4} more to review</summary>
                    {attention.slice(4)}
                  </details>
                )}
                {!attention.length && (
                  <p className="focus-empty">
                    No reviews or confirmations pending.
                  </p>
                )}
                {!data.me.githubLogin && data.pullRequests.length > 0 && (
                  <Link
                    className="home-link-hint"
                    href="/settings"
                    prefetch={false}
                  >
                    Link your GitHub username to include requested PR reviews{" "}
                    <ChevronRight size={12} />
                  </Link>
                )}
              </div>
            </section>
            <details
              className="home-inbox"
              open={data.inbox.length > 0 ? true : undefined}
            >
              <summary>
                <Inbox size={14} />
                Inbox <span>{data.inbox.length}</span>
              </summary>
              {data.inbox.map((item) => (
                <div className="attention-line" key={item.id}>
                  <span className="home-row-copy">
                    <strong>{item.body}</strong>
                    <small>Needs organization</small>
                  </span>
                  <button
                    aria-label="Organize capture in Agent"
                    title="Organize in Agent"
                    onClick={() => capture()}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    aria-label="Resolve capture"
                    title="Resolve"
                    onClick={() =>
                      void command("inbox.resolve", { id: item.id }).catch(
                        (error) => notify(error.message),
                      )
                    }
                  >
                    <Check size={14} />
                  </button>
                </div>
              ))}
              {!data.inbox.length && (
                <p className="focus-empty">Nothing needs clarification.</p>
              )}
            </details>
          </div>
        </div>
        <div className="home-summary-action">
          <button disabled={summarizing} onClick={() => void getSummary()}>
            {summarizing ? "Preparing…" : "Get summary"}
            <ChevronRight size={13} />
          </button>
        </div>
        {summary && (
          <section
            className="home-summary"
            aria-label="Vouga Agent summary"
            role="status"
          >
            <header>Summary</header>
            <p>{summary}</p>
          </section>
        )}
      </div>
    </DarkGradientBg>
  );
}
