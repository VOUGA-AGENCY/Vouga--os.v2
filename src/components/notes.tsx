"use client";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Plus, Trash2, Users, X } from "lucide-react";
import { useWorkspace, type Editor } from "./context";

export function StickyNotes() {
  const { data, edit } = useWorkspace();
  const notes = data.notes.filter((note) => !note.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <section className="home-notes" aria-label="Notes"><header><div><h2>Notes</h2><span>{notes.length}</span></div><button className="text-button" onClick={() => edit({ type: "note" })}><Plus size={14}/>Nova nota</button></header>
    <div className="sticky-notes-grid">{notes.map((note) => <button className="sticky-note" key={note.id} onClick={() => edit({ type: "note", id: note.id })}>
      <strong>{note.title}</strong><p>{note.body}</p><footer><span>{data.members.find((member) => member.id === note.createdBy)?.name}</span><span>{note.visibility === "private" ? <><LockKeyhole size={11}/>Só eu</> : <><Users size={11}/>{note.visibility === "team" ? "Equipa" : (note.recipientIds ?? []).map((id) => data.members.find((member) => member.id === id)?.name).filter(Boolean).join(", ")}</>}</span></footer>
    </button>)}<button className="sticky-note-add" onClick={() => edit({ type: "note" })}><Plus size={18}/><span>Escrever uma nota</span></button></div>
  </section>;
}

export function NoteComposer({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { data, command, busy } = useWorkspace();
  const note = data.notes.find((item) => item.id === editor.id);
  const writable = !note || note.createdBy === data.me.id;
  const [visibility, setVisibility] = useState(note?.visibility ?? "private");
  const [recipients, setRecipients] = useState<string[]>(note?.recipientIds ?? []);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const dialog = ref.current; dialog?.showModal(); dialog?.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); return () => { dialog?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="note-composer-dialog" aria-label={note ? "Nota" : "Nova nota"} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="side-panel-header"><span>{note ? "Nota" : "Nova nota"}</span>{note && writable && <button type="button" className="danger" onClick={() => { if (!window.confirm(`Eliminar a nota “${note.title}”?`)) return; void command("note.delete", { id: note.id, version: note.version }).then(onClose).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível eliminar.")); }}><Trash2 size={14}/>Eliminar</button>}<button type="button" aria-label="Fechar nota" onClick={onClose}><X size={17}/></button></header>
    <form className="note-composer" onSubmit={async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); setError(""); try { await command("note.save", { ...(note ?? {}), title: values.get("title"), body: values.get("body"), visibility, recipientIds: recipients, projectId: note?.projectId ?? editor.projectId, organizationId: note?.organizationId ?? editor.organizationId }); onClose(); } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível guardar."); } }}>
      <input name="title" className="composer-title" aria-label="Título da nota" placeholder="Uma ideia, um lembrete…" defaultValue={note?.title} required maxLength={160} readOnly={!writable} autoFocus/>
      <textarea name="body" className="composer-description" aria-label="Texto da nota" placeholder="Escreve aqui…" defaultValue={note?.body} rows={10} readOnly={!writable}/>
      {writable ? <><div className="note-sharing"><label>Para<select aria-label="Visibilidade da nota" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="private">Só eu</option><option value="shared">Pessoas escolhidas</option>{note?.visibility === "team" && <option value="team">Equipa (nota existente)</option>}</select></label>{visibility === "shared" && <fieldset><legend>Partilhar com</legend>{data.members.filter((member) => member.id !== data.me.id).map((member) => <label key={member.id}><input type="checkbox" checked={recipients.includes(member.id)} onChange={(event) => setRecipients(event.target.checked ? [...recipients, member.id] : recipients.filter((id) => id !== member.id))}/>{member.name}</label>)}</fieldset>}</div>{error && <p role="alert" className="form-error">{error}</p>}<footer>{note && <button type="button" className="text-button" disabled={busy} onClick={() => void command("note.save", { ...note, archived: !note.archived }).then(onClose).catch((error) => setError(error.message))}>{note.archived ? "Restaurar" : "Arquivar"}</button>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar nota"}</button></footer></> : <p className="composer-hint">Partilhada por {data.members.find((member) => member.id === note?.createdBy)?.name} · só o autor pode editar.</p>}
    </form>
  </dialog>;
}
