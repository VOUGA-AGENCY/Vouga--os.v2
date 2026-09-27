"use client";
import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, Mic, Plus, Trash2 } from "lucide-react";
import type { CaptureDraft, CaptureKind } from "@/domain/model";
import { captureKinds, stages } from "@/domain/model";
import { emptyDraft, parseCapture } from "@/domain/capture";
import { useWorkspace } from "./context";
import { Dialog } from "./dialog";

export function Capture({
  onClose,
  initialKind,
}: {
  onClose: () => void;
  initialKind?: CaptureKind;
}) {
  const { data, command } = useWorkspace();
  const [raw, setRaw] = useState(() => {
    try {
      return sessionStorage.getItem(`vouga.capture.${data.me.id}`) ?? "";
    } catch {
      return "";
    }
  });
  const [drafts, setDrafts] = useState<CaptureDraft[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop(): void } | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const patch = (index: number, changes: Partial<CaptureDraft>) =>
    setDrafts(
      (current) =>
        current?.map((d, i) => (i === index ? { ...d, ...changes } : d)) ??
        null,
    );
  function preview() {
    if (!raw.trim()) {
      setError("Escreve o que queres registar.");
      return;
    }
    if (raw.trim().split(/\n+/).length > 10) {
      setError("Usa até 10 linhas de cada vez. O texto continua guardado.");
      return;
    }
    const parsed = parseCapture(raw, data, data.me, data.now);
    if (parsed.length > 10) { setError("A captura gerou mais de 10 registos. Divide o texto em duas partes."); return; }
    if (initialKind && parsed.length === 1) parsed[0].kind = initialKind;
    setDrafts(parsed);
    setError("");
  }
  function voice() {
    if (listening) { recognitionRef.current?.stop(); return; }
    type Result = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type Recognition = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((event: Result) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { setError("Este browser não suporta ditado. Podes continuar por texto."); return; }
    const recognition = new Constructor();
    recognition.lang = "pt-PT";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setRaw((old) => old.trim() ? `${old.trim()}\n${transcript}` : transcript);
      setError("");
    };
    recognition.onerror = () => { setError("Não foi possível captar a voz. Podes escrever o mesmo texto."); setListening(false); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    try { recognition.start(); recognitionRef.current = recognition; setListening(true); setError(""); }
    catch { setError("Não foi possível iniciar o microfone."); }
  }
  return (
    <Dialog
      title={drafts ? "Review capture" : "Capture anything"}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="capture-body">
        {!drafts ? (
          <>
            <p className="muted">Write or speak. One sentence can create several linked actions.</p>
            <button className={`voice-button ${listening ? "active" : ""}`} onClick={voice} type="button"><Mic size={17}/>{listening ? "A ouvir… tocar para parar" : "Ditar em português"}</button>
            <textarea
              className="capture-input"
              aria-label="O que queres registar?"
              autoFocus
              maxLength={10000}
              value={raw}
              placeholder={
                "Preparar a proposta para a Norte Metal amanhã\nReunião com a equipa sexta às 10h para o Miguel"
              }
              onChange={(e) => {
                setRaw(e.target.value);
                try {
                  sessionStorage.setItem(
                    `vouga.capture.${data.me.id}`,
                    e.target.value,
                  );
                } catch {
                  /* The visible draft is retained when storage is unavailable. */
                }
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  preview();
                }
              }}
            />
            <div className="capture-hints">
              <span>A voz é transcrita pelo browser; revê antes de guardar.</span>
              <kbd>⌘ ↵</kbd>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Revê o tipo, a pessoa e as datas. As horas são de Lisboa.
            </p>
            {drafts.map((draft, index) => (
              <section className="capture-draft" key={index}>
                <div className="capture-draft-heading">
                  <span className="eyebrow">
                    REGISTO {String(index + 1).padStart(2, "0")}
                  </span>
                  {drafts.length > 1 && (
                    <button
                      className="icon-button"
                      aria-label={`Remover registo ${index + 1}`}
                      onClick={() =>
                        setDrafts(drafts.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Tipo
                    <select
                      value={draft.kind}
                      onChange={(e) =>
                        patch(index, { kind: e.target.value as CaptureKind })
                      }
                    >
                      {Object.entries(captureKinds).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!["note", "update", "inbox", "crm"].includes(draft.kind) && (
                    <label>
                      {["meeting", "event"].includes(draft.kind)
                        ? "No calendário de"
                        : "Responsável"}
                      <select
                        value={draft.ownerId}
                        onChange={(e) =>
                          patch(index, { ownerId: e.target.value })
                        }
                      >
                        {data.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {draft.kind === "update" ? (
                  <label>
                    Atualização
                    <textarea
                      value={draft.body}
                      maxLength={10000}
                      onChange={(e) => patch(index, { body: e.target.value })}
                    />
                  </label>
                ) : (
                  <label>
                    {["contact", "crm"].includes(draft.kind) ? "Organização" : "Título"}
                    <input
                      value={draft.title}
                      maxLength={160}
                      onChange={(e) => patch(index, { title: e.target.value })}
                    />
                  </label>
                )}
                <div className="form-grid">
                  {!["contact", "reminder", "inbox", "crm"].includes(draft.kind) && (
                    <label>
                      Projeto
                      <select
                        value={draft.projectId}
                        onChange={(e) =>
                          patch(index, { projectId: e.target.value })
                        }
                      >
                        <option value="">Sem projeto</option>
                        {data.projects
                          .filter((p) => p.status !== "archived")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {!["note", "update", "reminder", "inbox"].includes(draft.kind) && (
                    <label>
                      {draft.kind === "contact"
                        ? "Conversa com organização existente"
                        : "Organização"}
                      <select
                        value={draft.organizationId}
                        onChange={(e) => {
                          const org = data.organizations.find(
                            (o) => o.id === e.target.value,
                          );
                          patch(index, {
                            organizationId: e.target.value,
                            ...(draft.kind === "contact" && org
                              ? { title: org.name }
                              : {}),
                          });
                        }}
                      >
                        <option value="">
                          {draft.kind === "contact"
                            ? "Criar organização"
                            : "Sem organização"}
                        </option>
                        {data.organizations
                          .filter((o) => !o.archived)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
                {!["note", "update", "reminder", "inbox", "crm"].includes(draft.kind) && !draft.organizationId && (
                  <label>Nova organização (opcional)
                    <input value={draft.organizationName} onChange={(e) => patch(index, { organizationName: e.target.value, ...(draft.kind === "contact" ? {title: e.target.value} : {}) })} placeholder="Nome da empresa" />
                  </label>
                )}
                {!["note", "update", "inbox", "crm"].includes(draft.kind) && (
                  <div className="form-grid">
                    <label>
                      {draft.kind === "contact" ? "Retomar em" : "Data"}
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => patch(index, { date: e.target.value })}
                      />
                    </label>
                    {["meeting", "event", "reminder"].includes(draft.kind) && (
                      <label>
                        Hora · Lisboa
                        <input
                          type="time"
                          value={draft.time}
                          onChange={(e) =>
                            patch(index, { time: e.target.value })
                          }
                        />
                      </label>
                    )}
                    {["meeting", "event"].includes(draft.kind) && (
                      <label>
                        Duração (minutos)
                        <input
                          type="number"
                          min={5}
                          max={1440}
                          value={draft.duration}
                          onChange={(e) =>
                            patch(index, { duration: e.target.value })
                          }
                        />
                      </label>
                    )}
                  </div>
                )}
                {draft.kind === "contact" && (
                  <div className="form-grid">
                    {!draft.organizationId && (
                      <label>
                        Pessoa de contacto
                        <input
                          value={draft.person}
                          onChange={(e) =>
                            patch(index, { person: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Próximo passo
                      <input
                        value={draft.nextStep}
                        onChange={(e) =>
                          patch(index, { nextStep: e.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
                {draft.kind === "crm" && <div className="form-grid"><label>New status
                  <select value={draft.stage} onChange={(event) => patch(index, { stage: event.target.value })}>
                    <option value="">Choose status</option>{Object.entries(stages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select></label><label>Status note<textarea value={draft.body} onChange={(event) => patch(index, { body: event.target.value })} rows={2}/></label></div>}
                <details>
                  <summary>Contexto original</summary>
                  <textarea
                    value={draft.body}
                    maxLength={10000}
                    onChange={(e) => patch(index, { body: e.target.value })}
                    aria-label={`Contexto do registo ${index + 1}`}
                  />
                </details>
              </section>
            ))}
            {drafts.length < 10 && (
              <button
                className="text-button"
                onClick={() => setDrafts([...drafts, emptyDraft(data.me)])}
              >
                <Plus size={15} />
                Adicionar outro registo
              </button>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="dialog-footer">
        {drafts ? (
          <>
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => setDrafts(null)}
            >
              <ChevronLeft size={15} />
              Texto original
            </button>
            <button
              className="button-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await command("capture.commit", { key, drafts });
                  try {
                    sessionStorage.removeItem(`vouga.capture.${data.me.id}`);
                  } catch {}
                  onClose();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível guardar.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "A guardar…"
                : drafts.length > 1
                  ? `Guardar ${drafts.length} registos`
                  : "Guardar registo"}
            </button>
          </>
        ) : (
          <>
            <span className="subtle">
              O texto fica guardado neste separador.
            </span>
            <button className="button-primary" onClick={preview}>
              Organizar
              <ArrowRight size={15} />
            </button>
          </>
        )}
      </footer>
    </Dialog>
  );
}
