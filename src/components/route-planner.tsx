"use client";
import { useEffect, useRef, useState } from "react";
import type { Feature } from "geojson";
import type { GeoJSONSource, Map as MapLibre, MapMouseEvent, Marker } from "maplibre-gl";
import { CalendarPlus, ExternalLink, Route, Save, Sparkles, X } from "lucide-react";
import { caeGroups, vougaBase, type CaeGroup } from "@/domain/prospects";
import { haversineKm, type RouteStop } from "@/domain/routing";
import { addDays, dateKey, shortDate } from "@/domain/time";
import { useWorkspace } from "./context";
import { highlightProspects, hitsProspect } from "./prospect-layer";

type Plan = {
  stops: RouteStop[]; returnAt?: string; driveMinutes?: number; km?: number; lunchAt?: string; left?: number; considered: number;
  geometry?: [number, number][]; googleMaps?: string; provider?: string; warning?: string; message?: string; estimated?: boolean;
  unknownSector?: number; sectors?: string[]; overtime?: number;
  alternatives?: { id: string; name: string; location: string; lat: number; lng: number; kind: "crm" | "prospect" }[];
  suggestions?: { remove: string; removeName: string; add: string; addName: string; saves: number; lat: number; lng: number; kind: "crm" | "prospect"; location: string }[];
};
const tomorrow = () => addDays(dateKey(), 1);
// MapLibre paints with literal colours, so the layers read the design tokens.
const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const circle = (lat: number, lng: number, km: number): [number, number][] =>
  Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)];
  });

