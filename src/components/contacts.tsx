"use client";
import { useState, useSyncExternalStore } from "react";
import { CalendarDays, ExternalLink, LayoutGrid, List, Map as MapIcon, MapPin, Pencil, Plus, Search, Star, Trash2, X, ListFilter } from "lucide-react";
import { siteKinds, stages, type CompanySite, type Organization, type SiteKind, type Stage } from "@/domain/model";
import { localDateTime, toInstant } from "@/domain/time";
import { raciusPage, raciusSearch } from "@/domain/racius";
import { CompanyMap } from "./company-map";
import { useWorkspace } from "./context";
import { FinancialSummary } from "./financials";
import type { FinancialYear } from "@/domain/prospects";
import { Popover } from "./popover";

type Layout = "list" | "grid" | "map";
// The chosen layout is a per-viewer convenience; the server always renders the list.
const storedLayout = (): Layout => { try { const value = window.localStorage.getItem("crm-layout"); return value === "grid" || value === "map" ? value : "list"; } catch { return "list"; } };
const subscribeLayout = (onChange: () => void) => { window.addEventListener("storage", onChange); return () => window.removeEventListener("storage", onChange); };

export function Contacts() {
  const { data, edit, command, notify } = useWorkspace();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [order, setOrder] = useState<"name" | "newest" | "oldest">("name");
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<Layout | null>(null);
  const stored = useSyncExternalStore<Layout>(subscribeLayout, storedLayout, () => "list");
  const layout = picked ?? stored;
  function chooseLayout(next: Layout) {
    setPicked(next);
    try { window.localStorage.setItem("crm-layout", next); } catch { /* storage unavailable */ }
  }
  const byOrder = (a: Organization, b: Organization) => order === "newest" ? b.createdAt.localeCompare(a.createdAt) : order === "oldest" ? a.createdAt.localeCompare(b.createdAt) : a.name.localeCompare(b.name);
  const companies = data.organizations.filter((company) => !company.archived && (!stageFilter || company.stage === stageFilter) && (!pinnedOnly || company.pinned) && company.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || byOrder(a, b));
  async function togglePin(company: Organization) {
    try { await command("organization.pin", { id: company.id, version: company.version }); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível destacar a empresa."); }
  }
  return <div className="compact-page"><header className="compact-heading"><div><h1>CRM</h1><span>Companies</span></div><button onClick={() => edit({ type: "organization" })}><Plus size={15}/>New company</button></header>
    <div className="compact-toolbar"><label><Search size={14}/><input aria-label="Search companies" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies"/></label><div className="toolbar-controls"><span>{companies.length} companies</span><div className="crm-layout-toggle" role="group" aria-label="Company layout"><button type="button" className={layout === "list" ? "active" : ""} aria-pressed={layout === "list"} aria-label="List view" title="List" onClick={() => chooseLayout("list")}><List size={15}/></button><button type="button" className={layout === "grid" ? "active" : ""} aria-pressed={layout === "grid"} aria-label="Block view" title="Blocks" onClick={() => chooseLayout("grid")}><LayoutGrid size={15}/></button><button type="button" className={layout === "map" ? "active" : ""} aria-pressed={layout === "map"} aria-label="Map view" title="Map" onClick={() => chooseLayout("map")}><MapIcon size={15}/></button></div><Popover label="Filter companies" icon={<ListFilter size={15}/>} active={!!stageFilter || pinnedOnly || order !== "name"}><h3>Filters</h3><label>Status<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All statuses</option>{Object.entries(stages).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Favourites<select value={pinnedOnly ? "pinned" : ""} onChange={(event) => setPinnedOnly(event.target.value === "pinned")}><option value="">All companies</option><option value="pinned">Favourites only</option></select></label><label>Order<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}><option value="name">Name (A–Z)</option><option value="newest">Newest added</option><option value="oldest">Oldest added</option></select></label></Popover></div></div>
    {layout === "list" ? <>
    <div className="company-table"><div className="company-table-head"><span>Name</span><span>Status</span><span>Last note</span></div>{companies.map((company) => {
      const latest = data.interactions.filter((entry) => entry.organizationId === company.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
      return <div className="company-table-row" key={company.id}>
        <StarButton company={company} onToggle={togglePin}/>
        <button className="company-table-open" onClick={() => setSelected(company.id)}><strong>{company.name}</strong><span className="company-stage-cell"><span className={`crm-stage-pill crm-stage-${company.stage}`}><i className={`crm-dot crm-stage-${company.stage}`}/>{stages[company.stage]}</span></span><span>{latest?.body ?? "No activity yet"}</span></button>
      </div>;
    })}{!companies.length && <p className="focus-empty">No companies found.</p>}</div>
    </> : layout === "map" ? <CompanyMap companies={companies} onSelect={setSelected}/> : <>
    <div className="company-grid">{companies.map((company) => <div className={`company-card crm-stage-${company.stage}`} key={company.id}>
      <StarButton company={company} onToggle={togglePin}/>
      <button className="company-card-open" onClick={() => setSelected(company.id)}><strong>{company.name}</strong><span className="company-card-location"><MapPin size={13}/>{company.location || "Sem localização"}</span><span className={`crm-stage-pill crm-stage-${company.stage}`}><i className={`crm-dot crm-stage-${company.stage}`}/>{stages[company.stage]}</span></button>
    </div>)}{!companies.length && <p className="focus-empty">No companies found.</p>}</div>
    </>}
    {selected && <CompanyPanel company={data.organizations.find((company) => company.id === selected)!} onClose={() => setSelected(null)}/>}
  </div>;
}

function FinancialsSection({ company, onError }: { company: Organization; onError: (message: string) => void }) {
  const { command, refresh, notify } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState("");
  const [linking, setLinking] = useState(false);
  async function linkIberinform() {
    setLinking(true);
    try {
      const response = await fetch("/api/companies/size", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: company.id, url: link }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível ler o Iberinform.");
      notify(body.message); setLink(""); onError(""); await refresh();
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Não foi possível ler o Iberinform."); }
    finally { setLinking(false); }
  }
  const iberinformSearch = `https://www.google.com/search?q=${encodeURIComponent(`site:iberinform.pt "${company.name}"`)}`;
  const years = company.financials ?? [];
  async function save(next: FinancialYear[]) {
    // organization.save replaces the fields it is given defaults for, so send the whole record back.
    const { id, version, name, person, email, phone, stage, ownerId, nextStep, followUpOn } = company;
    try { await command("organization.save", { id, version, name, person, email, phone, stage, ownerId, nextStep, followUpOn, financials: next }); onError(""); setAdding(false); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "Não foi possível guardar os dados financeiros."); }
  }
  const number = (value: FormDataEntryValue | null) => { const text = String(value ?? "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."); return text ? Number(text) : undefined; };
  return <section className="company-panel-section"><h3>Size (ICP)</h3>
    <FinancialSummary financials={years} size={company.size}/>
    <form className="iberinform-link" onSubmit={(event) => { event.preventDefault(); if (link.trim()) void linkIberinform(); }}>
      <input value={link} onChange={(event) => setLink(event.target.value)} aria-label="Link da página da empresa no Iberinform" placeholder={company.size ? "Atualizar com outro link do Iberinform" : "Cola o link da empresa no Iberinform"}/>
      <button disabled={linking || !link.trim()}>{linking ? "A ler…" : company.size ? "Atualizar" : "Ligar"}</button>
    </form>
    <p className="financial-hint"><a href={iberinformSearch} target="_blank" rel="noopener noreferrer">Procurar esta empresa no Iberinform</a>: abre a página, copia o link e cola-o aqui. O NIF da página tem de coincidir com o da empresa.</p>
    {years.length > 0 && <ul className="company-sites">{[...years].reverse().map((entry) => <li key={entry.year}><span>{entry.year}</span><p>{entry.turnover !== undefined ? `${entry.turnover.toLocaleString("pt-PT")} €` : "—"} · {entry.employees ?? "—"} empregados</p><button type="button" aria-label={`Remover ${entry.year}`} onClick={() => void save(years.filter((item) => item.year !== entry.year))}><X size={13}/></button></li>)}</ul>}
    {adding ? <form className="company-site-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const year = Number(form.get("year")); void save([...years.filter((item) => item.year !== year), { year, turnover: number(form.get("turnover")), employees: number(form.get("employees")) }]); }}>
      <input name="year" aria-label="Ano" type="number" min={1990} max={2100} defaultValue={new Date().getFullYear() - 1} required/>
      <input name="turnover" aria-label="Volume de negócios (€)" placeholder="Volume de negócios (€), ex.: 3.450.000" inputMode="decimal"/>
      <input name="employees" aria-label="Empregados" placeholder="Empregados" type="number" min={0}/>
      <div><button type="button" onClick={() => setAdding(false)}>Cancel</button><button>Save year</button></div>
    </form> : <button type="button" className="company-schedule" onClick={() => setAdding(true)}><Plus size={14}/>Add year</button>}
  </section>;
}

function SitesSection({ company, onError }: { company: Organization; onError: (message: string) => void }) {
  const { command } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const sites = company.sites ?? [];
  async function save(next: CompanySite[]) {
    // organization.save replaces the fields it is given defaults for, so send the whole record back.
    const { id, version, name, person, email, phone, stage, ownerId, nextStep, followUpOn } = company;
    try { await command("organization.save", { id, version, name, person, email, phone, stage, ownerId, nextStep, followUpOn, sites: next }); onError(""); setAdding(false); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "Não foi possível guardar a instalação."); }
  }
  return <section className="company-panel-section"><h3>Other facilities <span>{sites.length}</span></h3>
    {sites.length > 0 && <ul className="company-sites">{sites.map((site) => <li key={site.id}><span>{siteKinds[site.kind]}</span><p>{site.address}{site.location ? ` · ${site.location}` : ""}</p><button type="button" aria-label={`Remover ${siteKinds[site.kind]}`} onClick={() => void save(sites.filter((item) => item.id !== site.id))}><X size={13}/></button></li>)}</ul>}
    {adding ? <form className="company-site-form" onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void save([...sites, { id: "", kind: String(values.kind) as SiteKind, address: String(values.address), location: String(values.location) }]); }}>
      <select name="kind" aria-label="Tipo" defaultValue="sede">{Object.entries(siteKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <input name="address" aria-label="Morada" placeholder="Morada" required maxLength={300}/>
      <input name="location" aria-label="Concelho" placeholder="Concelho" maxLength={160}/>
      <div><button type="button" onClick={() => setAdding(false)}>Cancel</button><button>Add</button></div>
    </form> : <button type="button" className="company-schedule" onClick={() => setAdding(true)}><Plus size={14}/>Add facility</button>}
  </section>;
}

function StarButton({ company, onToggle }: { company: Organization; onToggle: (company: Organization) => Promise<void> }) {
  return <button className="company-star" aria-label={company.pinned ? `Remover ${company.name} dos destaques` : `Destacar ${company.name}`} aria-pressed={!!company.pinned} title={company.pinned ? "Remover dos destaques" : "Destacar no topo"} onClick={() => void onToggle(company)}><Star size={15} fill={company.pinned ? "currentColor" : "none"}/></button>;
}

export function CompanyPanel({ company, onClose }: { company: Organization; onClose: () => void }) {
  const { data, command, notify, capture, confirm } = useWorkspace();
  const [editing, setEditing] = useState(false);
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
  async function saveDetails(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form));
    try { await command("organization.save", { ...values, id: company.id, version: company.version, stage: company.stage }); setEditing(false); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível guardar."); }
  }
  async function remove() {
    if (!(await confirm(`Eliminar a empresa “${company.name}” e o respetivo histórico CRM?`))) return;
    try { await command("organization.delete", { id: company.id, version: company.version }); onClose(); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível eliminar."); }
  }
  const owner = data.members.find((member) => member.id === company.ownerId);
  const details: [string, string][] = [["Location", company.location ?? ""], ["Address", `${company.siteKind ? `${siteKinds[company.siteKind]} · ` : ""}${company.address ?? ""}`], ["NIF", company.nif ?? ""], ["Contact person", company.person], ["Email", company.email], ["Phone", company.phone], ["Owner", owner?.name ?? ""], ["Next step", company.nextStep], ["Follow up", company.followUpOn ?? ""]];
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
    <header className="side-panel-header"><span>Company</span><button aria-pressed={editing} onClick={() => setEditing(!editing)}><Pencil size={14}/>{editing ? "Cancel edit" : "Edit"}</button><button className="danger" onClick={() => void remove()}><Trash2 size={14}/>Delete</button><button onClick={() => capture()}>Ask Agent</button><button aria-label="Close company" onClick={onClose}><X size={17}/></button></header>
    <div className="side-panel-scroll"><div className="company-panel-title"><h2>{company.name}</h2><span className={`crm-stage-pill crm-stage-${company.stage}`}><i className={`crm-dot crm-stage-${company.stage}`}/>{stages[company.stage]}</span></div>
      <section className="company-panel-section"><h3 className="company-details-heading">Details<span className="company-racius"><a href={raciusPage(company.name)} target="_blank" rel="noopener noreferrer" title="Abre a ficha da empresa no Racius: sede, atividade, CAE e capital social">Abrir no Racius<ExternalLink size={12}/></a><a href={raciusSearch(company.name)} target="_blank" rel="noopener noreferrer" title="Se a ficha não abrir, pesquisa a empresa no Racius">Não encontrou?</a></span></h3>{editing ? <form key={company.version} className="company-details-form" onSubmit={(event) => { event.preventDefault(); void saveDetails(event.currentTarget); }}>
        <label>Name<input name="name" defaultValue={company.name} required maxLength={160} autoFocus/></label>
        <label>Location<input name="location" defaultValue={company.location ?? ""} maxLength={160} placeholder="Concelho, ex.: Águeda"/></label>
        <label>Address<input name="address" defaultValue={company.address ?? ""} maxLength={300} placeholder="Rua, número, código postal e localidade"/></label>
        <div><label>Visited site<select name="siteKind" defaultValue={company.siteKind ?? ""}><option value="">—</option>{Object.entries(siteKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>NIF<input name="nif" defaultValue={company.nif ?? ""} inputMode="numeric" maxLength={9} pattern="\d{9}" placeholder="9 dígitos"/></label></div>
        <label>Contact person<input name="person" defaultValue={company.person} maxLength={160}/></label>
        <div><label>Email<input name="email" type="email" defaultValue={company.email} maxLength={200}/></label><label>Phone<input name="phone" type="tel" defaultValue={company.phone} maxLength={50}/></label></div>
        <div><label>Owner<select name="ownerId" defaultValue={company.ownerId}>{data.members.filter((member) => !member.archived || member.id === company.ownerId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Follow up<input name="followUpOn" type="date" defaultValue={company.followUpOn ?? ""}/></label></div>
        <label>Next step<input name="nextStep" defaultValue={company.nextStep} maxLength={500}/></label>
        <div className="company-details-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button>Save details</button></div>
      </form> : <dl className="company-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>}</section>
      <SitesSection company={company} onError={setError}/>
      <FinancialsSection company={company} onError={setError}/>
      <section className="company-panel-section"><h3>Status</h3><div className="company-stage-row"><select aria-label="Company status" value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{Object.entries(stages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>{stage !== company.stage && <div className="company-stage-note"><textarea aria-label="Status note" value={stageNote} onChange={(event) => setStageNote(event.target.value)} placeholder="What changed? A short note is required." rows={2}/><button disabled={!stageNote.trim()} onClick={() => void changeStage()}>Confirm status</button></div>}</section>
      <section className="company-panel-section"><h3>Calendar</h3><button className="company-schedule" onClick={() => setScheduling(!scheduling)}><CalendarDays size={15}/>Schedule event</button>{scheduling && <form className="company-event-form" onSubmit={(event) => { event.preventDefault(); void schedule(event.currentTarget); }}><input name="title" aria-label="Event title" defaultValue={`Meeting · ${company.name}`} required/><div><label>Date<input name="date" type="date" required/></label><label>Time<input name="time" type="time" required/></label><label>Duration<select name="duration" defaultValue="30"><option value="30">30 min</option><option value="60">1 hour</option><option value="90">90 min</option></select></label></div><label>Calendar<select name="calendarKey" defaultValue="contacto"><option value="contacto">Contacto</option><option value="office">Office</option></select></label><fieldset><legend>Participants</legend>{data.members.filter((member) => member.id !== data.me.id).map((member) => <label key={member.id}><input type="checkbox" name="participantIds" value={member.id}/>{member.name}</label>)}</fieldset><label>Visibility<select name="visibility" defaultValue="private"><option value="private">Participants only</option><option value="team">Visible to team</option></select></label><textarea name="description" placeholder="Description (optional)" rows={2}/><button>Save event</button></form>}</section>
      <section className="company-panel-section"><h3>Timeline <span>{entries.length}</span></h3><div className="company-timeline">{entries.map((entry) => <article key={entry.id}><small>{new Date(entry.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" })}</small><strong>{entry.stageTo ? `Status changed to ${stages[entry.stageTo]}` : entry.channel === "meeting" ? "Event scheduled" : "Note added"}</strong><p>{entry.body}</p></article>)}{!entries.length && <p className="focus-empty">No history yet.</p>}</div><form className="company-note-form" onSubmit={async (event) => { event.preventDefault(); if (!note.trim()) return; try { await command("organization.note", { id: company.id, body: note }); setNote(""); } catch (reason) { notify(reason instanceof Error ? reason.message : "Nota não guardada."); } }}><textarea aria-label="Add company note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note after a meeting…" rows={3}/><button disabled={!note.trim()}>Add note</button></form></section>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </aside></div>;
}
