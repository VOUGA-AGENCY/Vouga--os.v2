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
      setError("Write what you want to record.");
      return;
    }
    if (raw.trim().split(/\n+/).length > 10) {
      setError("Use up to 10 lines at a time. Your text remains saved.");
      return;
    }
    const parsed = parseCapture(raw, data, data.me, data.now);
    if (parsed.length > 10) { setError("The capture generated more than 10 records. Split the text into two parts."); return; }
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
    if (!Constructor) { setError("This browser does not support dictation. You can continue by typing."); return; }
    const recognition = new Constructor();
    recognition.lang = "pt-PT";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setRaw((old) => old.trim() ? `${old.trim()}\n${transcript}` : transcript);
      setError("");
    };
    recognition.onerror = () => { setError("Could not capture audio. You can type the same text."); setListening(false); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    try { recognition.start(); recognitionRef.current = recognition; setListening(true); setError(""); }
    catch { setError("Could not start the microphone."); }
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
            <button className={`voice-button ${listening ? "active" : ""}`} onClick={voice} type="button"><Mic size={17}/>{listening ? "Listening… tap to stop" : "Dictate in Portuguese"}</button>
            <textarea
              className="capture-input"
              aria-label="What do you want to record?"
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
              <span>Voice is transcribed by the browser; review it before saving.</span>
              <kbd>⌘ ↵</kbd>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Review the type, person, and dates. Times use Lisbon time.
            </p>
            {drafts.map((draft, index) => (
              <section className="capture-draft" key={index}>
                <div className="capture-draft-heading">
                  <span className="eyebrow">
                    RECORD {String(index + 1).padStart(2, "0")}
                  </span>
                  {drafts.length > 1 && (
                    <button
                      className="icon-button"
                      aria-label={`Remove record ${index + 1}`}
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
                    Type
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
                        ? "Calendar owner"
                        : "Owner"}
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
                    Update
                    <textarea
                      value={draft.body}
                      maxLength={10000}
                      onChange={(e) => patch(index, { body: e.target.value })}
                    />
                  </label>
                ) : (
                  <label>
                      {["contact", "crm"].includes(draft.kind) ? "Organization" : "Title"}
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
                      Project
                      <select
                        value={draft.projectId}
                        onChange={(e) =>
                          patch(index, { projectId: e.target.value })
                        }
                      >
                        <option value="">No project</option>
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
                        ? "Conversation with existing organization"
                        : "Organization"}
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
                            ? "Create organization"
                            : "No organization"}
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
                  <label>New organization (optional)
                      <input value={draft.organizationName} onChange={(e) => patch(index, { organizationName: e.target.value, ...(draft.kind === "contact" ? {title: e.target.value} : {}) })} placeholder="Company name" />
                  </label>
                )}
                {!["note", "update", "inbox", "crm"].includes(draft.kind) && (
                  <div className="form-grid">
                    <label>
                      {draft.kind === "contact" ? "Follow up on" : "Date"}
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => patch(index, { date: e.target.value })}
                      />
                    </label>
                    {["meeting", "event", "reminder"].includes(draft.kind) && (
                      <label>
                        Time · Lisbon
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
                        Duration (minutes)
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
                        Contact person
                        <input
                          value={draft.person}
                          onChange={(e) =>
                            patch(index, { person: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Next step
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
                  <summary>Original context</summary>
                  <textarea
                    value={draft.body}
                    maxLength={10000}
                    onChange={(e) => patch(index, { body: e.target.value })}
                    aria-label={`Record context ${index + 1}`}
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
                Add another record
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
              Original text
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
                      : "Could not save.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Saving…"
                : drafts.length > 1
                  ? `Save ${drafts.length} records`
                  : "Save record"}
            </button>
          </>
        ) : (
          <>
            <span className="subtle">
              The text is saved in this tab.
            </span>
            <button className="button-primary" onClick={preview}>
              Organize
              <ArrowRight size={15} />
            </button>
          </>
        )}
      </footer>
    </Dialog>
  );
}
