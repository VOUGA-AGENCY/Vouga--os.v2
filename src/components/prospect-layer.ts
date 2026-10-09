"use client";
import type { GeoJSONSource, Map as MapLibre, MapMouseEvent } from "maplibre-gl";
import type { Prospect } from "@/domain/prospects";

// Prospects are drawn by the map itself (one GPU layer) instead of one HTML element each: with thousands of
// prospects, HTML markers made panning and zooming slow because every element is repositioned on every frame.
export const prospectLayer = "prospects-ring";
const source = "prospects";

const token = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * False once the map has been removed: MapLibre deletes its style there, and every call below would throw.
 * React runs the cleanups of components that unmount with the map after the map itself is gone, so they ask here.
 */
const live = (map: MapLibre) => !!(map as Partial<MapLibre>).style;

export function addProspectLayer(map: MapLibre) {
  if (!live(map) || map.getSource(source)) return;
  map.addSource(source, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
  map.addLayer({
    id: prospectLayer,
    type: "circle",
    source,
    paint: {
      // Bigger when zoomed in, and when hovered.
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, ["case", ["boolean", ["feature-state", "hover"], false], 6, 4], 12, ["case", ["boolean", ["feature-state", "hover"], false], 10, 7]],
      "circle-color": token("--color-bg", "#0c0c0c"),
      "circle-opacity": 0.55,
      "circle-stroke-width": 2,
      // Unconfirmed positions keep the amber of the "a confirmar" state.
      "circle-stroke-color": ["case", ["get", "unconfirmed"], token("--stage-contacted", "#d8b06d"), token("--map-prospect", "#8fa5f7")],
      "circle-stroke-opacity": ["case", ["get", "unconfirmed"], 0.75, 1],
    },
  });
}

export function setProspectData(map: MapLibre, prospects: Prospect[]) {
  if (!live(map)) return;
  (map.getSource(source) as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: prospects.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, unconfirmed: p.check?.status === "a-confirmar" },
    })),
  });
}

/** While a route stop is selected, prospects become targets for a swap: coral, like the route. */
export function highlightProspects(map: MapLibre, on: boolean) {
  if (!live(map) || !map.getLayer(prospectLayer)) return;
  map.setPaintProperty(prospectLayer, "circle-stroke-color", on
    ? token("--vouga-coral", "#f26b4a")
    : ["case", ["get", "unconfirmed"], token("--stage-contacted", "#d8b06d"), token("--map-prospect", "#8fa5f7")]);
}

/** True when a map click landed on a prospect, so map-wide click handlers can leave it to the layer. */
export function hitsProspect(map: MapLibre, event: MapMouseEvent) {
  return live(map) && !!map.getLayer(prospectLayer) && map.queryRenderedFeatures(event.point, { layers: [prospectLayer] }).length > 0;
}
