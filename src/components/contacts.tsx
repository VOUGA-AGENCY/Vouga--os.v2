"use client";
import { useState } from "react";
import { CalendarDays, Plus, Search, X, ListFilter } from "lucide-react";
import { stages, type Organization, type Stage } from "@/domain/model";
import { localDateTime, toInstant } from "@/domain/time";
import { useWorkspace } from "./context";
import { Popover } from "./popover";

export function Contacts() {
  const { data, edit } = useWorkspace();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const companies = data.organizations.filter((company) => !company.archived && (!stageFilter || company.stage === stageFilter) && company.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <div className="compact-page"><header className="compact-heading"><div><h1>CRM</h1><span>Companies</span></div><button onClick={() => edit({ type: "organization" })}><Plus size={15}/>New company</button></header>
    <div className="compact-toolbar"><label><Search size={14}/><input aria-label="Search companies" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies"/></label><div className="toolbar-controls"><span>{companies.length} companies</span><Popover label="Filter companies" icon={<ListFilter size={15}/>} active={!!stageFilter}><h3>Filters</h3><label>Status<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All statuses</option>{Object.entries(stages).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></Popover></div></div>
    <div className="company-table"><div className="company-table-head"><span>Name</span><span>Status</span><span>Last note</span></div>{companies.map((company) => {
      const latest = data.interactions.filter((entry) => entry.organizationId === company.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
      return <button className="company-table-row" key={company.id} onClick={() => setSelected(company.id)}><strong>{company.name}</strong><span><i className={`crm-dot crm-dot-${company.stage}`}/>{stages[company.stage]}</span><span>{latest?.body ?? "No activity yet"}</span></button>;
    })}{!companies.length && <p className="focus-empty">No companies found.</p>}</div>
    {selected && <CompanyPanel company={data.organizations.find((company) => company.id === selected)!} onClose={() => setSelected(null)}/>}
  </div>;
}

export function CompanyPanel({ company, onClose }: { company: Organization; onClose: () => void }) {
  const { data, command, notify, capture } = useWorkspace();
  const [stage, setStage] = useState<Stage>(company.stage);
  const [stageNote, setStageNote] = useState("");
  const [note, setNote] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState("");
  const events = data.activity.filter((entry) => entry.companyId === company.id);
  const entries = [...data.interactions.filter((entry) => entry.organizationId === company.id && !events.some((event) => event.metadata.interactionId === entry.id)), ...events.map((event) => ({id:event.id, createdAt:event.timestamp, body:event.summary, stageTo:undefined, channel:event.source, source:event.source}))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function changeStage() {
    if (stage === company.stage || !stageNote.trim()) return;
    try { await command("organization.stage", { id: company.id, version: company.version, stage, note: stageNote }); setStageNote(""); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível alterar o estado."); }
  }
  async function schedule(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form));
    const date = String(values.date), time = String(values.time), duration = Number(values.duration);
    const start = toInstant(`${date}T${time}`);
    if (!start) { setError("Data ou hora inválida em Lisboa."); return; }
    const end = localDateTime(new Date(Date.parse(start) + duration * 60000).toISOString());
    try { await command("meeting.save", { title: String(values.title || `Meeting · ${company.name}`), body: String(values.description || ""), kind: "meeting", startsAt: `${date}T${time}`, endsAt: end, calendarOwnerId: data.me.id, calendarKey: values.calendarKey, participantIds: [...new Set([data.me.id, ...new FormData(form).getAll("participantIds")])], organizationId: company.id, visibility: values.visibility }); setScheduling(false); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível agendar."); }
  }
  return <div className="side-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="side-panel" role="dialog" aria-modal="true" aria-label={company.name}>
    <header className="side-panel-header"><span>Company</span><button onClick={() => capture()}>Ask Agent</button><button aria-label="Close company" onClick={onClose}><X size={17}/></button></header>
    <div className="side-panel-scroll"><div className="company-panel-title"><h2>{company.name}</h2><span><i className={`crm-dot crm-dot-${company.stage}`}/>{stages[company.stage]}</span></div>
      <section className="company-panel-section"><h3>Status</h3><div className="company-stage-row"><select aria-label="Company status" value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{Object.entries(stages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>{stage !== company.stage && <div className="company-stage-note"><textarea aria-label="Status note" value={stageNote} onChange={(event) => setStageNote(event.target.value)} placeholder="What changed? A short note is required." rows={2}/><button disabled={!stageNote.trim()} onClick={() => void changeStage()}>Confirm status</button></div>}</section>
      <section className="company-panel-section"><h3>Calendar</h3><button className="company-schedule" onClick={() => setScheduling(!scheduling)}><CalendarDays size={15}/>Schedule event</button>{scheduling && <form className="company-event-form" onSubmit={(event) => { event.preventDefault(); void schedule(event.currentTarget); }}><input name="title" aria-label="Event title" defaultValue={`Meeting · ${company.name}`} required/><div><label>Date<input name="date" type="date" required/></label><label>Time<input name="time" type="time" required/></label><label>Duration<select name="duration" defaultValue="30"><option value="30">30 min</option><option value="60">1 hour</option><option value="90">90 min</option></select></label></div><label>Calendar<select name="calendarKey" defaultValue="contacto"><option value="contacto">Contacto</option><option value="office">Office</option></select></label><fieldset><legend>Participants</legend>{data.members.filter((member) => member.id !== data.me.id).map((member) => <label key={member.id}><input type="checkbox" name="participantIds" value={member.id}/>{member.name}</label>)}</fieldset><label>Visibility<select name="visibility" defaultValue="private"><option value="private">Participants only</option><option value="team">Visible to team</option></select></label><textarea name="description" placeholder="Description (optional)" rows={2}/><button>Save event</button></form>}</section>
      <section className="company-panel-section"><h3>Timeline <span>{entries.length}</span></h3><div className="company-timeline">{entries.map((entry) => <article key={entry.id}><small>{new Date(entry.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" })}</small><strong>{entry.stageTo ? `Status changed to ${stages[entry.stageTo]}` : entry.channel === "meeting" ? "Event scheduled" : "Note added"}</strong><p>{entry.body}</p></article>)}{!entries.length && <p className="focus-empty">No history yet.</p>}</div><form className="company-note-form" onSubmit={async (event) => { event.preventDefault(); if (!note.trim()) return; try { await command("organization.note", { id: company.id, body: note }); setNote(""); } catch (reason) { notify(reason instanceof Error ? reason.message : "Nota não guardada."); } }}><textarea aria-label="Add company note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note after a meeting…" rows={3}/><button disabled={!note.trim()}>Add note</button></form></section>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </aside></div>;
}
