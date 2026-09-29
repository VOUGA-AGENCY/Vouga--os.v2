"use client";
import { useState } from "react";
import { calendarLabel, uniqueEvents } from "@/domain/calendars";
import { CalendarDays, Check, Inbox, Plus } from "lucide-react";
import { dateKey, timeLabel } from "@/domain/time";
import { useWorkspace } from "./context";
import { TaskLine } from "./task-surface";
import { DarkGradientBg } from "./ui/elegant-dark-pattern";
export function Today() {
  const { data, edit, capture, command, notify } = useWorkspace();
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const today = dateKey(data.now);
  const tasks = data.tasks
    .filter(
      (task) =>
        (task.ownerId === data.me.id || (task.assigneeIds?.includes(data.me.id) ?? false)) &&
        task.status !== "done" &&
        task.dueOn &&
        task.dueOn <= today,
    )
    .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const events = uniqueEvents(data.meetings)
    .filter(
      (event) =>
        !event.cancelled &&
        dateKey(event.startsAt) === today &&
        event.participantIds.includes(data.me.id),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <DarkGradientBg>
      <div className="home-focus">
      <header className="focus-header">
        <div>
          <h1>Home</h1>
          <span>
            {new Intl.DateTimeFormat("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Europe/Lisbon",
            }).format(new Date(data.now))}
          </span>
        </div>
        <button
          disabled={summarizing}
          onClick={async () => {
            setSummarizing(true);
            try {
              const response = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary: true }),
              });
              const result = await response.json();
              if (!response.ok)
                throw new Error(
                  result.error || "Could not get the summary.",
                );
              setSummary(result.text);
            } catch (error) {
              notify(
                error instanceof Error ? error.message : "Summary unavailable.",
              );
            } finally {
              setSummarizing(false);
            }
          }}
        >
          {summarizing ? "Preparing…" : "Get summary"}
        </button>
        <button onClick={() => capture()}>
          <Plus size={15} />
          Ask or capture <kbd>⌘ K</kbd>
        </button>
      </header>
      <div className="home-focus-grid">
        <section className="focus-section">
          <header>
            <span>My Day</span>
            <strong>{tasks.length + events.length}</strong>
          </header>
          <div className="focus-list">
            {tasks.map((task) => (
              <TaskLine key={task.id} task={task} />
            ))}
            {events.map((event) => (
              <button
                className="focus-line"
                key={event.id}
                onClick={() => edit({ type: "meeting", id: event.id })}
              >
                <CalendarDays size={15} />
                <span className="focus-line-title">{event.title}</span>
                <span className="focus-line-context">
                  {calendarLabel(event, data.members)}
                </span>
                <span className="focus-line-time">
                  {event.allDay ? "All day" : timeLabel(event.startsAt)}
                </span>
              </button>
            ))}
            {!tasks.length && !events.length && (
              <p className="focus-empty">Nothing scheduled for today.</p>
            )}
          </div>
        </section>
        <section className="focus-section">
          <header>
            <span>Inbox</span>
            <strong>{data.inbox.length + data.pendingActions.length}</strong>
          </header>
          <div className="focus-list">
            {data.inbox.map((item) => (
              <div className="attention-line" key={item.id}>
                <Inbox size={14} />
                <span className="attention-main">
                  <strong>{item.body}</strong>
                  <small>Needs organization</small>
                </span>
                <button
                  aria-label="Resolve capture"
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
            {data.pendingActions.map((item) => (
              <button
                className="focus-line"
                key={item.id}
                onClick={() => capture()}
              >
                <Inbox size={14} />
                <span className="focus-line-title">{item.summary}</span>
                <small>Confirm in Agent</small>
              </button>
            ))}
            {!data.inbox.length && !data.pendingActions.length && (
              <p className="focus-empty">Nothing needs clarification.</p>
            )}
          </div>
        </section>
      </div>
      {summary && (
        <section
          className="home-summary"
          aria-label="Resumo do Vouga Agent"
          role="status"
        >
          <header>Resumo</header>
          <p>{summary}</p>
        </section>
      )}
      </div>
    </DarkGradientBg>
  );
}
