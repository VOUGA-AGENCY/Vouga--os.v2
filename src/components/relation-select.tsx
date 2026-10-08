"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type Option = { id: string; name: string };
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt");

export function RelationSelect({
  name,
  label,
  emptyLabel,
  defaultValue = "",
  options,
}: {
  name: string;
  label: string;
  emptyLabel: string;
  defaultValue?: string;
  options: Option[];
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const previous = useRef(defaultValue);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      input.current?.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [value]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const choices = [{ id: "", name: emptyLabel }, ...options].filter((option) =>
    normalize(option.name).includes(normalize(query.trim())),
  );
  const selected =
    options.find((option) => option.id === value)?.name ?? emptyLabel;

  function close() {
    popup.current?.hidePopover();
    trigger.current?.focus();
  }
  function choose(option: Option) {
    setValue(option.id);
    close();
  }
  function show() {
    const button = trigger.current;
    const panel = popup.current;
    if (!button || !panel) return;
    if (panel.matches(":popover-open")) return close();
    setQuery("");
    setActive(0);
    panel.showPopover();
    const box = button.getBoundingClientRect();
    const gap = 8;
    const below = window.innerHeight - box.bottom - gap * 2;
    const above = box.top - gap * 2;
    const upwards = below < 240 && above > below;
    panel.style.left = `${Math.max(gap, Math.min(box.left, window.innerWidth - panel.offsetWidth - gap))}px`;
    panel.style.top = upwards ? "auto" : `${box.bottom + gap}px`;
    panel.style.bottom = upwards
      ? `${window.innerHeight - box.top + gap}px`
      : "auto";
    panel.style.maxHeight = `${Math.max(80, upwards ? above : below)}px`;
    search.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      popup.current?.hidePopover();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);
  useEffect(() => {
    popup.current
      ?.querySelector(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="relation-select">
      <input ref={input} type="hidden" name={name} value={value} />
      <button
        ref={trigger}
        type="button"
        className="relation-select-trigger"
        aria-label={`${label}: ${selected}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span className="relation-select-label">{label}</span>
        <span className="relation-select-value">{selected}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        ref={popup}
        popover="auto"
        className="relation-select-popup"
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) =>
              choices.length
                ? (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    choices.length) %
                  choices.length
                : 0,
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (choices[active]) choose(choices[active]);
          } else if (event.key === "Tab") {
            close();
          }
        }}
      >
        <div className="relation-select-search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={search}
            role="combobox"
            aria-label={`Search ${label.toLocaleLowerCase("en-GB")}`}
            aria-expanded={open}
            aria-controls={`${id}-options`}
            aria-autocomplete="list"
            aria-activedescendant={
              choices[active] ? `${id}-option-${active}` : undefined
            }
            placeholder="Search by name…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
        </div>
        <div
          className="relation-select-options"
          role="listbox"
          id={`${id}-options`}
          aria-label={label}
        >
          {choices.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              data-option-index={index}
              aria-selected={option.id === value}
              className={index === active ? "active" : ""}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span>{option.name}</span>
              {option.id === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
          {!choices.length && <p role="status">No results found.</p>}
        </div>
      </div>
    </div>
  );
}
