"use client";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Plus, Trash2, Users, X } from "lucide-react";
import { SaveStatus, useAutosave } from "./autosave";
import { useWorkspace, type Editor } from "./context";

export function StickyNotes() {
  const { data, edit } = useWorkspace();
  const notes = data.notes
    .filter((note) => !note.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section className="home-notes" aria-label="Notes">
      <header>
        <div>
          <h2>Notes</h2>
          <span>{notes.length}</span>
        </div>
        <button className="text-button" onClick={() => edit({ type: "note" })}>
          <Plus size={14} />
          New note
        </button>
      </header>
      <div className="sticky-notes-grid">
        {notes.map((note) => (
          <button
            className="sticky-note"
            key={note.id}
            onClick={() => edit({ type: "note", id: note.id })}
          >
            <strong>{note.title}</strong>
            <p>{note.body}</p>
            <footer>
              <span>
                {
                  data.members.find((member) => member.id === note.createdBy)
                    ?.name
                }
              </span>
              <span>
                {note.visibility === "private" ? (
                  <>
                    <LockKeyhole size={11} />
                    Only me
                  </>
                ) : (
                  <>
                    <Users size={11} />
                    {note.visibility === "team"
                      ? "Team"
                      : (note.recipientIds ?? [])
                          .map(
                            (id) =>
                              data.members.find((member) => member.id === id)
                                ?.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                  </>
                )}
              </span>
            </footer>
          </button>
        ))}
        <button
          className="sticky-note-add"
          onClick={() => edit({ type: "note" })}
        >
          <Plus size={18} />
          <span>Write a note</span>
        </button>
      </div>
    </section>
  );
}

export function NoteComposer({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const { data, command, busy, confirm } = useWorkspace();
  const note = data.notes.find((item) => item.id === editor.id);
  const autosave = useAutosave("note.save", note?.id, note?.version);
  const writable = !note || note.createdBy === data.me.id;
  const [visibility, setVisibility] = useState(note?.visibility ?? "private");
  const [recipients, setRecipients] = useState<string[]>(
    note?.recipientIds ?? [],
  );
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="note-composer-dialog"
      aria-label={note ? "Note" : "New note"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className="side-panel-header">
        <span>{note ? "Note" : "New note"}</span>
        {note && writable && (
          <button
            type="button"
            className="danger"
            onClick={async () => {
              if (!(await confirm(`Delete the note “${note.title}”?`, "Delete"))) return;
              void autosave
                .flush()
                .then(() =>
                  command("note.delete", {
                    id: note.id,
                    version: note.version,
                  }),
                )
                .then(onClose)
                .catch((reason) =>
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Could not delete.",
                  ),
                );
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
        <button type="button" aria-label="Close note" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <form
        className="note-composer"
        onInput={(event) => {
          const target = event.target;
          if (
            writable &&
            (target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement) &&
            target.name
          )
            autosave.stage({ [target.name]: target.value });
        }}
        onBlur={(event) => {
          const target = event.target;
          if (
            writable &&
            (target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement) &&
            target.name
          )
            autosave.patch({ [target.name]: target.value });
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          setError("");
          try {
            if (note) {
              await autosave.flush();
              return;
            }
            await command("note.save", {
              ...(note ?? {}),
              title: values.get("title"),
              body: values.get("body"),
              visibility,
              recipientIds: recipients,
              projectId: editor.projectId,
              organizationId: editor.organizationId,
            });
            onClose();
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Could not save.",
            );
          }
        }}
      >
        <input
          name="title"
          className="composer-title"
          aria-label="Note title"
          placeholder="An idea, a reminder…"
          defaultValue={note?.title}
          required
          maxLength={160}
          readOnly={!writable}
          autoFocus
        />
        <textarea
          name="body"
          className="composer-description"
          aria-label="Note text"
          placeholder="Write here…"
          defaultValue={note?.body}
          rows={10}
          readOnly={!writable}
        />
        {writable ? (
          <>
            <div className="note-sharing">
              <label>
                For
                <select
                  aria-label="Note visibility"
                  value={visibility}
                  onChange={(event) => {
                    const next = event.target.value as typeof visibility;
                    setVisibility(next);
                    autosave.patch({
                      visibility: next,
                      recipientIds: next === "shared" ? recipients : [],
                    });
                  }}
                >
                  <option value="private">Only me</option>
                  <option value="shared">Selected people</option>
                  {note?.visibility === "team" && (
                    <option value="team">Team (existing note)</option>
                  )}
                </select>
              </label>
              {visibility === "shared" && (
                <fieldset>
                  <legend>Share with</legend>
                  {data.members
                    .filter((member) => member.id !== data.me.id)
                    .map((member) => (
                      <label key={member.id}>
                        <input
                          type="checkbox"
                          checked={recipients.includes(member.id)}
                          onChange={(event) => {
                            const ids = event.target.checked
                              ? [...recipients, member.id]
                              : recipients.filter((id) => id !== member.id);
                            setRecipients(ids);
                            autosave.patch({ visibility, recipientIds: ids });
                          }}
                        />
                        {member.name}
                      </label>
                    ))}
                </fieldset>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <footer>
              {note && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void autosave
                      .flush()
                      .then(() =>
                        command("note.save", {
                          id: note.id,
                          version: note.version,
                          archived: !note.archived,
                        }),
                      )
                      .then(onClose)
                      .catch((error) => setError(error.message))
                  }
                >
                  {note.archived ? "Restore" : "Archive"}
                </button>
              )}
              {note ? (
                <SaveStatus saver={autosave.saver} />
              ) : (
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Create note"}
                </button>
              )}
            </footer>
          </>
        ) : (
          <p className="composer-hint">
            Shared by{" "}
            {data.members.find((member) => member.id === note?.createdBy)?.name}{" "}
            · only the author can edit.
          </p>
        )}
      </form>
    </dialog>
  );
}
