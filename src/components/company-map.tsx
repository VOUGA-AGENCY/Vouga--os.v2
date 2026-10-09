"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibre, MapMouseEvent, Marker, Popup } from "maplibre-gl";
import { Ban, ExternalLink, MapPinPlus, Pencil, Plus, RotateCcw, Route, Sparkles, Trash2, X } from "lucide-react";
import { siteKinds, stages, type Organization } from "@/domain/model";
import { locateMunicipality, placeCompanies } from "@/domain/municipalities";
import { caeGroups, discardReasons, icpFit, type CaeGroup, type DiscardReason, type Prospect } from "@/domain/prospects";
import { raciusPage, raciusSearch } from "@/domain/racius";
import { sizeBands } from "@/domain/prospect-size";
import { shortDate } from "@/domain/time";
import type { RouteStop } from "@/domain/routing";
import { useApproachContext } from "./approach-context";
import { useWorkspace } from "./context";
import { FinancialSummary } from "./financials";
import { ProspectForm, type ProspectDraft } from "./prospect-form";
import { addProspectLayer, prospectLayer, setProspectData } from "./prospect-layer";
import { SelectBox } from "./task-surface";
import { RoutePlanner } from "./route-planner";

// OpenFreeMap: vector tiles from OpenStreetMap, no key, no Referer requirement, commercial use allowed.
// tile.openstreetmap.org must not be used: the app sends no cross-origin Referer (Referrer-Policy: same-origin),
// so its volunteer servers answer every tile with an "Access blocked" image.
const basemaps = { dark: "https://tiles.openfreemap.org/styles/dark", light: "https://tiles.openfreemap.org/styles/positron" };

const portugal: [number, number] = [-8.0, 39.6];
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const allGroups = Object.keys(caeGroups) as CaeGroup[];

type Mode = "crm" | "prospect";

