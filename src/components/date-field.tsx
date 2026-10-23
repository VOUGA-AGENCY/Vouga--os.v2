"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { dateKey } from "@/domain/time";
import { announce, useFloating } from "./floating";

type Mode = "date" | "datetime" | "time";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const pad = (number: number) => String(number).padStart(2, "0");
const hours = Array.from({ length: 24 }, (_, index) => pad(index));
const minutes = Array.from({ length: 12 }, (_, index) => pad(index * 5));

/** Reads a typed time such as "9", "930", "09:30", "9h30" or "9.30" as HH:mm; null when it is not a valid time. */
export function parseTime(text: string): string | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?:\s*[:h.,]\s*(\d{0,2})|(\d{2}))?\s*h?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || match[3] || 0);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const utc = (day: string) => new Date(`${day}T12:00:00Z`);
const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(utc(day));

function split(mode: Mode, value: string): { day: string; time: string } {
  if (mode === "time") return { day: "", time: value };
  if (mode === "date") return { day: value, time: "" };
  const [day = "", time = ""] = value.split("T");
  return { day, time: time.slice(0, 5) };
}

function display(mode: Mode, value: string) {
  if (!value) return "";
  const { day, time } = split(mode, value);
  if (mode === "time") return time;
  const date = format(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return mode === "datetime" && time ? `${date} · ${time}` : date;
}

/** Month grid starting on Monday, always six weeks so the panel keeps its size. */
function monthDays(month: string) {
  const first = utc(`${month}-01`);
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function shiftMonth(month: string, by: number) {
  const day = utc(`${month}-01`);
  day.setUTCMonth(day.getUTCMonth() + by);
  return day.toISOString().slice(0, 7);
}

/**
 * The app's date, date-time and time picker. Like SelectBox it submits through a hidden input, so forms read it
 * with FormData exactly like the native input it replaces (YYYY-MM-DD, YYYY-MM-DDTHH:mm or HH:mm).
 */
export function DateField({
  name,
  mode = "date",
  value: controlled,
  defaultValue = "",
  onChange,
  label,
  ariaLabel,
  placeholder,
  required = false,
  clearable = !required,
  className = "",
}: {
  name?: string;
  mode?: Mode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  required?: boolean;
  clearable?: boolean;
  className?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const { day, time } = split(mode, value);
  const today = dateKey();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((day || today).slice(0, 7));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const timesRef = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  useFloating(open, setOpen, rootRef, panelRef, false);

  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    announce(hiddenRef.current);
  }, [value]);

  // Keep the chosen hour and minute (or 09:00) in the middle of their columns.
  useEffect(() => {
    if (!open) return;
    for (const list of timesRef.current?.querySelectorAll<HTMLElement>(".date-picker-column") ?? []) {
      const target = list.querySelector<HTMLElement>(".is-selected") ?? list.querySelector<HTMLElement>("[data-default]");
      if (target) list.scrollTop = target.offsetTop - list.clientHeight / 2 + target.offsetHeight / 2;
    }
    if (mode === "time") timesRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else panelRef.current?.querySelector<HTMLElement>(".date-picker-day.is-selected, .date-picker-day.is-today")?.focus({ preventScroll: true });
  }, [open, mode]);

  function commit(next: string, close: boolean) {
    if (close) {
      setOpen(false);
      rootRef.current?.querySelector<HTMLElement>(".task-select-trigger")?.focus();
    }
    if (next === value) return;
    picked.current = true;
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
  }

  function pickDay(next: string) {
    if (mode === "date") return commit(next, true);
    commit(`${next}T${time || "09:00"}`, Boolean(time));
  }

  function pickTime(next: string, close = true) {
    if (mode === "time") return commit(next, close);
    commit(`${day || today}T${next}`, close);
  }

  function typeTime(input: HTMLInputElement, close: boolean) {
    const next = parseTime(input.value);
    if (next) pickTime(next, close);
    else input.value = time;
  }

  function toggle() {
    if (!open) setMonth((day || today).slice(0, 7));
    setOpen(!open);
  }

  const shown = display(mode, value);
  const [hour, minute] = time ? time.split(":") : ["", ""];
  const minuteOptions = minute && !minutes.includes(minute) ? [...minutes, minute].sort() : minutes;
  const Icon = mode === "time" ? Clock : CalendarDays;

  return (
    <div className={`task-select-box date-field ${open ? "is-open" : ""} ${className}`} ref={rootRef}>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={value}/>}
      {required && (
        <input
          className="date-field-validator"
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => undefined}
          onFocus={() => setOpen(true)}
        />
      )}
      <button
        type="button"
        className="task-select-trigger"
        aria-label={ariaLabel ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {label && <span className="task-select-label">{label}</span>}
        <span className={`task-select-value ${shown ? "" : "is-empty"}`}>
          <Icon size={13} className="date-field-icon"/>
          <span>{shown || placeholder || (mode === "time" ? "Pick a time" : "Pick a date")}</span>
        </span>
        <ChevronDown size={12} className={`task-select-chevron ${open ? "open" : ""}`}/>
      </button>

      {open && (
        <div className={`date-picker date-picker-${mode}`} role="dialog" aria-label={ariaLabel ?? label ?? "Choose date"} ref={panelRef}>
          {mode !== "time" && (
            <div className="date-picker-calendar">
              <div className="date-picker-header">
                <strong>{format(`${month}-01`, { month: "long", year: "numeric" })}</strong>
                <span>
                  <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15}/></button>
                  <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={15}/></button>
                </span>
              </div>
              <div className="date-picker-grid" role="grid">
                {weekdays.map((weekday, index) => <span key={index} className="date-picker-weekday">{weekday}</span>)}
                {monthDays(month).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={[
                      "date-picker-day",
                      key.slice(0, 7) !== month && "is-outside",
                      key === today && "is-today",
                      key === day && "is-selected",
                    ].filter(Boolean).join(" ")}
                    aria-label={format(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    aria-pressed={key === day}
                    onClick={() => pickDay(key)}
                  >
                    {Number(key.slice(8))}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode !== "date" && (
            <div className="date-picker-times" ref={timesRef}>
              <input
                key={time}
                className="date-picker-time-input"
                aria-label="Type a time"
                placeholder="hh:mm"
                inputMode="numeric"
                maxLength={5}
                size={5}
                defaultValue={time}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  typeTime(event.currentTarget, true);
                }}
                onBlur={(event) => {
                  if (event.currentTarget.value !== time) typeTime(event.currentTarget, false);
                }}
              />
              <div className="date-picker-columns">
                <div className="date-picker-column" aria-label="Hour">
                  {hours.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-default={option === "09" || undefined}
                      className={option === hour ? "is-selected" : ""}
                      aria-pressed={option === hour}
                      onClick={() => pickTime(`${option}:${minute || "00"}`, false)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="date-picker-column" aria-label="Minute">
                  {minuteOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-default={option === "00" || undefined}
                      className={option === minute ? "is-selected" : ""}
                      aria-pressed={option === minute}
                      onClick={() => pickTime(`${hour || "09"}:${option}`, true)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="date-picker-footer">
            {mode !== "time" && <button type="button" onClick={() => { setMonth(today.slice(0, 7)); pickDay(today); }}>Today</button>}
            {clearable && value && <button type="button" onClick={() => commit("", true)}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}
