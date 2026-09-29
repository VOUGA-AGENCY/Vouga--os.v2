"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "./context";
export function AgentPanel({
  context,
  onClose,
}: {
  context: { projectId?: string; companyId?: string; taskId?: string };
  onClose: () => void;
}) {
  const { data, refresh, command } = useWorkspace();
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<{ input: string; output: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    return () => {
      cancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      element?.close();
      previous?.focus();
    };
  }, []);
  async function submit(audio?: Blob) {
    setBusy(true);
    setError("");
    try {
      const endpoint = audio
        ? `/api/voice?${new URLSearchParams(Object.entries(context).filter((entry) => !!entry[1]) as [string, string][])}`
        : "/api/agent";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: audio
          ? { "Content-Type": audio.type, "X-Request-Id": crypto.randomUUID() }
          : { "Content-Type": "application/json" },
        body:
          audio ??
          JSON.stringify({ text: input, key: crypto.randomUUID(), context }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Agent unavailable.");
      setLines((old) => [
        ...old,
        { input: result.transcript || input, output: result.text },
      ]);
      setInput("");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Agent unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function microphone() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder)
        throw new Error("Recording is not supported in this browser.");
      cancelled.current = false;
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const media = new MediaRecorder(
        stream.current,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = media;
      const chunks: BlobPart[] = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = () => {
        stream.current?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (!cancelled.current)
          void submit(new Blob(chunks, { type: media.mimeType.split(";")[0] }));
      };
      media.start();
      setRecording(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not use the microphone.",
      );
    }
  }
  async function decide(id: string, confirm: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: id, confirm }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="note-composer-dialog agent-panel"
      aria-label="Vouga Agent"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="side-panel-header">
        <span>Vouga Agent</span>
        <button aria-label="Close Agent" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="agent-content">
        <small>
          {data.projects.find((item) => item.id === context.projectId)?.name ||
            data.organizations.find((item) => item.id === context.companyId)
              ?.name ||
            data.tasks.find((item) => item.id === context.taskId)?.title ||
            "Workspace"}
        </small>
        <div className="agent-results">
          {!lines.length && (
            <p className="muted">Ask a question, record something, or request an action.</p>
          )}
          {lines.map((line, index) => (
            <article key={index}>
              <small>{line.input}</small>
              <p>{line.output}</p>
            </article>
          ))}
          {data.pendingActions.map((action) => (
            <article key={action.id}>
              <p>{action.summary}</p>
              <button
                disabled={busy}
                onClick={() => void decide(action.id, true)}
              >
                Confirm
              </button>
              <button
                disabled={busy}
                onClick={() => void decide(action.id, false)}
              >
                Cancel
              </button>
            </article>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <textarea
            aria-label="Ask or capture"
            placeholder="Ask or capture…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
          />
          <div>
            <button
              type="button"
              aria-label={recording ? "Stop recording" : "Record voice"}
              disabled={busy}
              onClick={() => void microphone()}
            >
              {recording ? <Square size={16} /> : <Mic size={16} />}
            </button>
            <button
              disabled={busy || recording || !input.trim()}
              aria-label="Send to Agent"
            >
              <ArrowUp size={16} />
              {busy ? "Processing…" : "Send"}
            </button>
          </div>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error} <Link href="/settings">Integrations</Link>
          </p>
        )}
        <button
          className="text-button"
          disabled={busy || !input.trim()}
          onClick={async () => {
            try {
              await command("inbox.save", { body: input });
              setInput("");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not save.",
              );
            }
          }}
        >
          Save to Inbox for later
        </button>
      </div>
    </dialog>
  );
}
