"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapLibre, Marker, Popup } from "maplibre-gl";
import { stages, type Organization } from "@/domain/model";
import { placeCompanies } from "@/domain/municipalities";

// OpenFreeMap: vector tiles from OpenStreetMap, no key or usage limits, commercial use allowed.
const styles = { dark: "https://tiles.openfreemap.org/styles/dark", light: "https://tiles.openfreemap.org/styles/positron" };
const portugal: [number, number] = [-8.0, 39.6];
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Nudge the dark style towards the Vouga navy of the Living Docs, keeping roads and labels as they are.
function tint(map: MapLibre) {
  const set = (id: string, property: string, value: string) => { if (map.getLayer(id)) map.setPaintProperty(id, property, value); };
  set("background", "background-color", "#0b1020");
  set("water", "fill-color", "#0a1733");
  for (const layer of map.getStyle().layers ?? [])
    if (layer.type === "fill" && /^(landcover|landuse|park)/.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#0f1627");
}

export function CompanyMap({ companies, onSelect }: { companies: Organization[]; onSelect: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const markers = useRef<Marker[]>([]);
  const select = useRef(onSelect);
  const companiesRef = useRef(companies);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  const { placed, unplaced } = placeCompanies(companies);

  useEffect(() => {
    let cancelled = false;
    let lib: typeof import("maplibre-gl") | null = null;
    let hover: Popup | null = null;
    let fitted = false;
    const light = document.documentElement.dataset.theme === "light";

    function setPins() {
      if (!lib || !map.current) return;
      const current = map.current;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      const pins = placeCompanies(companiesRef.current).placed;
      for (const { company, lat, lng, dx, dy, precise } of pins) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "company-map-pin-wrapper";
        node.setAttribute("aria-label", `${company.name}, ${company.location ?? ""}, ${stages[company.stage]}`);
        node.innerHTML = `<span class="company-map-pin crm-stage-${company.stage}${company.pinned ? " is-pinned" : ""}"></span>`;
        const detail = `<strong>${escape(company.name)}</strong><br>${escape(precise && company.address ? company.address : company.location ?? "")} · ${stages[company.stage]}`;
        node.addEventListener("mouseenter", () => {
          hover?.remove();
          hover = new lib!.Popup({ closeButton: false, closeOnClick: false, offset: [dx, dy - 24], className: "company-map-tooltip" })
            .setLngLat([lng, lat]).setHTML(detail).addTo(current);
        });
        node.addEventListener("mouseleave", () => { hover?.remove(); hover = null; });
        node.addEventListener("click", (event) => { event.stopPropagation(); select.current(company.id); });
        markers.current.push(new lib.Marker({ element: node, anchor: "bottom", offset: [dx, dy] }).setLngLat([lng, lat]).addTo(current));
      }
      // Fit once per data set; later refreshes (a star, a status) keep the user's view.
      if (!fitted && pins.length) {
        const bounds = new lib.LngLatBounds();
        pins.forEach(({ lat, lng }) => bounds.extend([lng, lat]));
        current.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
        fitted = true;
      }
    }

    void import("maplibre-gl").then((module) => {
      if (cancelled || !element.current || map.current) return;
      lib = module;
      const instance = new module.Map({
        container: element.current,
        style: light ? styles.light : styles.dark,
        center: portugal,
        zoom: 6,
        attributionControl: { compact: true },
      });
      map.current = instance;
      instance.addControl(new module.NavigationControl({ showCompass: false }), "top-left");
      const scale = () => element.current?.classList.toggle("is-far", instance.getZoom() < 9);
      instance.on("zoom", scale);
      instance.on("load", () => { if (!light) tint(instance); setPins(); scale(); });
    });
    refresh.current = setPins;
    return () => {
      cancelled = true;
      hover?.remove();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const signature = companies.map((company) => `${company.id}:${company.version}:${company.stage}:${company.location ?? ""}:${company.coordinates?.lat ?? ""}:${company.pinned ? 1 : 0}`).join("|");
  useEffect(() => {
    companiesRef.current = companies;
    refresh.current();
    // The signature captures every field the pins depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return <div className="company-map-view">
    <div className="company-map" ref={element} role="region" aria-label={`Mapa com ${placed.length} empresas`}/>
    <div className="company-map-legend" aria-label="Legenda dos estados">{Object.entries(stages).map(([key, label]) => <span key={key}><i className={`crm-dot crm-stage-${key}`}/>{label}</span>)}</div>
    {unplaced.length > 0 && <p className="company-map-unplaced">Sem localização reconhecida ({unplaced.length}): {unplaced.map((company, index) => <span key={company.id}>{index > 0 && ", "}<button type="button" onClick={() => onSelect(company.id)}>{company.name}</button></span>)}</p>}
  </div>;
}