export function RoutePlanner({ map, lib, sectors, onClose, onSaveRoute, pickRef }: {
  map: MapLibre; lib: typeof import("maplibre-gl"); sectors: CaeGroup[]; onClose: () => void;
  onSaveRoute?: (route: { name: string; date: string; stops: RouteStop[] }) => void;
  /** Set by the planner: the map's company and prospect markers offer their id here first; true means it was used. */
  pickRef?: React.RefObject<((id: string) => boolean) | null>;
}) {
  const { notify, refresh } = useWorkspace();
  const [center, setCenter] = useState(() => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; });
  const [form, setForm] = useState({ date: tomorrow(), start: "09:00", end: "18:30", count: 6, radiusKm: 20, visitMinutes: 25, lunch: true, crm: true, prospects: true });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const markers = useRef<Marker[]>([]);
  // Map markers call the latest swap, which is declared further down and changes every render.
  const swapLatest = useRef<(out: string, inn: string) => void>(() => {});
  // A plan computed for other sectors is no longer valid.
  const sectorKey = sectors.join(",");
  const [planSectors, setPlanSectors] = useState(sectorKey);
  if (planSectors !== sectorKey) { setPlanSectors(sectorKey); setPlan(null); }

  // Clicking the map moves the centre of the area.
  useEffect(() => {
    const pick = (event: MapMouseEvent) => {
      // A click on a prospect is handled by the prospect layer (open it, or swap it into the route).
      if (hitsProspect(map, event)) return;
      const hit = plan?.stops.find((stop) => haversineKm({ lat: event.lngLat.lat, lng: event.lngLat.lng }, stop) < 0.15);
      if (hit) {
        setSelectedStopId(hit.id);
        return;
      }
      setSelectedStopId(null);
      setCenter({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      setPlan(null);
    };
    map.on("click", pick);
    map.getCanvas().style.cursor = "crosshair";
    return () => { map.off("click", pick); map.getCanvas().style.cursor = ""; };
  }, [map, plan]);

  // Area circle, route line and numbered stops.
  useEffect(() => {
    const area = { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [circle(center.lat, center.lng, form.radiusKm)] } };
    const path = plan?.stops.length
      ? plan.geometry ?? [[vougaBase.lng, vougaBase.lat], ...plan.stops.map((s) => [s.lng, s.lat] as [number, number]), [vougaBase.lng, vougaBase.lat]]
      : [];
    const line = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: path } };
    const set = (id: string, data: Feature) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(data); else map.addSource(id, { type: "geojson", data });
    };
    set("route-area", area);
    set("route-line", line);
    const areaColor = token("--map-prospect", "#8fa5f7"), coral = token("--vouga-coral", "#f26b4a");
    if (!map.getLayer("route-area-fill")) map.addLayer({ id: "route-area-fill", type: "fill", source: "route-area", paint: { "fill-color": areaColor, "fill-opacity": 0.06 } });
    if (!map.getLayer("route-area-edge")) map.addLayer({ id: "route-area-edge", type: "line", source: "route-area", paint: { "line-color": areaColor, "line-opacity": 0.5, "line-dasharray": [2, 2] } });
    if (!map.getLayer("route-line")) map.addLayer({ id: "route-line", type: "line", source: "route-line", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": coral, "line-width": 3, "line-opacity": 0.9 } });
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const badge = (text: string, className: string) => { const el = document.createElement("span"); el.className = className; el.textContent = text; return el; };
    markers.current.push(new lib.Marker({ element: badge("V", "route-base") }).setLngLat([vougaBase.lng, vougaBase.lat]).addTo(map));
    plan?.stops.forEach((stop, index) => {
      const selected = selectedStopId === stop.id;
      const marker = new lib.Marker({ element: badge(String(index + 1), selected ? "route-stop route-stop-selected-marker" : "route-stop") })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      // The map's own click would select the stop again by distance, so a second click could never unselect it.
      marker.getElement().addEventListener("click", (event) => { event.stopPropagation(); setSelectedStopId((current) => current === stop.id ? null : stop.id); });
      markers.current.push(marker);
    });
    if (selectedStopId) {
      const swaps = plan?.suggestions?.filter((item) => item.remove === selectedStopId) ?? [];
      swaps.forEach((swapItem) => {
        const ring = document.createElement("button");
        ring.type = "button";
        ring.className = "route-swap-marker";
        ring.title = `${swapItem.addName} · ${swapItem.saves > 0 ? "ganha" : "perde"} ${Math.abs(swapItem.saves)} min`;
        ring.addEventListener("click", (event) => { event.stopPropagation(); swapLatest.current(swapItem.remove, swapItem.add); });
        const marker = new lib.Marker({ element: ring }).setLngLat([swapItem.lng, swapItem.lat]).addTo(map);
        markers.current.push(marker);
      });
    }
  }, [map, lib, center, form.radiusKm, plan, selectedStopId, busy]);

  // Remove everything this planner drew when it closes.
  useEffect(() => () => {
    markers.current.forEach((m) => m.remove());
    try {
      for (const id of ["route-line", "route-area-edge", "route-area-fill"]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ["route-line", "route-area"]) if (map.getSource(id)) map.removeSource(id);
    } catch { /* the map itself is being removed */ }
  }, [map]);

  async function call(action: "plan" | "schedule", values: unknown) {
    const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, values }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Pedido falhou.");
    return body;
  }
  // The user's adjustments: companies kept in the route and companies taken out of it.
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  async function calculate(next: { include?: string[]; exclude?: string[] } = {}) {
    if (!sectors.length) { setError("Seleciona pelo menos um setor por baixo do mapa."); return; }
    const inc = next.include ?? include, exc = next.exclude ?? exclude;
    setInclude(inc); setExclude(exc);
    setSelectedStopId(null);
    setBusy(true); setError("");
    try {
      const result = (await call("plan", { ...form, center, sectors, include: inc, exclude: exc })) as Plan;
      setPlan(result);
      if (result.stops.length && !inc.length) {
        const bounds = new lib.LngLatBounds([vougaBase.lng, vougaBase.lat], [vougaBase.lng, vougaBase.lat]);
        result.stops.forEach((s) => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 400 });
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível planear."); }
    finally { setBusy(false); }
  }
  const kept = () => plan?.stops.map((s) => s.id) ?? [];
  const suggestionsForSelected = selectedStopId ? (plan?.suggestions ?? []).filter((item) => item.remove === selectedStopId) : [];
  // x on a stop: the others stay, that one leaves, and the planner fills the gap.
  const remove = (id: string) => void calculate({ include: kept().filter((x) => x !== id), exclude: [...exclude, id] });
  // Choosing a company for a stop: it replaces that stop.
  const swap = (out: string, inn: string) => void calculate({ include: [...kept().filter((x) => x !== out), inn], exclude: [...exclude.filter((x) => x !== inn), out] });
  useEffect(() => { swapLatest.current = swap; });
  // With a stop selected, clicking any company or prospect on the map puts it in that stop's place.
  useEffect(() => {
    if (!pickRef) return;
    pickRef.current = (id) => {
      if (!selectedStopId) return false;
      if (busy) return true;
      if (id === selectedStopId) setSelectedStopId(null);
      else if (plan?.stops.some((stop) => stop.id === id)) setSelectedStopId(id);
      else swap(selectedStopId, id);
      return true;
    };
    return () => { pickRef.current = null; };
  });
  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle("is-route-picking", !!selectedStopId);
    highlightProspects(map, !!selectedStopId);
    return () => { container.classList.remove("is-route-picking"); highlightProspects(map, false); };
  }, [map, selectedStopId]);
  const fresh = () => void calculate({ include: [], exclude: [] });
  // One key per plan: a repeated click, or a retry after a lost response, does not mark the visits twice.
  const scheduleKey = useRef<{ plan: Plan; key: string } | null>(null);
  async function scheduleVisits() {
    if (!plan?.stops.length) return;
    if (scheduleKey.current?.plan !== plan) scheduleKey.current = { plan, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const result = await call("schedule", { key: scheduleKey.current.key, date: form.date, stops: plan.stops });
      notify(result.message);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível marcar as visitas."); }
    finally { setBusy(false); }
  }
  function saveRoute() {
    if (!plan?.stops.length || !onSaveRoute) return;
    onSaveRoute({
      name: `Rota · ${shortDate(form.date)}`,
      date: form.date,
      stops: plan.stops,
    });
  }
  const field = <K extends keyof typeof form>(key: K) => ({
    value: form[key] as string | number,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => { setPlan(null); setForm({ ...form, [key]: event.target.type === "number" ? Number(event.target.value) : event.target.value }); },
  });
  const toggle = (key: "lunch" | "crm" | "prospects") => (event: React.ChangeEvent<HTMLInputElement>) => { setPlan(null); setForm({ ...form, [key]: event.target.checked }); };
  const sectorText = sectors.length === Object.keys(caeGroups).length ? "todos os setores" : sectors.map((s) => caeGroups[s].replace(/ \(CAE \d+\)/, "")).join(", ");

  return <aside className="route-planner" aria-label="Planear visitas">
    <header><strong><Route size={15}/>Planear visitas</strong><button type="button" aria-label="Fechar planeador" onClick={onClose}><X size={15}/></button></header>
    <div className="route-grid">
      <label>Dia<input type="date" {...field("date")}/></label>
      <label>Visitas<input type="number" min={1} max={12} {...field("count")}/></label>
      <label>Início<input type="time" {...field("start")}/></label>
      <label>Regresso<input type="time" {...field("end")}/></label>
    </div>
    <details className="route-more">
      <summary>Mais opções · raio {form.radiusKm} km · {form.visitMinutes} min/visita</summary>
      <div className="route-grid">
        <label>Raio (km)<input type="number" min={2} max={80} {...field("radiusKm")}/></label>
        <label>Min. por visita<input type="number" min={15} max={180} step={5} {...field("visitMinutes")}/></label>
      </div>
      <div className="route-checks">
        <label><input type="checkbox" checked={form.lunch} onChange={toggle("lunch")}/>Pausa de almoço</label>
        <label><input type="checkbox" checked={form.crm} onChange={toggle("crm")}/>Empresas New do CRM</label>
        <label><input type="checkbox" checked={form.prospects} onChange={toggle("prospects")}/>Prospetos</label>
      </div>
    </details>
    <p className="route-hint">Clica no mapa para mudar o centro · {sectorText}</p>
    <button type="button" className="route-primary" disabled={busy} onClick={fresh}>{busy ? "A calcular…" : plan ? "Recalcular do zero" : "Calcular roteiro"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {plan && (plan.stops.length === 0
      ? <p className="route-hint">{plan.message ?? "Não há empresas elegíveis nesta área."}</p>
      : <div className="route-result">
          <p className="route-summary">{plan.stops.length} visitas · {plan.km} km · regresso às {plan.returnAt}{plan.overtime ? <span className="route-late"> (+{plan.overtime} min)</span> : null}</p>
          <ol>{plan.stops.map((stop) => <li key={stop.id} className={selectedStopId === stop.id ? "route-stop-selected" : ""} onClick={() => setSelectedStopId((current) => current === stop.id ? null : stop.id)}>
            <span className="route-time">{stop.arrival}</span>
            <span className="route-name"><strong>{stop.name}</strong><small>{stop.location}</small></span>
            <span className="route-stop-actions">
              <button type="button" aria-label={`Tirar ${stop.name}`} title="Tirar da rota" disabled={busy} onClick={() => remove(stop.id)}><X size={13}/></button>
            </span>
          </li>)}</ol>
          {selectedStopId && <div className="route-suggestions">
            <p><Sparkles size={13}/>Sugestão para a paragem selecionada</p>
            <small className="route-pick-hint">Ou clica numa empresa no mapa para a pôr no lugar desta paragem.</small>
            {suggestionsForSelected.length ? suggestionsForSelected.map((sg) => (
              <div key={`${sg.remove}>${sg.add}`} className="route-suggestion-confirm">
                <button type="button" disabled={busy} onClick={() => swap(sg.remove, sg.add)}>
                  <span>Trocar <b>{sg.removeName}</b> por <b>{sg.addName}</b></span>
                  <em>{sg.saves > 0 ? `ganha ${sg.saves} min` : `perde ${Math.abs(sg.saves)} min`}</em>
                </button>
                <small>Estimativa: a viagem fica {sg.saves > 0 ? `mais curta em ${sg.saves} minutos` : `mais longa em ${Math.abs(sg.saves)} minutos`}.</small>
              </div>
            )) : <div className="route-suggestion-confirm">
              <small>Sem melhoria clara para esta paragem. Tenta escolher outra ou manter o percurso atual.</small>
            </div>}
          </div>}
          {!selectedStopId && !!plan.suggestions?.length && <div className="route-suggestions">
            <p><Sparkles size={13}/>Melhorias do percurso</p>
            {plan.suggestions.map((sg) => <button key={`${sg.remove}>${sg.add}`} type="button" disabled={busy} onClick={() => swap(sg.remove, sg.add)}><span>Trocar <b>{sg.removeName}</b> por <b>{sg.addName}</b></span><em>−{sg.saves} min</em></button>)}
          </div>}
          {plan.warning && <p className="route-warning">{plan.warning}</p>}
          <div className="route-actions">
            {plan.googleMaps && <a href={plan.googleMaps} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>Google Maps</a>}
            {onSaveRoute && <button type="button" disabled={busy} onClick={saveRoute}><Save size={13}/>Guardar rota</button>}
            <button type="button" disabled={busy} onClick={() => void scheduleVisits()}><CalendarPlus size={13}/>Marcar no calendário</button>
          </div>
        </div>)}
  </aside>;
}
