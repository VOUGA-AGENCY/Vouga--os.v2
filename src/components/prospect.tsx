"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Presentation } from "lucide-react";
import { BeamsBackground } from "./ui/beams-background";
import { salesPlaybook } from "@/content/sales-playbook";

function inline(text: string) {
  return text
    .split(/(\*\*.*?\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
// Small, explicit renderer for the bundled editorial content. No HTML execution.
function PlaybookContent({ content }: { content: string }) {
  return content.split(/\n\n/).map((block, i) => {
    if (block.startsWith("### ")) return <h3 key={i}>{block.slice(4)}</h3>;
    if (block.startsWith(">"))
      return (
        <blockquote key={i}>
          {block.split(/\n>\s*\n/).map((paragraph, j) => (
            <p key={j}>{inline(paragraph.replace(/^> ?/gm, ""))}</p>
          ))}
        </blockquote>
      );
    if (block.startsWith("- "))
      return (
        <ul key={i}>
          {block.split("\n").map((item, j) => (
            <li key={j}>{inline(item.slice(2))}</li>
          ))}
        </ul>
      );
    if (/^\d+\. /.test(block))
      return (
        <ol key={i}>
          {block.split("\n").map((item, j) => (
            <li key={j}>{inline(item.replace(/^\d+\. /, ""))}</li>
          ))}
        </ol>
      );
    return (
      <p
        key={i}
        className={block.startsWith("**Regra:") ? "playbook-rule" : undefined}
      >
        {inline(block)}
      </p>
    );
  });
}

export function Prospect() {
  const [chapter, setChapter] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const landingRef = useRef<HTMLButtonElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (chapter !== null) {
      titleRef.current?.focus({ preventScroll: true });
      titleRef.current?.scrollIntoView({ block: "start" });
    } else landingRef.current?.focus();
  }, [chapter]);

  if (chapter === null)
    return (
      <BeamsBackground className="prospect-entry" intensity="medium">
        <div className="prospect-entry-inner">
          <div className="prospect-entry-heading">
            <span className="prospect-eyebrow">VOUGA / SALES</span>
            <h1>Prospect</h1>
            <p>Prepara a abordagem. Conduz a conversa.</p>
          </div>
          <div className="prospect-entry-actions">
            <button
              ref={landingRef}
              className="prospect-entry-button"
              onClick={() => setChapter(0)}
            >
              <BookOpen size={20} strokeWidth={1.5} />
              <span>Sales Playbook</span>
              <ArrowRight size={18} strokeWidth={1.5} />
            </button>
            <button className="prospect-entry-button" disabled>
              <Presentation size={20} strokeWidth={1.5} />
              <span>Live Pitch</span>
              <small>Em breve</small>
            </button>
          </div>
        </div>
      </BeamsBackground>
    );
  const current = salesPlaybook[chapter];
  return (
    <div className="sales-playbook" lang="pt-PT">
      <header className="playbook-header">
        <button onClick={() => setChapter(null)}>
          <ArrowLeft size={15} />
          Prospect
        </button>
        <span>VOUGA / Sales Playbook</span>
      </header>
      <div className="playbook-layout">
        <aside className="playbook-index">
          <p>Manual comercial</p>
          <nav aria-label="Secções do Sales Playbook">
            {salesPlaybook.map((section, i) => (
              <button
                key={section.id}
                onClick={() => setChapter(i)}
                aria-current={chapter === i ? "page" : undefined}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {section.title}
              </button>
            ))}
          </nav>
        </aside>
        <div className="playbook-reading">
          <label className="playbook-mobile-index">
            Secção
            <select
              value={chapter}
              onChange={(e) => setChapter(Number(e.target.value))}
            >
              {salesPlaybook.map((section, i) => (
                <option value={i} key={section.id}>
                  {String(i + 1).padStart(2, "0")} · {section.title}
                </option>
              ))}
            </select>
          </label>
          <article className="playbook-article">
            <header>
              <span className="playbook-chapter-number">
                {String(chapter + 1).padStart(2, "0")} / 07
              </span>
              <h1 ref={titleRef} tabIndex={-1}>
                {current.title}
              </h1>
              {chapter === 0 && (
                <p className="playbook-intro">
                  Manual interno de prospeção, abordagem comercial e
                  identificação de oportunidades.
                </p>
              )}
            </header>
            <div className="playbook-prose">
              <PlaybookContent content={current.content} />
            </div>
          </article>
          <footer className="playbook-pagination">
            <button
              onClick={() => setChapter(chapter - 1)}
              disabled={chapter === 0}
            >
              <ArrowLeft size={16} />
              Anterior
            </button>
            {chapter < salesPlaybook.length - 1 ? (
              <button onClick={() => setChapter(chapter + 1)}>
                {salesPlaybook[chapter + 1].title}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={() => setChapter(null)}>
                Voltar a Prospect
                <ArrowRight size={16} />
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
