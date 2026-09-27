"use client";
import Link from "next/link";
import { ArrowUpRight, Maximize2, Plus, X } from "lucide-react";
import { dateKey, relativeDate, timeLabel } from "@/domain/time";
import { useWorkspace } from "./context";
import { TaskRow } from "./rows";
export function CompactPanel({
  standalone = false,
  onClose,
}: {
  standalone?: boolean;
  onClose?: () => void;
}) {
  const { data, capture, edit } = useWorkspace();
  const today = dateKey(data.now);
  const next = data.meetings
    .filter(
      (m) =>
        !m.cancelled &&
        m.endsAt >= data.now &&
        m.participantIds.includes(data.me.id),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const tasks = data.tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        (t.status === "blocked" || (t.dueOn && t.dueOn <= today)),
    )
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const contacts = data.organizations.filter(
    (o) =>
      !o.archived &&
      o.stage !== "dormant" &&
      o.followUpOn &&
      o.followUpOn <= today,
  );
  return (
    <aside
      className={`compact-panel ${standalone ? "compact-panel-standalone" : ""}`}
      aria-label="Painel rápido de Hoje"
    >
      <header className="compact-header">
        <span className="compact-brand">
          vouga<span>os</span>
        </span>
        <span className="row-meta">Hoje</span>
        <div className="inline-actions">
          {!standalone && (
            <button
              className="icon-button"
              aria-label="Abrir painel numa janela"
              onClick={() => {
                window.open(
                  "/painel",
                  "vouga-quick-panel",
                  "popup=yes,width=420,height=680",
                );
              }}
            >
              <Maximize2 size={14} />
            </button>
          )}
          {onClose && (
            <button
              className="icon-button"
              aria-label="Fechar painel rápido"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="compact-body">
        <div className="compact-greeting">
          <span className="eyebrow">À MÃO, {data.me.name.toUpperCase()}</span>
          <h2>O essencial, agora.</h2>
        </div>
        {next ? (
          <button
            className="compact-meeting"
            onClick={() => edit({ type: "meeting", id: next.id })}
          >
            <span className="eyebrow">
              {next.startsAt <= data.now ? "A DECORRER" : "PRÓXIMO COMPROMISSO"}
            </span>
            <strong>{next.title}</strong>
            <span>
              {dateKey(next.startsAt) === today
                ? "Hoje"
                : relativeDate(dateKey(next.startsAt), today)}{" "}
              · {timeLabel(next.startsAt)} — {timeLabel(next.endsAt)}
            </span>
            <ArrowUpRight size={16} />
          </button>
        ) : (
          <p className="quiet-empty">Sem compromissos a seguir.</p>
        )}
        <section className="compact-section">
          <div className="section-heading">
            <h3>Precisa de atenção</h3>
            <span className="section-count">{tasks.length}</span>
          </div>
          {tasks.length ? (
            tasks
              .slice(0, 4)
              .map((t) => <TaskRow key={t.id} task={t} compact />)
          ) : (
            <p className="quiet-empty">Tudo em dia.</p>
          )}
        </section>
        {contacts.length > 0 && (
          <section className="compact-section">
            <div className="section-heading">
              <h3>Retomar contacto</h3>
            </div>
            {contacts.slice(0, 2).map((o) => (
              <button
                className="compact-contact"
                key={o.id}
                onClick={() => edit({ type: "organization", id: o.id })}
              >
                <span>{o.name}</span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </section>
        )}
      </div>
      <footer className="compact-footer">
        <button className="button-primary" onClick={() => capture()}>
          <Plus size={16} />
          Registar algo
        </button>
        <Link
          className="text-button"
          href="/"
          target={standalone ? "_blank" : undefined}
          onClick={onClose}
        >
          Abrir OS
          <ArrowUpRight size={14} />
        </Link>
      </footer>
    </aside>
  );
}
