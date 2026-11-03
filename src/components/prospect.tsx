"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Presentation } from "lucide-react";
import { BeamsBackground } from "./ui/beams-background";
import { PlaybookReader } from "./playbook-reader";

export function Prospect() {
  const [chapter, setChapter] = useState<number | null>(null);
  const landingRef = useRef<HTMLButtonElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (chapter === null) landingRef.current?.focus();
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
  return <PlaybookReader onBack={() => setChapter(null)} />;
}
