"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { salesPlaybook } from "@/content/sales-playbook";
import knowledge from "@/content/sales-knowledge.json";

type Area = "approach" | "academy" | "cases";
type Entry = {
  id: string;
  area: Area;
  title: string;
  code: string;
  content: string;
  kind?: string;
};
const areas: { id: Area; title: string; description: string }[] = [
  {
    id: "approach",
    title: "Approach",
    description: "Como abordar, conduzir e acompanhar a conversa.",
  },
  {
    id: "academy",
    title: "Knowledge Academy",
    description: "Compreender o negócio antes de propor tecnologia.",
  },
  {
    id: "cases",
    title: "Case Library",
    description: "Relacionar o conhecimento com situações concretas.",
  },
];
const entries: Entry[] = [
  ...salesPlaybook.map((entry, i) => ({
    ...entry,
    area: "approach" as const,
    code: String(i + 1).padStart(2, "0"),
  })),
  ...(knowledge as Entry[]),
];
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const anchorKey = (text: string) => normalize(text).replace(/[^a-z0-9]/g, "");

function ReadingContent({
  content,
  navigate,
}: {
  content: string;
  navigate: (entry: Entry) => void;
}) {
  const markdown = (text: string) => (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div
            className="playbook-table"
            role="region"
            aria-label="Tabela de referência"
            tabIndex={0}
          >
            <table>{children}</table>
          </div>
        ),
        a: ({ href, children }) => {
          const target = href?.startsWith("#")
            ? entries.find(
                (e) =>
                  anchorKey(e.id) ===
                  anchorKey(decodeURIComponent(href.slice(1))),
              )
            : undefined;
          if (target)
            return (
              <button
                className="playbook-text-link"
                onClick={() => navigate(target)}
              >
                {children}
              </button>
            );
          return (
            <a
              href={href}
              target={href?.startsWith("https://") ? "_blank" : undefined}
              rel="noreferrer"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </Markdown>
  );
  const answer = /\*\*Resolução orientadora[^\n]*\n/.exec(content);
  if (!answer) return markdown(content);
  const start = answer.index + answer[0].length;
  const end = content.indexOf("**Critério de conclusão:", start);
  return (
    <>
      {markdown(content.slice(0, answer.index))}
      <details className="playbook-answer">
        <summary>Consultar resolução orientadora</summary>
        {markdown(content.slice(start, end < 0 ? undefined : end))}
      </details>
      {end >= 0 && markdown(content.slice(end))}
    </>
  );
}

export function PlaybookReader({ onBack }: { onBack: () => void }) {
  const [area, setArea] = useState<Area>("approach");
  const [selected, setSelected] = useState(entries[0].id);
  const [query, setQuery] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  const current = entries.find((e) => e.id === selected)!;
  const group = entries.filter((e) => e.area === area);
  const filtered = group.filter((e) =>
    normalize(`${e.title} ${e.code} ${e.content}`).includes(
      normalize(query.trim()),
    ),
  );
  const index = group.findIndex((e) => e.id === selected);
  const currentArea = areas.find((a) => a.id === area)!;
  function navigate(entry: Entry) {
    setArea(entry.area);
    setSelected(entry.id);
    setQuery("");
  }
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  return (
    <div className="sales-playbook" lang="pt-PT">
      <header className="playbook-header">
        <button onClick={onBack}>
          <ArrowLeft size={15} />
          Prospect
        </button>
        <span>Sales Playbook</span>
        <small className="playbook-internal">Uso interno</small>
      </header>
      <nav className="playbook-areas" aria-label="Áreas do Sales Playbook">
        {areas.map((a) => (
          <button
            key={a.id}
            aria-current={area === a.id ? "page" : undefined}
            onClick={() => navigate(entries.find((e) => e.area === a.id)!)}
          >
            {a.title}
          </button>
        ))}
      </nav>
      <p className="playbook-area-description">{currentArea.description}</p>
      <div className="playbook-layout">
        <aside className="playbook-index playbook-library-index">
          <label className="playbook-search">
            <Search size={14} />
            <input
              aria-label={`Pesquisar em ${currentArea.title}`}
              placeholder="Pesquisar nesta área…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <nav aria-label={`Conteúdos de ${currentArea.title}`}>
            {filtered.map((entry) => (
              <button
                key={entry.id}
                onClick={() => navigate(entry)}
                aria-current={entry.id === selected ? "page" : undefined}
              >
                <span>{entry.code.replace("Módulo ", "")}</span>
                {entry.title}
              </button>
            ))}
            {!filtered.length && (
              <p className="playbook-no-results">
                Sem resultados para esta pesquisa.
              </p>
            )}
          </nav>
        </aside>
        <div className="playbook-reading">
          <div className="playbook-mobile-library">
            <label className="playbook-search">
              <Search size={14} />
              <input
                aria-label="Pesquisar conteúdos"
                placeholder="Pesquisar nesta área…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="playbook-mobile-index">
              Conteúdo
              <select
                value={filtered.some((e) => e.id === selected) ? selected : ""}
                onChange={(e) => {
                  const entry = entries.find(
                    (entry) => entry.id === e.target.value,
                  );
                  if (entry) navigate(entry);
                }}
              >
                <option value="" disabled>
                  {filtered.length ? "Escolher resultado" : "Sem resultados"}
                </option>
                {filtered.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.code} · {e.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <article className="playbook-article" key={current.id}>
            <header>
              <span className="playbook-chapter-number">{current.code}</span>
              {current.kind && (
                <span className="playbook-case-kind">{current.kind}</span>
              )}
              <h1 ref={title} tabIndex={-1}>
                {current.title}
              </h1>
            </header>
            <div className="playbook-prose">
              <ReadingContent content={current.content} navigate={navigate} />
            </div>
          </article>
          <footer className="playbook-pagination">
            <button
              disabled={index === 0}
              onClick={() => navigate(group[index - 1])}
            >
              <ArrowLeft size={16} />
              Anterior
            </button>
            {index < group.length - 1 && (
              <button onClick={() => navigate(group[index + 1])}>
                {group[index + 1].title}
                <ArrowRight size={16} />
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
