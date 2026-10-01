"use client";
import { useEffect, useRef, useState } from "react";
import type { Feature } from "geojson";
import type { GeoJSONSource, Map as MapLibre, MapMouseEvent, Marker } from "maplibre-gl";
import { CalendarPlus, ExternalLink, Route, X } from "lucide-react";
import { caeGroups, vougaBase, type CaeGroup } from "@/domain/prospects";
import type { RouteStop } from "@/domain/routing";
import { useWorkspace } from "./context";

type Plan = {
  stops: RouteStop[]; returnAt?: string; driveMinutes?: number; km?: number; lunchAt?: string; left?: number; considered: number;
  geometry?: [number, number][]; googleMaps?: string; provider?: string; warning?: string; message?: string; estimated?: boolean;
  unknownSector?: number; sectors?: string[];
};
const tomorrow = () => { const d = new Date(Date.now() + 86_400_000); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }); };
const circle = (lat: number, lng: number, km: number): [number, number][] =>
  Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)];
  });

export function RoutePlanner({ map, lib, sectors, onClose }: { map: MapLibre; lib: typeof import("maplibre-gl"); sectors: CaeGroup[]; onClose: () => void }) {
  const { notify, refresh } = useWorkspace();
  const [center, setCenter] = useState(() => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; });
  const [form, setForm] = useState({ date: tomorrow(), start: "09:00", end: "18:30", count: 6, radiusKm: 20, visitMinutes: 45, lunch: true, crm: true, prospects: true });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const markers = useRef<Marker[]>([]);
  // A plan computed for other sectors is no longer valid.
  const sectorKey = sectors.join(",");
  const [planSectors, setPlanSectors] = useState(sectorKey);
  if (planSectors !== sectorKey) { setPlanSectors(sectorKey); setPlan(null); }

  // Clicking the map moves the centre of the area.
  useEffect(() => {
    const pick = (event: MapMouseEvent) => { setCenter({ lat: event.lngLat.lat, lng: event.lngLat.lng }); setPlan(null); };
    map.on("click", pick);
    map.getCanvas().style.cursor = "crosshair";
    return () => { map.off("click", pick); map.getCanvas().style.cursor = ""; };
  }, [map]);

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
    if (!map.getLayer("route-area-fill")) map.addLayer({ id: "route-area-fill", type: "fill", source: "route-area", paint: { "fill-color": "#8fa5f7", "fill-opacity": 0.06 } });
    if (!map.getLayer("route-area-edge")) map.addLayer({ id: "route-area-edge", type: "line", source: "route-area", paint: { "line-color": "#8fa5f7", "line-opacity": 0.5, "line-dasharray": [2, 2] } });
    if (!map.getLayer("route-line")) map.addLayer({ id: "route-line", type: "line", source: "route-line", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#f26b4a", "line-width": 3, "line-opacity": 0.9 } });
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const badge = (text: string, className: string) => { const el = document.createElement("span"); el.className = className; el.textContent = text; return el; };
    markers.current.push(new lib.Marker({ element: badge("V", "route-base") }).setLngLat([vougaBase.lng, vougaBase.lat]).addTo(map));
    plan?.stops.forEach((stop, index) => markers.current.push(new lib.Marker({ element: badge(String(index + 1), "route-stop") }).setLngLat([stop.lng, stop.lat]).addTo(map)));
  }, [map, lib, center, form.radiusKm, plan]);

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
  async function calculate() {
    if (!sectors.length) { setError("Seleciona pelo menos um setor por baixo do mapa."); return; }
    setBusy(true); setError("");
    try {
      const result = (await call("plan", { ...form, center, sectors })) as Plan;
      setPlan(result);
      if (result.stops.length) {
        const bounds = new lib.LngLatBounds([vougaBase.lng, vougaBase.lat], [vougaBase.lng, vougaBase.lat]);
        result.stops.forEach((s) => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 400 });
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível planear."); }
    finally { setBusy(false); }
  }
  async function scheduleVisits() {
    if (!plan?.stops.length) return;
    setBusy(true); setError("");
    try {
      const result = await call("schedule", { date: form.date, stops: plan.stops });
      notify(result.message);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível marcar as visitas."); }
    finally { setBusy(false); }
  }
  const field = <K extends keyof typeof form>(key: K) => ({
    value: form[key] as string | number,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => { setPlan(null); setForm({ ...form, [key]: event.target.type === "number" || event.target.type === "range" ? Number(event.target.value) : event.target.value }); },
  });

  return <aside className="route-planner" aria-label="Planear visitas">
    <header><strong><Route size={15}/>Planear visitas</strong><button type="button" aria-label="Fechar planeador" onClick={onClose}><X size={15}/></button></header>
    <p className="route-hint">Clica no mapa para escolher o centro da área. Partida e chegada: {vougaBase.name}.</p>
    <div className="route-grid">
      <label>Dia<input type="date" {...field("date")}/></label>
      <label>Visitas<input type="number" min={1} max={12} {...field("count")}/></label>
      <label>Início<input type="time" {...field("start")}/></label>
      <label>Regresso até<input type="time" {...field("end")}/></label>
      <label>Raio (km)<input type="number" min={2} max={80} {...field("radiusKm")}/></label>
      <label>Min. por visita<input type="number" min={15} max={180} step={5} {...field("visitMinutes")}/></label>
    </div>
    <div className="route-checks">
      <label><input type="checkbox" checked={form.lunch} onChange={(e) => setForm({ ...form, lunch: e.target.checked })}/>Pausa de almoço</label>
      <label><input type="checkbox" checked={form.crm} onChange={(e) => setForm({ ...form, crm: e.target.checked })}/>Empresas New do CRM</label>
      <label><input type="checkbox" checked={form.prospects} onChange={(e) => setForm({ ...form, prospects: e.target.checked })}/>Prospetos</label>
    </div>
    <p className="route-hint">Setores: {sectors.length === Object.keys(caeGroups).length ? "todos os setores prioritários" : sectors.map((s) => caeGroups[s].replace(/ \(CAE \d+\)/, "")).join(", ") || "nenhum selecionado"} (escolhe-os nos filtros por baixo do mapa).</p>
    <button type="button" className="route-primary" disabled={busy} onClick={() => void calculate()}>{busy ? "A calcular…" : "Calcular roteiro"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {plan && (plan.stops.length === 0
      ? <p className="route-hint">{plan.message ?? "Nenhuma visita cabe no horário com estes filtros."}</p>
      : <div className="route-result">
          <p className="route-summary">{plan.stops.length} visitas · {plan.km} km · {Math.floor((plan.driveMinutes ?? 0) / 60)}h{String((plan.driveMinutes ?? 0) % 60).padStart(2, "0")} de condução · regresso às {plan.returnAt}</p>
          {plan.warning && <p className="route-warning">{plan.warning}</p>}
          <ol>{plan.stops.map((stop) => <li key={stop.id}><span className="route-time">{stop.arrival}–{stop.departure}</span><strong>{stop.name}</strong><small>{stop.location} · {stop.driveMinutes} min de viagem · {stop.reasons.join(" · ")}</small></li>)}</ol>
          {plan.lunchAt && <p className="route-hint">Almoço por volta das {plan.lunchAt}.</p>}
          <p className="route-hint">Escolhidas entre {plan.considered} empresas elegíveis{plan.left ? `; ${plan.left} ficaram de fora por não caberem no dia ou no número de visitas` : ""}.{plan.unknownSector ? ` ${plan.unknownSector} empresas New do CRM não entraram por não terem setor reconhecido (acrescenta o CAE nas notas).` : ""}</p>
          <div className="route-actions">
            {plan.googleMaps && <a href={plan.googleMaps} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>Abrir no Google Maps</a>}
            <button type="button" disabled={busy} onClick={() => void scheduleVisits()}><CalendarPlus size={13}/>Marcar no calendário</button>
          </div>
          {plan.stops.length > 9 && <p className="route-hint">O Google Maps só aceita 9 paragens por link; as restantes seguem pela lista.</p>}
        </div>)}
  </aside>;
}
