"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, ListFilter } from "lucide-react";
import {
  addDays,
  dateKey,
  localDateTime,
  shortDate,
  timeLabel,
  weekDays,
} from "@/domain/time";
import {
  calendarOptions,
  calendarTarget,
  calendarLabel,
  uniqueEvents,
} from "@/domain/calendars";
import type { Meeting } from "@/domain/model";
import { useWorkspace } from "./context";
import { Popover } from "./popover";

const firstHour = 7;
const lastHour = 21;
const slotCount = (lastHour - firstHour) * 2;
const slotTime = (index: number) =>
  `${String(firstHour + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`;

export function Agenda() {
  const { data, edit } = useWorkspace();
  const today = dateKey(data.now);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<"week" | "month">("month");
  const [inspectedDay, setInspectedDay] = useState<string | null>(null);
  useEffect(() => {
    if (!inspectedDay) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspectedDay(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [inspectedDay]);
  const options = calendarOptions(data.me, data.members);
  const [calendars, setCalendars] = useState<string[]>(() =>
    options.map((item) => item.id),
  );
  const selection = useRef<{ day: string; start: number; end: number } | null>(
    null,
  );
  const [dragSelection, setDragSelection] = useState<{
    day: string;
    start: number;
    end: number;
  } | null>(null);
  const visible = uniqueEvents(
    data.meetings.filter(
      (meeting) =>
        !meeting.cancelled && calendars.includes(calendarTarget(meeting)),
    ),
  );
  const days =
    view === "week"
      ? weekDays(selected)
      : (() => {
          const first = `${selected.slice(0, 7)}-01`;
          const start = weekDays(first)[0];
          const last = new Date(`${first}T12:00Z`);
          last.setUTCMonth(last.getUTCMonth() + 1);
          last.setUTCDate(0);
          const end = weekDays(last.toISOString().slice(0, 10))[6];
          const count =
            Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
          return Array.from({ length: count }, (_, index) =>
            addDays(start, index),
          );
        })();
  const meetingsOn = (day: string) =>
    visible.filter(
      (meeting) =>
        dateKey(meeting.startsAt) <= day &&
        dateKey(new Date(Date.parse(meeting.endsAt) - 1).toISOString()) >= day,
    );
  const dueOn = (day: string) =>
    data.tasks.filter(
      (task) =>
        task.dueOn === day &&
        task.status !== "done" &&
        task.ownerId === data.me.id,
    ).length;
  const shift = (direction: number) => {
    setInspectedDay(null);
    if (view === "week") setSelected(addDays(selected, direction * 7));
    else {
      const month = new Date(`${selected.slice(0, 7)}-01T12:00Z`);
      month.setUTCMonth(month.getUTCMonth() + direction);
      setSelected(month.toISOString().slice(0, 10));
    }
  };
  function slotUp(day: string, index: number) {
    const current = selection.current;
    if (!current || current.day !== day) return;
    const start = Math.min(current.start, index);
    const duration = Math.max(30, (Math.abs(current.start - index) + 1) * 30);
    selection.current = null;
    setDragSelection(null);
    edit({ type: "meeting", date: day, time: slotTime(start), duration });
  }
  function eventStyle(meeting: Meeting) {
    const start = localDateTime(meeting.startsAt);
    const end = localDateTime(meeting.endsAt);
    const startMinutes =
      Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16));
    const endMinutes =
      Number(end.slice(11, 13)) * 60 + Number(end.slice(14, 16));
    return {
      top: `${(Math.max(0, startMinutes - firstHour * 60) / 30) * 24}px`,
      height: `${Math.max(24, ((endMinutes - startMinutes) / 30) * 24)}px`,
    };
  }
  return (
    <div className="compact-page calendar-page">
      <header className="compact-heading">
        <div>
          <h1>Calendar</h1>
          <span>
            {new Intl.DateTimeFormat("pt-PT", {
              month: "long",
              year: "numeric",
              timeZone: "Europe/Lisbon",
            }).format(new Date(`${selected}T12:00Z`))}
          </span>
        </div>
        <button onClick={() => edit({ type: "meeting", date: selected })}>
          <Plus size={15} />
          Novo evento
        </button>
      </header>
      <div className="calendar-controls">
        <div className="calendar-range">
          <button onClick={() => setSelected(today)}>Today</button>
          <button aria-label="Previous period" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button aria-label="Next period" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </button>
          <strong>
            {view === "month"
              ? selected.slice(0, 7)
              : `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`}
          </strong>
        </div>
        <div className="calendar-view-switch">
          {(["week", "month"] as const).map((option) => (
            <button
              className={view === option ? "active" : ""}
              key={option}
              onClick={() => setView(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-filter-toolbar">
        <span>
          {calendars.length === options.length
            ? "Todos os calendários"
            : calendars.length > 3
              ? `${calendars.length} calendários`
              : options
                  .filter((option) => calendars.includes(option.id))
                  .map((option) => option.label)
                  .join(" · ") || "Nenhum calendário"}
        </span>
        <Popover
          label="Filtrar calendários"
          icon={<ListFilter size={15} />}
          active={calendars.length !== options.length}
        >
          <h3>Calendários</h3>
          <button
            onClick={() => setCalendars(options.map((option) => option.id))}
          >
            Todos
          </button>
          <div className="calendar-selection">
            {options.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={calendars.includes(option.id)}
                  onChange={() =>
                    setCalendars((old) =>
                      old.includes(option.id)
                        ? old.filter((id) => id !== option.id)
                        : [...old, option.id],
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </Popover>
      </div>
      {view === "month" ? (
        <div className="calendar-month-grid">
          <div className="calendar-month-weekdays">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          <div
            className="calendar-month-days"
            style={{ minHeight: `${(days.length / 7) * 5.25}rem` }}
          >
            {days.map((day) => (
              <button
                key={day}
                aria-label={`Open agenda ${day}`}
                className={`${day === inspectedDay ? "is-selected" : ""} ${day === today ? "is-today" : ""} ${day.slice(0, 7) !== selected.slice(0, 7) ? "outside" : ""}`}
                onClick={() => {
                  setInspectedDay(day);
                }}
              >
                <strong>{Number(day.slice(-2))}</strong>
                {meetingsOn(day)
                  .slice(0, 1)
                  .map((meeting) => (
                    <span key={meeting.id}>
                      <i
                        className={`calendar-owner-dot calendar-owner-${meeting.calendarKey === "contacto" ? 1 : 0}`}
                      />
                      {timeLabel(meeting.startsAt)} {meeting.title}
                    </span>
                  ))}
                {(meetingsOn(day).length > 1 || dueOn(day) > 0) && (
                  <small>
                    {[
                      meetingsOn(day).length > 1
                        ? `+${meetingsOn(day).length - 1} events`
                        : "",
                      dueOn(day) > 0 ? `${dueOn(day)} due` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="calendar-time-scroll">
          <div className="calendar-time-head">
            <span />
            <div
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              }}
            >
              {days.map((day) => (
                <button
                  key={day}
                  className={day === today ? "is-today" : ""}
                  onClick={() => {
                    setInspectedDay(day);
                  }}
                >
                  {new Intl.DateTimeFormat("en", {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${day}T12:00Z`))}{" "}
                  <strong>{Number(day.slice(-2))}</strong>
                  {dueOn(day) > 0 && <small>{dueOn(day)} due</small>}
                </button>
              ))}
            </div>
          </div>
          <div className="calendar-all-day">
            <span>Todo o dia</span>
            {days.map((day) => (
              <div key={day}>
                {meetingsOn(day)
                  .filter((event) => event.allDay)
                  .map((event) => (
                    <button
                      key={event.id}
                      onClick={() => edit({ type: "meeting", id: event.id })}
                    >
                      {event.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div className="calendar-time-body">
            <div className="calendar-hour-axis">
              {Array.from({ length: lastHour - firstHour }, (_, index) => (
                <span key={index}>
                  {String(index + firstHour).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            <div
              className="calendar-day-columns"
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              }}
            >
              {days.map((day) => (
                <div className="calendar-time-column" key={day}>
                  {Array.from({ length: slotCount }, (_, index) => (
                    <button
                      key={index}
                      className={`calendar-time-slot ${dragSelection?.day === day && index >= Math.min(dragSelection.start, dragSelection.end) && index <= Math.max(dragSelection.start, dragSelection.end) ? "selected" : ""}`}
                      aria-label={`Create event ${day} ${slotTime(index)}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selection.current = { day, start: index, end: index };
                        setDragSelection({ ...selection.current });
                      }}
                      onMouseEnter={() => {
                        if (selection.current?.day === day) {
                          selection.current.end = index;
                          setDragSelection({ ...selection.current });
                        }
                      }}
                      onMouseUp={() => slotUp(day, index)}
                    />
                  ))}
                  {meetingsOn(day)
                    .filter((meeting) => !meeting.allDay)
                    .map((meeting) => (
                      <button
                        key={meeting.id}
                        className={`calendar-event calendar-owner-${meeting.calendarKey === "contacto" ? 1 : 0}`}
                        style={eventStyle(meeting)}
                        onClick={() =>
                          edit({ type: "meeting", id: meeting.id })
                        }
                      >
                        <strong>{meeting.title}</strong>
                        <span>
                          {timeLabel(meeting.startsAt)} ·{" "}
                          {calendarLabel(meeting, data.members)}
                        </span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {inspectedDay && (
        <div
          className="side-panel-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInspectedDay(null);
          }}
        >
          <aside
            className="side-panel day-agenda"
            role="dialog"
            aria-modal="true"
            aria-label="Day agenda"
          >
            <header className="side-panel-header">
              <span>
                {new Intl.DateTimeFormat("en", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${inspectedDay}T12:00Z`))}
              </span>
              <button
                aria-label="Close day agenda"
                onClick={() => setInspectedDay(null)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="side-panel-scroll">
              <div className="day-agenda-heading">
                <h2>Scheduled</h2>
                <button
                  className="round-control"
                  aria-label="Add event on selected day"
                  onClick={() => {
                    edit({ type: "meeting", date: inspectedDay });
                    setInspectedDay(null);
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
              {meetingsOn(inspectedDay)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                .map((meeting) => (
                  <button
                    key={meeting.id}
                    className="day-agenda-event"
                    onClick={() => {
                      edit({ type: "meeting", id: meeting.id });
                      setInspectedDay(null);
                    }}
                  >
                    <small>
                      {timeLabel(meeting.startsAt)}–{timeLabel(meeting.endsAt)}
                    </small>
                    <strong>{meeting.title}</strong>
                    <span>{calendarLabel(meeting, data.members)}</span>
                  </button>
                ))}
              {!meetingsOn(inspectedDay).length && (
                <p className="focus-empty">No events scheduled.</p>
              )}
              {dueOn(inspectedDay) > 0 && (
                <section className="day-deadlines">
                  <h3>Task deadlines</h3>
                  {data.tasks
                    .filter(
                      (task) =>
                        task.dueOn === inspectedDay &&
                        task.status !== "done" &&
                        task.ownerId === data.me.id,
                    )
                    .map((task) => (
                      <button
                        key={task.id}
                        onClick={() => {
                          edit({ type: "task", id: task.id });
                          setInspectedDay(null);
                        }}
                      >
                        {task.title}
                      </button>
                    ))}
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
