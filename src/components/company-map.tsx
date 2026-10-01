"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibre, Marker, Popup } from "maplibre-gl";
import { ExternalLink, Plus, Route, X } from "lucide-react";
import { siteKinds, stages, type Organization } from "@/domain/model";
import { locateMunicipality, placeCompanies } from "@/domain/municipalities";
import { caeGroups, type CaeGroup, type Prospect } from "@/domain/prospects";
import { useWorkspace } from "./context";
import { FinancialSummary } from "./financials";
import { RoutePlanner } from "./route-planner";

// OpenFreeMap: vector tiles from OpenStreetMap, no key or usage limits, commercial use allowed.
const styles = { dark: "https://tiles.openfreemap.org/styles/dark", light: "https://tiles.openfreemap.org/styles/positron" };
const portugal: [number, number] = [-8.0, 39.6];
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const allGroups = Object.keys(caeGroups) as CaeGroup[];

// Nudge the dark style towards the Vouga navy of the Living Docs, keeping roads and labels as they are.
function tint(map: MapLibre) {
  const set = (id: string, property: string, value: string) => { if (map.getLayer(id)) map.setPaintProperty(id, property, value); };
  set("background", "background-color", "#0b1020");
  set("water", "fill-color", "#0a1733");
  for (const layer of map.getStyle().layers ?? [])
    if (layer.type === "fill" && /^(landcover|landuse|park)/.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#0f1627");
}

type Mode = "crm" | "prospect";

export function CompanyMap({ companies, onSelect }: { companies: Organization[]; onSelect: (id: string) => void }) {
  const { command, notify } = useWorkspace();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  const extras = useRef<Marker[]>([]);
  const hover = useRef<Popup | null>(null);
  const select = useRef(onSelect);
  const [loaded, setLoaded] = useState<{ map: MapLibre; lib: typeof import("maplibre-gl") } | null>(null);
  const ready = !!loaded;
  const [mode, setMode] = useState<Mode>("crm");
  const [groups, setGroups] = useState<CaeGroup[]>(allGroups);
  const [hideUnconfirmed, setHideUnconfirmed] = useState(false);
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [prospectNote, setProspectNote] = useState("");
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);
  useEffect(() => { select.current = onSelect; }, [onSelect]);

  const visibleCompanies = mode === "prospect" ? companies.filter((company) => company.stage === "new") : companies;
  const showProspect = (prospect: Prospect) => groups.includes(prospect.group) && !(hideUnconfirmed && prospect.check?.status === "a-confirmar");
  const visibleProspects = mode === "prospect" ? (prospects ?? []).filter(showProspect) : [];
  const unconfirmed = (prospects ?? []).filter((prospect) => groups.includes(prospect.group) && prospect.check?.status === "a-confirmar").length;
  const { placed, unplaced } = placeCompanies(visibleCompanies);

  // Map instance: created once.
  useEffect(() => {
    let cancelled = false;
    const light = document.documentElement.dataset.theme === "light";
    void import("maplibre-gl").then((module) => {
      if (cancelled || !element.current || map.current) return;
      lib.current = module;
      const instance = new module.Map({ container: element.current, style: light ? styles.light : styles.dark, center: portugal, zoom: 6, attributionControl: { compact: true } });
      map.current = instance;
      instance.addControl(new module.NavigationControl({ showCompass: false }), "top-left");
      const scale = () => element.current?.classList.toggle("is-far", instance.getZoom() < 9);
      instance.on("zoom", scale);
      // Pressing the mouse wheel and dragging moves the map (MapLibre only drags with the left button, and
      // Windows would otherwise start page auto-scroll).
      const surface = instance.getCanvasContainer();
      let last: { x: number; y: number } | null = null;
      const press = (event: MouseEvent) => {
        if (event.button !== 1) return;
        event.preventDefault();
        last = { x: event.clientX, y: event.clientY };
        surface.style.cursor = "grabbing";
      };
      const move = (event: MouseEvent) => {
        if (!last) return;
        instance.panBy([last.x - event.clientX, last.y - event.clientY], { duration: 0 });
        last = { x: event.clientX, y: event.clientY };
      };
      const release = (event: MouseEvent) => {
        if (event.button !== 1 || !last) return;
        last = null;
        surface.style.cursor = "";
      };
      const noAutoScroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
      surface.addEventListener("mousedown", press);
      surface.addEventListener("auxclick", noAutoScroll);
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", release);
      instance.once("remove", () => {
        surface.removeEventListener("mousedown", press);
        surface.removeEventListener("auxclick", noAutoScroll);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", release);
      });
      instance.on("load", () => { if (!light) tint(instance); scale(); setLoaded({ map: instance, lib: module }); });
    });
    return () => {
      cancelled = true;
      hover.current?.remove();
      [...markers.current, ...extras.current].forEach((marker) => marker.remove());
      markers.current = [];
      extras.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Prospects are loaded the first time the prospect mode is opened.
  useEffect(() => {
    if (mode !== "prospect" || prospects) return;
    let cancelled = false;
    void fetch("/api/prospects", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { items?: Prospect[]; missing?: boolean; error?: string }) => {
        if (cancelled) return;
        setProspects(body.items ?? []);
        setProspectNote(body.missing ? "Ainda não há base de prospeção. Corre bun run prospects:sync (OpenStreetMap) ou importa um CSV." : body.error ?? "");
      })
      .catch(() => { if (!cancelled) { setProspects([]); setProspectNote("Não foi possível carregar os prospetos."); } });
    return () => { cancelled = true; };
  }, [mode, prospects]);

  // Markers: rebuilt when the data, the mode or the filters change; the view is fitted when the mode changes.
  const signature = `${mode}|${groups.join(",")}|${hideUnconfirmed}|${prospects?.length ?? -1}|` + visibleCompanies.map((company) => `${company.id}:${company.version}:${company.stage}:${company.location ?? ""}:${company.coordinates?.lat ?? ""}:${company.pinned ? 1 : 0}`).join("|");
  const fittedMode = useRef<string>("");
  useEffect(() => {
    const current = map.current;
    const maplibre = lib.current;
    if (!ready || !current || !maplibre) return;
    hover.current?.remove();
    [...markers.current, ...extras.current].forEach((marker) => marker.remove());
    markers.current = [];
    extras.current = [];
    const tooltip = (lng: number, lat: number, html: string, offset: [number, number]) => {
      hover.current?.remove();
      hover.current = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset, className: "company-map-tooltip" }).setLngLat([lng, lat]).setHTML(html).addTo(current);
    };
    const bounds = new maplibre.LngLatBounds();
    for (const { company, lat, lng, dx, dy, precise } of placeCompanies(visibleCompanies).placed) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "company-map-pin-wrapper";
      node.setAttribute("aria-label", `${company.name}, ${company.location ?? ""}, ${stages[company.stage]}`);
      node.innerHTML = `<span class="company-map-pin crm-stage-${company.stage}${company.pinned ? " is-pinned" : ""}"></span>`;
      const where = precise && company.address ? company.address : company.location ?? "";
      const kind = company.siteKind ? `${siteKinds[company.siteKind]} · ` : "";
      node.addEventListener("mouseenter", () => {
        tooltip(lng, lat, `<strong>${escape(company.name)}</strong><br>${escape(kind + where)} · ${stages[company.stage]}`, [dx, dy - 24]);
        // Other facilities of this company appear while hovering.
        for (const site of company.sites ?? []) {
          const spot = site.coordinates ?? locateMunicipality(site.location);
          if (!spot) continue;
          const mark = document.createElement("span");
          mark.className = "company-map-site";
          mark.title = `${siteKinds[site.kind]}: ${site.address}`;
          mark.textContent = siteKinds[site.kind].slice(0, 1);
          extras.current.push(new maplibre.Marker({ element: mark }).setLngLat([spot.lng, spot.lat]).addTo(current));
        }
      });
      node.addEventListener("mouseleave", () => {
        hover.current?.remove();
        hover.current = null;
        extras.current.forEach((marker) => marker.remove());
        extras.current = [];
      });
      node.addEventListener("click", (event) => { event.stopPropagation(); select.current(company.id); });
      markers.current.push(new maplibre.Marker({ element: node, anchor: "bottom", offset: [dx, dy] }).setLngLat([lng, lat]).addTo(current));
      bounds.extend([lng, lat]);
    }
    for (const prospect of mode === "prospect" ? (prospects ?? []).filter(showProspect) : []) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `company-map-prospect${prospect.check?.status === "a-confirmar" ? " is-unconfirmed" : ""}`;
      node.setAttribute("aria-label", `Prospeto: ${prospect.name}, ${prospect.location}`);
      node.addEventListener("mouseenter", () => tooltip(prospect.lng, prospect.lat, `<strong>${escape(prospect.name)}</strong><br>${escape(caeGroups[prospect.group])} · ${escape(prospect.location)}`, [0, -10]));
      node.addEventListener("mouseleave", () => { hover.current?.remove(); hover.current = null; });
      node.addEventListener("click", (event) => { event.stopPropagation(); setSelected(prospect); });
      markers.current.push(new maplibre.Marker({ element: node }).setLngLat([prospect.lng, prospect.lat]).addTo(current));
      bounds.extend([prospect.lng, prospect.lat]);
    }
    const fitKey = `${mode}|${prospects ? "loaded" : ""}`;
    if (fittedMode.current !== fitKey && !bounds.isEmpty()) {
      current.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
      fittedMode.current = fitKey;
    }
    // The signature captures every field the markers depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  async function addToCrm(prospect: Prospect) {
    setAdding(true);
    const origin = [
      `Origem: prospeção (${prospect.source === "osm" ? "OpenStreetMap" : "lista importada"}).`,
      `Setor: ${caeGroups[prospect.group]}${prospect.category ? ` · ${prospect.category}` : ""}${prospect.cae ? ` · CAE ${prospect.cae}` : ""}`,
      prospect.website ? `Website: ${prospect.website}` : "",
      prospect.email ? `Email: ${prospect.email}` : "",
    ].filter(Boolean).join("\n");
    try {
      await command("organization.save", {
        name: prospect.name, stage: "new", location: prospect.location, address: prospect.address,
        coordinates: { lat: prospect.lat, lng: prospect.lng }, phone: prospect.phone ?? "",
        ...(prospect.nif ? { nif: prospect.nif } : {}), ...(prospect.financials ? { financials: prospect.financials } : {}), initialNote: origin,
      });
      setProspects((items) => items?.filter((item) => item.id !== prospect.id) ?? null);
      setSelected(null);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Não foi possível adicionar a empresa.");
    } finally {
      setAdding(false);
    }
  }

  const toggleGroup = (group: CaeGroup) => setGroups((current) => current.includes(group) ? current.filter((g) => g !== group) : [...current, group]);
  return <div className="company-map-view">
    <div className="company-map-frame">
      <div className="company-map" ref={element} role="region" aria-label={mode === "prospect" ? `Mapa de prospeção com ${visibleProspects.length} prospetos` : `Mapa com ${placed.length} empresas`}/>
      {planning && loaded && <RoutePlanner map={loaded.map} lib={loaded.lib} sectors={groups} onClose={() => setPlanning(false)}/>}
      {selected && !planning && <div className="prospect-card" role="dialog" aria-label={selected.name}>
        <header><strong>{selected.name}</strong><button type="button" aria-label="Fechar" onClick={() => setSelected(null)}><X size={15}/></button></header>
        <p className="prospect-card-group">{caeGroups[selected.group]}{selected.category ? ` · ${selected.category}` : ""}</p>
        <dl>
          <div><dt>Localização</dt><dd>{[selected.address, selected.parish && !selected.address.includes(selected.parish) ? selected.parish : "", selected.location].filter(Boolean).join(" · ")}</dd></div>
          {selected.phone && <div><dt>Telefone</dt><dd>{selected.phone}</dd></div>}
          {selected.website && <div><dt>Site</dt><dd><a href={/^https?:/.test(selected.website) ? selected.website : `https://${selected.website}`} target="_blank" rel="noopener noreferrer">{selected.website.replace(/^https?:\/\//, "")}<ExternalLink size={11}/></a></dd></div>}
          {selected.nif && <div><dt>NIF</dt><dd>{selected.nif}</dd></div>}
        </dl>
        {selected.check && <div className={`location-check check-${selected.check.status}`}>
          <strong>{{ verificado: "Localização verificada", provavel: "Localização provável", "a-confirmar": "Localização a confirmar" }[selected.check.status]}</strong>
          <ul>{selected.check.evidence.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>}
        <FinancialSummary financials={selected.financials} compact/>
        <p className="prospect-card-source">Fonte: {selected.source === "osm" ? "OpenStreetMap" : "lista importada"}. Confirma no Racius antes de contactar.</p>
        <button type="button" className="prospect-card-add" disabled={adding} onClick={() => void addToCrm(selected)}><Plus size={14}/>{adding ? "A adicionar…" : "Adicionar ao CRM como New"}</button>
      </div>}
    </div>
    <div className="company-map-footer">
      <div className="map-mode-toggle" role="group" aria-label="Modo do mapa">
        <button type="button" className={mode === "crm" ? "active" : ""} aria-pressed={mode === "crm"} onClick={() => { setMode("crm"); setSelected(null); }}>CRM</button>
        <button type="button" className={mode === "prospect" ? "active" : ""} aria-pressed={mode === "prospect"} onClick={() => setMode("prospect")}>Prospeção</button>
      </div>
      <button type="button" className={`route-toggle${planning ? " active" : ""}`} aria-pressed={planning} onClick={() => { setPlanning(!planning); setSelected(null); if (!planning) setMode("prospect"); }}><Route size={13}/>Planear visitas</button>
      {mode === "crm"
        ? <div className="company-map-legend" aria-label="Legenda dos estados">{Object.entries(stages).map(([key, label]) => <span key={key}><i className={`crm-dot crm-stage-${key}`}/>{label}</span>)}</div>
        : <div className="prospect-filters" role="group" aria-label="Setores">
            {allGroups.map((group) => {
              const count = (prospects ?? []).filter((p) => p.group === group).length;
              return <button key={group} type="button" className={groups.includes(group) ? "active" : ""} aria-pressed={groups.includes(group)} onClick={() => toggleGroup(group)}>{caeGroups[group].replace(/ \(CAE \d+\)/, "")}<span>{count}</span></button>;
            })}
            <button type="button" className={hideUnconfirmed ? "active" : ""} aria-pressed={hideUnconfirmed} onClick={() => setHideUnconfirmed(!hideUnconfirmed)}>Esconder a confirmar<span>{unconfirmed}</span></button>
          </div>}
    </div>
    {mode === "prospect" && <p className="company-map-unplaced">{prospects === null ? "A carregar prospetos…" : prospectNote || `${visibleProspects.length} prospetos (anéis; tracejado = localização a confirmar) e ${placed.length} empresas New do CRM. Volume de negócios e empregados só aparecem quando vêm de uma lista importada ou são registados na empresa.`}</p>}
    {mode === "crm" && unplaced.length > 0 && <p className="company-map-unplaced">Sem localização reconhecida ({unplaced.length}): {unplaced.map((company, index) => <span key={company.id}>{index > 0 && ", "}<button type="button" onClick={() => onSelect(company.id)}>{company.name}</button></span>)}</p>}
  </div>;
}
