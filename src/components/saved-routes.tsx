"use client";
import { useEffect, useState } from "react";
import { Check, Navigation, Play, Plus, RefreshCw, SkipForward, Sparkles, Trash2 } from "lucide-react";
import { stages, type Stage, type VisitRoute, type VisitRouteStop } from "@/domain/model";
import type { Prospect } from "@/domain/prospects";
import { shortDate } from "@/domain/time";
import { useApproachContext } from "./approach-context";
import { useWorkspace } from "./context";
import { SelectBox } from "./task-surface";

// Routes saved before they were shared lived in this browser only; they are moved to the workspace once.
const legacyKey = "vouga-saved-routes";
let importing = false;
type LegacyRoute = { name: string; date: string; stops: VisitRouteStop[] };
function legacyRoutes(): LegacyRoute[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(legacyKey) ?? "[]");
    return Array.isArray(parsed) ? (parsed as LegacyRoute[]) : [];
  } catch {
    return [];
  }
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase("pt") === b.toLocaleLowerCase("pt");

export function SavedRoutes() {
  const { data, command, notify, confirm, refresh } = useWorkspace();
  const approach = useApproachContext();
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<Stage | "">("");
  const [nextStep, setNextStep] = useState("");
  const [followUpOn, setFollowUpOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [replanning, setReplanning] = useState(false);
  // Adding a company during the day: what is near, where the person is, and the search text.
  type Nearby = { kind: "crm" | "prospect"; id: string; name: string; location: string; detail: string; km?: number; approximate?: boolean };
  const [adding, setAdding] = useState<{ items: Nearby[] | null; here: { lat: number; lng: number } | null; search: string; error: string } | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const pending = legacyRoutes();
    if (!pending.length || importing) return;
    importing = true;
    void (async () => {
      let moved = 0;
      for (const route of pending) {
        try {
          await command("route.save", { name: route.name, date: route.date, stops: route.stops });
          moved++;
        } catch { /* an invalid old route stays in this browser */ }
      }
      if (moved === pending.length) try { window.localStorage.removeItem(legacyKey); } catch { /* storage unavailable */ }
      if (moved) notify(`${moved} rota${moved === 1 ? "" : "s"} deste browser passaram para a base partilhada.`);
      importing = false;
    })();
  }, [command, notify]);

  const memberName = (id: string) => data.members.find((member) => member.id === id)?.name ?? "—";
  const companyFor = (stop: VisitRouteStop) =>
    data.organizations.find((o) => o.id === (stop.organizationId ?? (stop.kind === "crm" ? stop.id : null))) ??
    data.organizations.find((o) => !o.archived && sameName(o.name, stop.name));
  const routes = [...data.routes].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const open = routes.filter((route) => route.currentIndex < route.stops.length);
  const done = routes.filter((route) => route.currentIndex >= route.stops.length);
  const activeRoute = open.find((route) => route.id === activeRouteId) ?? null;
  const currentStop = activeRoute ? activeRoute.stops[activeRoute.currentIndex] : null;
  const company = currentStop ? companyFor(currentStop) : undefined;
  const canVisit = (route: VisitRoute) => data.me.role === "admin" || route.ownerId === data.me.id;
  const canManage = (route: VisitRoute) => canVisit(route) || route.createdBy === data.me.id;
  const expanded = expandedRouteId ?? open[0]?.id ?? null;

  async function requestApproach(stop: VisitRouteStop) {
    let prospect: Prospect | null = null;
    if (!companyFor(stop) && stop.kind === "prospect") {
      // Only the prospects around this stop are needed to describe it.
      const bbox = [stop.lng - 0.01, stop.lat - 0.01, stop.lng + 0.01, stop.lat + 0.01].join(",");
      try {
        const body = (await fetch(`/api/prospects?bbox=${bbox}`, { cache: "no-store" }).then((response) => response.json())) as { items?: Prospect[] };
        prospect = body.items?.find((item) => item.id === stop.id) ?? null;
      } catch { /* the Agent still gets the stop's name, place and reasons */ }
    }
    await approach.request({ id: stop.id, name: stop.name, location: stop.location, reasons: stop.reasons }, prospect);
  }

  function closeCheck() {
    setChecking(false);
    setNote("");
    setStage("");
    setNextStep("");
    setFollowUpOn("");
  }

  async function saveVisit() {
    if (!activeRoute || !note.trim() || !stage) return;
    setSaving(true);
    try {
      await command("route.visit", {
        id: activeRoute.id, version: activeRoute.version, note: note.trim(), stage,
        ...(nextStep.trim() ? { nextStep: nextStep.trim() } : {}),
        ...(followUpOn ? { followUpOn } : {}),
      });
      if (activeRoute.currentIndex + 1 >= activeRoute.stops.length) setActiveRouteId(null);
      closeCheck();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível guardar a visita.");
    } finally {
      setSaving(false);
    }
  }

  async function skip(route: VisitRoute, stop: VisitRouteStop) {
    if (!(await confirm(`Deixar ${stop.name} fora desta rota e passar à visita seguinte?`, "Saltar"))) return;
    try {
      await command("route.skip", { id: route.id, version: route.version });
      if (route.currentIndex + 1 >= route.stops.length) setActiveRouteId(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível saltar a visita.");
    }
  }

  // The current position makes the new order start where the person is; without it, from the last visit.
  const position = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (here) => resolve({ lat: here.coords.latitude, lng: here.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  });
  async function openAdding(route: VisitRoute) {
    setAdding({ items: null, here: null, search: "", error: "" });
    const here = await position();
    try {
      const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "nearby", values: { id: route.id, ...here } }) });
      const body = (await response.json()) as { items?: Nearby[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível procurar empresas perto.");
      setAdding((state) => state && { ...state, items: body.items ?? [], here });
    } catch (error) {
      setAdding((state) => state && { ...state, items: [], here, error: error instanceof Error ? error.message : "Não foi possível procurar empresas perto." });
    }
  }

  async function addVisit(route: VisitRoute, item: Nearby) {
    setAddingId(item.id);
    try {
      const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "replan", values: { id: route.id, ...adding?.here, add: { kind: item.kind, id: item.id } } }) });
      const body = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível acrescentar a visita.");
      await refresh();
      setAdding(null);
      notify(body.message ?? "Visita acrescentada.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível acrescentar a visita.");
    } finally {
      setAddingId(null);
    }
  }

  async function replan(route: VisitRoute) {
    setReplanning(true);
    try {
      const here = await position();
      const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "replan", values: { id: route.id, ...here } }) });
      const body = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível replanear.");
      await refresh();
      notify(body.message ?? "Rota replaneada.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível replanear.");
    } finally {
      setReplanning(false);
    }
  }

  async function remove(route: VisitRoute) {
    if (!(await confirm(`Apagar a rota "${route.name}" para toda a equipa?`, "Apagar"))) return;
    try {
      await command("route.delete", { id: route.id });
      if (activeRouteId === route.id) setActiveRouteId(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível apagar a rota.");
    }
  }

  async function changeOwner(route: VisitRoute, ownerId: string) {
    try { await command("route.owner", { id: route.id, version: route.version, ownerId }); }
    catch (error) { notify(error instanceof Error ? error.message : "Não foi possível mudar o responsável."); }
  }

  const cards = (list: VisitRoute[]) => list.map((route) => {
    const isExpanded = expanded === route.id;
    const progress = Math.min(route.currentIndex, route.stops.length);
    return <div key={route.id} className={`saved-route-card${isExpanded ? " is-expanded" : ""}${route.id === activeRouteId ? " is-active" : ""}`}>
      <button type="button" className="route-card-header" onClick={() => setExpandedRouteId(isExpanded ? null : route.id)}>
        <div>
          <strong>{route.name}</strong>
          <small>{shortDate(route.date)} · {memberName(route.ownerId)}</small>
        </div>
      </button>
      {isExpanded && <div className="route-card-sequence" aria-label={`Rota ${route.name}`}>
        <div className="route-card-line" />
        {route.stops.map((stop, index) => {
          const skipped = index < progress && route.visits.some((visit) => visit.stopId === stop.id && visit.skipped);
          return <div key={`${route.id}-${stop.id}`} className={`route-card-stop${index < progress ? " is-done" : ""}${skipped ? " is-skipped" : ""}${index === progress ? " is-current" : ""}${index >= progress ? " is-upcoming" : ""}`}>
            <span className={`route-card-dot${index === 0 ? " is-first" : ""}`} aria-hidden="true" />
            <span className="route-card-stop-name">{index >= progress && <small>{stop.arrival} · </small>}{stop.name}{skipped && <small> · saltada</small>}</span>
          </div>;
        })}
        <div className="route-card-actions">
          {canManage(route) && <SelectBox
            name="ownerId"
            label="Responsável"
            value={route.ownerId}
            onChange={(ownerId) => { if (ownerId !== route.ownerId) void changeOwner(route, ownerId); }}
            options={data.members.map((member) => ({ value: member.id, label: member.name, avatar: { id: member.id, name: member.name } }))}
          />}
          {canManage(route) && <button type="button" className="route-card-delete" aria-label={`Apagar a rota ${route.name}`} title="Apagar rota" onClick={() => void remove(route)}><Trash2 size={13}/></button>}
        </div>
        {progress < route.stops.length && <button type="button" className="route-board-start" onClick={() => { setActiveRouteId(route.id); closeCheck(); }}>
          <Play size={12}/> {progress ? "Continuar" : "Iniciar"}
        </button>}
      </div>}
    </div>;
  });

  return <div className="routes-page-layout routes-page-minimal">
    <aside className="routes-page-sidebar">
      <div className="saved-routes-panel" aria-label="Rotas guardadas e em curso">
        <div className="saved-routes-header"><strong>Rotas da equipa</strong></div>
        {activeRoute && currentStop && <>
          <div className="active-route-card">
            <div>
              <span>Próxima visita · {activeRoute.currentIndex + 1} de {activeRoute.stops.length}</span>
              <strong>{currentStop.name}</strong>
              <small>{currentStop.location}</small>
            </div>
            <div className="active-route-actions">
              <a className="route-navigate" href={`https://www.google.com/maps/dir/?api=1&destination=${currentStop.lat},${currentStop.lng}`} target="_blank" rel="noopener noreferrer">
                <Navigation size={12}/>Navegar
              </a>
              <button type="button" className="route-context-button" onClick={() => void requestApproach(currentStop)} disabled={approach.loading}>
                <Sparkles size={12}/>Contexto IA
              </button>
              {canVisit(activeRoute)
                ? <>
                    <button type="button" onClick={() => company ? setChecking(true) : notify("Esta visita é a um prospeto que ainda não está no CRM. Marca a rota no calendário ou adiciona a empresa ao CRM primeiro.")}>
                      <Check size={12}/>Registar visita
                    </button>
                    <button type="button" className="route-secondary" onClick={() => void skip(activeRoute, currentStop)}><SkipForward size={12}/>Saltar</button>
                    {activeRoute.stops.length - activeRoute.currentIndex > 1 && <button type="button" className="route-secondary" disabled={replanning} onClick={() => void replan(activeRoute)}>
                      <RefreshCw size={12}/>{replanning ? "A replanear…" : "Replanear daqui"}
                    </button>}
                    <button type="button" className="route-secondary" onClick={() => adding ? setAdding(null) : void openAdding(activeRoute)}>
                      <Plus size={12}/>Adicionar visita
                    </button>
                  </>
                : <small>Visitas registadas por {memberName(activeRoute.ownerId)}</small>}
            </div>
          </div>
          {adding && canVisit(activeRoute) && (() => {
            const search = adding.search.trim().toLocaleLowerCase("pt");
            const inRoute = new Set(activeRoute.stops.flatMap((stop) => [stop.id, stop.organizationId ?? ""]));
            const near = (adding.items ?? []).filter((item) => !search || item.name.toLocaleLowerCase("pt").includes(search));
            // Searching by name also finds CRM companies beyond the nearby radius.
            const further: Nearby[] = search.length >= 2
              ? data.organizations
                  .filter((company) => !company.archived && !inRoute.has(company.id) && company.name.toLocaleLowerCase("pt").includes(search) && !near.some((item) => item.id === company.id))
                  .slice(0, 10)
                  .map((company) => ({ kind: "crm", id: company.id, name: company.name, location: company.location ?? "", detail: stages[company.stage] }))
              : [];
            const list = [...near, ...further];
            return <div className="route-add-panel" aria-label="Acrescentar uma visita à rota">
              <header><strong>Acrescentar visita</strong><small>{adding.here ? "Perto de onde estás" : "Perto da última visita"} · a rota é replaneada a partir de agora</small></header>
              <input value={adding.search} onChange={(event) => setAdding({ ...adding, search: event.target.value })} placeholder="Procurar empresa…" aria-label="Procurar empresa para acrescentar"/>
              {adding.error && <p className="form-error">{adding.error}</p>}
              {adding.items === null
                ? <p className="route-add-empty">A procurar empresas perto…</p>
                : list.length === 0
                  ? <p className="route-add-empty">{search ? "Nenhuma empresa com esse nome." : "Sem empresas a menos de 25 km."}</p>
                  : <ul>{list.map((item) => <li key={`${item.kind}:${item.id}`}>
                      <span><strong>{item.name}</strong><small>{[item.km !== undefined ? `${item.km.toLocaleString("pt-PT")} km` : "", item.location, item.kind === "prospect" ? `Prospeto · ${item.detail}` : item.detail].filter(Boolean).join(" · ")}</small></span>
                      <button type="button" disabled={!!addingId} onClick={() => void addVisit(activeRoute, item)}>{addingId === item.id ? "A acrescentar…" : "Adicionar"}</button>
                    </li>)}</ul>}
            </div>;
          })()}
          {approach.panel(currentStop.id)}
        </>}
        <div className="route-list-groups">
          <div className="route-list-group">
            <h4>Por fazer</h4>
            {open.length ? cards(open) : <p>Sem rotas por fazer.</p>}
          </div>
          <div className="route-list-group">
            <h4>Concluídas</h4>
            {done.length ? cards(done) : <p>Sem rotas concluídas.</p>}
          </div>
        </div>
        {checking && activeRoute && currentStop && company && <div className="route-check-dialog" role="dialog" aria-label="Registar visita da rota">
          <strong>{currentStop.name}</strong>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Resumo breve da visita e próximos passos…" />
          <SelectBox
            name="stage"
            label="Estado da empresa"
            value={stage}
            onChange={(value) => setStage(value as Stage | "")}
            options={[
              // No default: the stage has to be chosen for every visit.
              { value: "", label: "Escolhe o estado…" },
              ...Object.entries(stages).map(([key, label]) => ({ value: key, label: `${label}${key === company.stage ? " (atual)" : ""}`, dotClass: `crm-dot crm-stage-${key}` })),
            ]}
          />
          <label>
            Próximo passo <small>(opcional)</small>
            <input value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder={company.nextStep || "ex.: enviar proposta"}/>
          </label>
          <label>
            Follow-up <small>(opcional)</small>
            <input type="date" value={followUpOn} onChange={(event) => setFollowUpOn(event.target.value)}/>
          </label>
          <div className="route-check-actions">
            <button type="button" className="route-switch-button" onClick={closeCheck}>Cancelar</button>
            <button type="button" className="route-primary" disabled={saving || !note.trim() || !stage} onClick={() => void saveVisit()}>{saving ? "A guardar…" : "Guardar visita"}</button>
          </div>
        </div>}
      </div>
    </aside>
  </div>;
}