export function CompanyMap({ companies, onSelect }: { companies: Organization[]; onSelect: (id: string) => void }) {
  const { data, command, notify, confirm, refresh } = useWorkspace();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  const extras = useRef<Marker[]>([]);
  const hover = useRef<Popup | null>(null);
  const select = useRef(onSelect);
  // While the route planner has a stop selected, a click on a marker swaps that stop instead of opening the company.
  const routePick = useRef<((id: string) => boolean) | null>(null);
  const [loaded, setLoaded] = useState<{ map: MapLibre; lib: typeof import("maplibre-gl") } | null>(null);
  const ready = !!loaded;
  useEffect(() => {
    if (!map.current) return;
    const tick = () => map.current?.resize();
    const onResize = () => tick();
    requestAnimationFrame(tick);
    const id = window.setTimeout(tick, 120);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onResize);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onResize);
    };
  }, [ready]);
  // The map mode is a per-viewer convenience: it survives switching to Routes and back.
  const [mode, setMode] = useState<Mode>(() => {
    try { return window.localStorage.getItem("crm-map-mode") === "prospect" ? "prospect" : "crm"; } catch { return "crm"; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("crm-map-mode", mode); } catch { /* storage unavailable */ }
  }, [mode]);
  const [groups, setGroups] = useState<CaeGroup[]>(allGroups);
  const [hideUnconfirmed, setHideUnconfirmed] = useState(false);
  const [onlyLikelyIcp, setOnlyLikelyIcp] = useState(false);
  // Reviewing the discarded prospects instead of the open ones.
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [discarding, setDiscarding] = useState<{ reason: DiscardReason | ""; note: string } | null>(null);
  const [sizeLink, setSizeLink] = useState("");
  const [sizing, setSizing] = useState(false);
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  // Bumped whenever the list changes, so the markers are rebuilt even when the count stays the same.
  const [prospectsVersion, setProspectsVersion] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [prospectNote, setProspectNote] = useState("");
  // Not an error: the map works, but on the former list until the shared base is set up.
  const [prospectNotice, setProspectNotice] = useState("");
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);
  // Adding or correcting a prospect: `placing` waits for a click on the map, `draft` is the open form.
  const [placing, setPlacing] = useState<ProspectDraft | "new" | null>(null);
  const [draft, setDraft] = useState<ProspectDraft | null>(null);
  const changeProspects = (change: (items: Prospect[]) => Prospect[]) => {
    setProspects((items) => change(items ?? []));
    setProspectsVersion((value) => value + 1);
  };
  const approach = useApproachContext();
  useEffect(() => { select.current = onSelect; }, [onSelect]);

  const visibleCompanies = useMemo(() => (mode === "prospect" ? companies.filter((company) => company.stage === "new") : companies), [companies, mode]);
  // Real accounts inside the ICP, or a high size estimate when the source has no accounts.
  const likelyIcp = (prospect: Prospect) => prospect.financials?.length || prospect.size ? icpFit(prospect.financials, prospect.size) === "dentro" : prospect.likelySize?.band === "alta";
  // Derived lists are recomputed only when their inputs change, not on every render (polling re-renders often).
  const { visibleProspects, unconfirmed, groupCounts, likelyCount } = useMemo(() => {
    const list = prospects ?? [];
    const inGroups = list.filter((prospect) => groups.includes(prospect.group));
    const counts = Object.fromEntries(allGroups.map((group) => [group, 0])) as Record<CaeGroup, number>;
    for (const prospect of list) counts[prospect.group]++;
    return {
      visibleProspects: mode === "prospect" ? inGroups.filter((prospect) => !(hideUnconfirmed && prospect.check?.status === "a-confirmar") && !(onlyLikelyIcp && !likelyIcp(prospect))) : [],
      unconfirmed: inGroups.filter((prospect) => prospect.check?.status === "a-confirmar").length,
      groupCounts: counts,
      likelyCount: inGroups.filter(likelyIcp).length,
    };
    // likelyIcp is a pure function of the prospect; prospectsVersion marks list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectsVersion, prospects, groups, hideUnconfirmed, onlyLikelyIcp, mode]);
  const { placed, unplaced } = useMemo(() => placeCompanies(visibleCompanies), [visibleCompanies]);

  const saveRoute = async (route: { name: string; date: string; stops: RouteStop[] }) => {
    try {
      await command("route.save", route);
      notify("Rota guardada para a equipa. Inicia-a em Rotas para fazer as visitas em sequência.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível guardar a rota.");
    }
  };

  // Map instance: created once.
  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl").then((module) => {
      if (cancelled || !element.current || map.current) return;
      lib.current = module;
      const instance = new module.Map({
        container: element.current,
        style: document.documentElement.dataset.theme === "light" ? basemaps.light : basemaps.dark,
        center: portugal,
        zoom: 6,
        attributionControl: { compact: true },
      });
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
      instance.on("load", () => {
        scale();
        requestAnimationFrame(() => instance.resize());
        window.setTimeout(() => instance.resize(), 150);
        setLoaded({ map: instance, lib: module });
      });
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

  // Prospects come from the shared base for the part of the map in view. The area asked for is the view plus a
  // margin, so panning around does not ask again until the view leaves it (or the result was cut short).
  useEffect(() => {
    if (mode !== "prospect" || !loaded) return;
    let timer = 0;
    let request: AbortController | null = null;
    let area: { west: number; south: number; east: number; north: number; complete: boolean } | null = null;
    const load = () => {
      const b = loaded.map.getBounds();
      if (area?.complete && b.getWest() >= area.west && b.getEast() <= area.east && b.getSouth() >= area.south && b.getNorth() <= area.north) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        request?.abort();
        request = new AbortController();
        const width = b.getEast() - b.getWest(), height = b.getNorth() - b.getSouth();
        const wanted = { west: b.getWest() - width / 2, south: b.getSouth() - height / 2, east: b.getEast() + width / 2, north: b.getNorth() + height / 2 };
        const bbox = [wanted.west, wanted.south, wanted.east, wanted.north].map((n) => n.toFixed(4)).join(",");
        fetch(`/api/prospects?bbox=${bbox}${showDiscarded ? "&descartados=1" : ""}`, { cache: "no-store", signal: request.signal })
          .then(async (response) => {
            const body = (await response.json()) as { items?: Prospect[]; truncated?: boolean; error?: string; notice?: string };
            if (!response.ok) throw new Error(body.error);
            area = { ...wanted, complete: !body.truncated };
            setProspects(body.items ?? []);
            setProspectsVersion((value) => value + 1);
            setTruncated(!!body.truncated);
            setProspectNote("");
            setProspectNotice(body.notice ?? "");
          })
          .catch((error: unknown) => {
            if ((error as Error).name === "AbortError") return;
            setProspects((items) => items ?? []);
            setProspectNote((error as Error).message || "Não foi possível carregar os prospetos.");
          });
      }, 250);
    };
    load();
    loaded.map.on("moveend", load);
    return () => { loaded.map.off("moveend", load); window.clearTimeout(timer); request?.abort(); };
  }, [mode, loaded, showDiscarded]);

  // Adding a prospect: the next click on the map sets its position and opens the form.
  useEffect(() => {
    if (!placing || !loaded) return;
    const container = loaded.map.getContainer();
    container.classList.add("is-placing");
    const place = (event: MapMouseEvent) => {
      const position = { lat: Number(event.lngLat.lat.toFixed(6)), lng: Number(event.lngLat.lng.toFixed(6)) };
      setDraft(placing === "new" ? position : { ...placing, ...position });
      setPlacing(null);
    };
    loaded.map.once("click", place);
    return () => { loaded.map.off("click", place); container.classList.remove("is-placing"); };
  }, [placing, loaded]);

  // CRM pins: rebuilt only when the companies or the mode change (not on every prospect reload). The view is
  // fitted once per mode, on the CRM pins and, in prospect mode, on the first prospects loaded.
  const signature = `${mode}|` + visibleCompanies.map((company) => `${company.id}:${company.version}:${company.stage}:${company.location ?? ""}:${company.coordinates?.lat ?? ""}:${company.pinned ? 1 : 0}`).join("|");
  const fittedMode = useRef<string>("");
  const tooltip = (lng: number, lat: number, html: string, offset: [number, number]) => {
    const current = map.current, maplibre = lib.current;
    if (!current || !maplibre) return;
    hover.current?.remove();
    hover.current = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset, className: "company-map-tooltip" }).setLngLat([lng, lat]).setHTML(html).addTo(current);
  };
  const fit = (points: { lat: number; lng: number }[], key: string) => {
    const current = map.current, maplibre = lib.current;
    if (!current || !maplibre || fittedMode.current === key || !points.length) return;
    const bounds = new maplibre.LngLatBounds();
    for (const point of points) bounds.extend([point.lng, point.lat]);
    current.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
    fittedMode.current = key;
  };
  useEffect(() => {
    const current = map.current;
    const maplibre = lib.current;
    if (!ready || !current || !maplibre) return;
    hover.current?.remove();
    [...markers.current, ...extras.current].forEach((marker) => marker.remove());
    markers.current = [];
    extras.current = [];
    const pins = placeCompanies(visibleCompanies).placed;
    for (const { company, lat, lng, dx, dy, precise } of pins) {
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
      node.addEventListener("click", (event) => { event.stopPropagation(); if (!routePick.current?.(company.id)) select.current(company.id); });
      markers.current.push(new maplibre.Marker({ element: node, anchor: "bottom", offset: [dx, dy] }).setLngLat([lng, lat]).addTo(current));
    }
    if (mode === "crm") fit(pins, "crm");
    // The signature captures every field the markers depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  // Prospect layer: created once, then only its data changes.
  const prospectsById = useRef(new Map<string, Prospect>());
  useEffect(() => {
    const current = map.current;
    if (!ready || !current) return;
    addProspectLayer(current);
    let hovered: string | null = null;
    const setHover = (id: string | null) => {
      if (hovered) current.setFeatureState({ source: "prospects", id: hovered }, { hover: false });
      hovered = id;
      if (id) current.setFeatureState({ source: "prospects", id }, { hover: true });
    };
    const move = (event: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
      const prospect = prospectsById.current.get(String(event.features?.[0]?.properties.id));
      if (!prospect || prospect.id === hovered) return;
      setHover(prospect.id);
      current.getCanvas().style.cursor = "pointer";
      tooltip(prospect.lng, prospect.lat, `<strong>${escape(prospect.name)}</strong><br>${escape(caeGroups[prospect.group])} · ${escape(prospect.location)}`, [0, -10]);
    };
    const leave = () => {
      setHover(null);
      current.getCanvas().style.cursor = "";
      hover.current?.remove();
      hover.current = null;
    };
    const click = (event: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
      // While placing a new prospect, the click is for its position.
      if (current.getContainer().classList.contains("is-placing")) return;
      const prospect = prospectsById.current.get(String(event.features?.[0]?.properties.id));
      if (!prospect || routePick.current?.(prospect.id)) return;
      setSelected(prospect);
      setDiscarding(null);
      setSizeLink("");
    };
    current.on("mousemove", prospectLayer, move);
    current.on("mouseleave", prospectLayer, leave);
    current.on("click", prospectLayer, click);
    return () => {
      current.off("mousemove", prospectLayer, move);
      current.off("mouseleave", prospectLayer, leave);
      current.off("click", prospectLayer, click);
    };
  }, [ready]);
  useEffect(() => {
    const current = map.current;
    if (!ready || !current) return;
    prospectsById.current = new Map(visibleProspects.map((p) => [p.id, p]));
    setProspectData(current, visibleProspects);
    if (mode === "prospect" && prospects) fit([...placed, ...visibleProspects], "prospect");
    // visibleProspects is derived from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode, prospectsVersion, groups, hideUnconfirmed, onlyLikelyIcp]);

  // Every action takes the prospect off the current list (converted, deleted, discarded or restored).
  async function prospectAction(action: "convert" | "delete" | "discard" | "restore", prospect: Prospect, values?: unknown) {
    const response = await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: prospect.id, values }) });
    const body = (await response.json()) as { message?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Pedido falhou.");
    changeProspects((items) => items.filter((item) => item.id !== prospect.id));
    setSelected(null);
    setDiscarding(null);
    notify(body.message ?? "Feito.");
  }

  async function discard(prospect: Prospect) {
    if (!discarding?.reason) return;
    try { await prospectAction("discard", prospect, { reason: discarding.reason, note: discarding.note }); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível descartar o prospeto."); }
  }

  async function readSize(prospect: Prospect) {
    setSizing(true);
    try {
      const response = await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "size", id: prospect.id, values: { url: sizeLink } }) });
      const body = (await response.json()) as { message?: string; error?: string; item?: Prospect };
      if (!response.ok || !body.item) throw new Error(body.error ?? "Não foi possível ler o Iberinform.");
      const item = body.item;
      changeProspects((items) => items.map((p) => (p.id === item.id ? item : p)));
      setSelected(item);
      setSizeLink("");
      notify(body.message ?? "Dimensão atualizada.");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Não foi possível ler o Iberinform.");
    } finally {
      setSizing(false);
    }
  }

  async function addToCrm(prospect: Prospect) {
    setAdding(true);
    try {
      await prospectAction("convert", prospect);
      await refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Não foi possível adicionar a empresa.");
    } finally {
      setAdding(false);
    }
  }

  async function removeProspect(prospect: Prospect) {
    if (!(await confirm(`Apagar "${prospect.name}" da base de prospeção para toda a equipa?`, "Apagar"))) return;
    try { await prospectAction("delete", prospect); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível apagar o prospeto."); }
  }

  function prospectSaved(prospect: Prospect, message: string) {
    changeProspects((items) => [...items.filter((item) => item.id !== prospect.id), prospect]);
    setDraft(null);
    setSelected(prospect);
    notify(message);
  }

  const toggleGroup = (group: CaeGroup) => setGroups((current) => current.includes(group) ? current.filter((g) => g !== group) : [...current, group]);

  const mapContent = (
    <div className="company-map-frame">
      <div className="company-map" ref={element} role="region" aria-label={mode === "prospect" ? `Mapa de prospeção com ${visibleProspects.length} prospetos` : `Mapa com ${placed.length} empresas`}/>
      {planning && loaded && <RoutePlanner map={loaded.map} lib={loaded.lib} sectors={groups} onClose={() => setPlanning(false)} onSaveRoute={saveRoute} pickRef={routePick}/>}
      {mode === "prospect" && prospectNote && !placing && <p className="company-map-placing is-error" role="alert">{prospectNote}</p>}
      {mode === "prospect" && !prospectNote && prospectNotice && !placing && !selected && !draft && <p className="company-map-placing is-error" role="status">{prospectNotice}</p>}
      {placing && <p className="company-map-placing" role="status">Clica no mapa onde fica a empresa. <button type="button" onClick={() => setPlacing(null)}>Cancelar</button></p>}
      {draft && !placing && !planning && <ProspectForm key={`${draft.id ?? "new"}:${draft.lat}:${draft.lng}`} draft={draft} onCancel={() => setDraft(null)} onSaved={prospectSaved} onMove={(values) => { setDraft(null); setPlacing(values); }}/>}
      {selected && !planning && !draft && !placing && <div className="prospect-card" role="dialog" aria-label={selected.name}>
        <header><strong>{selected.name}</strong><button type="button" aria-label="Fechar" onClick={() => setSelected(null)}><X size={15}/></button></header>
        <p className="prospect-card-group">{caeGroups[selected.group]}{selected.category ? ` · ${selected.category}` : ""}</p>
        <span className="company-racius">
          <a href={raciusPage(selected.name)} target="_blank" rel="noopener noreferrer" title="Abre a ficha da empresa no Racius: sede, atividade, CAE e capital social">Abrir no Racius<ExternalLink size={12}/></a>
          <a href={raciusSearch(selected.name)} target="_blank" rel="noopener noreferrer" title="Se a ficha não abrir, pesquisa a empresa no Racius">Não encontrou?</a>
        </span>
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
        <FinancialSummary financials={selected.financials} size={selected.size} compact/>
        {/* Same check as a CRM company: the public Iberinform page gives the turnover and headcount brackets. */}
        <form className="iberinform-link" onSubmit={(event) => { event.preventDefault(); if (sizeLink.trim()) void readSize(selected); }}>
          <input value={sizeLink} onChange={(event) => setSizeLink(event.target.value)} aria-label="Link da página da empresa no Iberinform" placeholder={selected.size ? "Atualizar com outro link do Iberinform" : "Cola o link da empresa no Iberinform"}/>
          <button disabled={sizing || !sizeLink.trim()}>{sizing ? "A ler…" : selected.size ? "Atualizar" : "Ligar"}</button>
        </form>
        <p className="financial-hint"><a href={`https://www.google.com/search?q=${encodeURIComponent(`site:iberinform.pt "${selected.name}"`)}`} target="_blank" rel="noopener noreferrer">Procurar no Iberinform</a>: abre a página, copia o link e cola-o aqui.</p>
        {selected.likelySize && !selected.financials?.length && !selected.size && <div className={`location-check size-${selected.likelySize.band}`}>
          <strong>{sizeBands[selected.likelySize.band]} · {selected.likelySize.score}/100</strong>
          <ul>{selected.likelySize.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <span className="prospect-card-source">Estimativa a partir do Google Maps; confirma a dimensão no Racius antes de contar como ICP.</span>
        </div>}
        <button type="button" className="prospect-card-context" disabled={approach.loading} onClick={() => void approach.request({ id: selected.id, name: selected.name, location: selected.location }, selected)}><Sparkles size={13}/>Contexto IA</button>
        {approach.panel(selected.id)}
        <p className="prospect-card-source">Fonte: {selected.source === "osm" ? "OpenStreetMap" : selected.source === "manual" ? "adicionado na app" : "lista importada"}{selected.editedBy ? ` · corrigido por ${data.members.find((m) => m.id === selected.editedBy)?.name ?? "alguém da equipa"}` : ""}. Confirma no Racius antes de contactar.</p>
        {selected.discarded
          ? <div className="location-check check-a-confirmar">
              <strong>Descartado: {discardReasons[selected.discarded.reason]}</strong>
              <span className="prospect-card-source">{data.members.find((m) => m.id === selected.discarded!.by)?.name ?? "Alguém da equipa"}, {shortDate(selected.discarded.at)}{selected.discarded.note ? ` · ${selected.discarded.note}` : ""}</span>
              <button type="button" className="prospect-card-add" onClick={() => void prospectAction("restore", selected).catch((reason: Error) => notify(reason.message))}><RotateCcw size={13}/>Recuperar para a prospeção</button>
            </div>
          : discarding
            ? <div className="prospect-discard">
                <SelectBox
                  name="reason"
                  label="Porque descartas?"
                  value={discarding.reason}
                  onChange={(reason) => setDiscarding({ ...discarding, reason: reason as DiscardReason | "" })}
                  options={[{ value: "", label: "Escolhe o motivo…" }, ...Object.entries(discardReasons).map(([key, label]) => ({ value: key, label }))]}
                />
                <input value={discarding.note} onChange={(event) => setDiscarding({ ...discarding, note: event.target.value })} placeholder="Nota (opcional)" aria-label="Nota do descarte"/>
                <div className="prospect-card-tools">
                  <button type="button" onClick={() => setDiscarding(null)}>Cancelar</button>
                  <button type="button" className="prospect-card-delete" disabled={!discarding.reason} onClick={() => void discard(selected)}><Ban size={12}/>Descartar para a equipa</button>
                </div>
              </div>
            : <>
                <div className="prospect-card-tools">
                  <button type="button" onClick={() => setDraft({ ...selected })}><Pencil size={12}/>Corrigir</button>
                  <button type="button" onClick={() => setDiscarding({ reason: "", note: "" })}><Ban size={12}/>Descartar</button>
                  <button type="button" className="prospect-card-delete" onClick={() => void removeProspect(selected)}><Trash2 size={12}/>Apagar</button>
                </div>
                <button type="button" className="prospect-card-add" disabled={adding} onClick={() => void addToCrm(selected)}><Plus size={14}/>{adding ? "A adicionar…" : "Adicionar ao CRM como New"}</button>
              </>}
      </div>}
    </div>
  );

  return <div className="company-map-view">
    {mapContent}
    <div className="company-map-footer">
      <div className="map-mode-toggle" role="group" aria-label="Modo do mapa">
        <button type="button" className={mode === "crm" ? "active" : ""} aria-pressed={mode === "crm"} onClick={() => { setMode("crm"); setSelected(null); }}>CRM</button>
        <button type="button" className={mode === "prospect" ? "active" : ""} aria-pressed={mode === "prospect"} onClick={() => setMode("prospect")}>Prospeção</button>
      </div>
      <button type="button" className={`route-toggle${planning ? " active" : ""}`} aria-pressed={planning} onClick={() => { setPlanning(!planning); setSelected(null); setDraft(null); setPlacing(null); if (!planning) setMode("prospect"); }}><Route size={13}/>Planear visitas</button>
      {mode === "prospect" && !planning && <button type="button" className={`route-toggle${placing ? " active" : ""}`} aria-pressed={!!placing} onClick={() => { setSelected(null); setDraft(null); setPlacing(placing ? null : "new"); }}><MapPinPlus size={13}/>Adicionar prospeto</button>}
      {mode === "crm"
        ? <div className="company-map-legend" aria-label="Legenda dos estados">{Object.entries(stages).map(([key, label]) => <span key={key}><i className={`crm-dot crm-stage-${key}`}/>{label}</span>)}</div>
        : <div className="prospect-filters" role="group" aria-label="Setores">
            {allGroups.map((group) => {
              const count = groupCounts[group];
              return <button key={group} type="button" className={groups.includes(group) ? "active" : ""} aria-pressed={groups.includes(group)} onClick={() => toggleGroup(group)}>{caeGroups[group].replace(/ \(CAE \d+\)/, "")}<span>{count}</span></button>;
            })}
            <button type="button" className={hideUnconfirmed ? "active" : ""} aria-pressed={hideUnconfirmed} onClick={() => setHideUnconfirmed(!hideUnconfirmed)}>Esconder a confirmar<span>{unconfirmed}</span></button>
            <button type="button" className={onlyLikelyIcp ? "active" : ""} aria-pressed={onlyLikelyIcp} title="Contas reais dentro do ICP ou dimensão provável alta (estimativa do Google Maps)" onClick={() => setOnlyLikelyIcp(!onlyLikelyIcp)}>Só dimensão alta<span>{likelyCount}</span></button>
            <button type="button" className={showDiscarded ? "active" : ""} aria-pressed={showDiscarded} title="Mostra só os prospetos descartados pela equipa, para os rever ou recuperar" onClick={() => { setShowDiscarded(!showDiscarded); setSelected(null); }}>Ver descartados</button>
          </div>}
    </div>
    {mode === "prospect" && <p className="company-map-unplaced">{prospects === null ? "A carregar prospetos…" : prospectNote || `${visibleProspects.length} prospetos nesta zona do mapa (anéis; tracejado = localização a confirmar) e ${placed.length} empresas New do CRM.${truncated ? " Há mais prospetos nesta zona: aproxima o mapa para os ver todos." : ""} Volume de negócios e empregados só aparecem quando vêm de uma lista importada ou são registados na empresa.`}</p>}
    {mode === "crm" && unplaced.length > 0 && <p className="company-map-unplaced">Sem localização reconhecida ({unplaced.length}): {unplaced.map((company, index) => <span key={company.id}>{index > 0 && ", "}<button type="button" onClick={() => onSelect(company.id)}>{company.name}</button></span>)}</p>}
  </div>;
}
