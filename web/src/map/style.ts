import type { StyleSpecification } from "maplibre-gl";
import { cssColor } from "./color";

// Our own base-map style on OpenFreeMap's free vector tiles (OpenMapTiles schema): just land,
// water, country borders and place names, in the app's colours. Rail lines, stations and
// trains are drawn on top by WorldMap.

export interface MapColors {
  land: string;
  water: string;
  border: string;
  label: string;
  labelHalo: string;
}

const read = cssColor;

export function themeColors(): MapColors {
  return {
    land: read("--map-land", "#efe8db"),
    water: read("--map-water", "#cfdfe3"),
    border: read("--map-border", "#c9bba5"),
    label: read("--map-label", "#6b6258"),
    labelHalo: read("--map-land", "#efe8db"),
  };
}

export const FONT = ["Noto Sans Regular"];

export function baseStyle(c: MapColors): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": c.land } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      {
        id: "borders",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": c.border, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 8, 1.4] },
      },
      {
        id: "countries",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        maxzoom: 6,
        filter: ["==", ["get", "class"], "country"],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 5, 13],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.12,
          "text-max-width": 8,
        },
        paint: { "text-color": c.label, "text-halo-color": c.labelHalo, "text-halo-width": 1.2, "text-opacity": 0.7 },
      },
      {
        id: "cities",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 5,
        filter: ["==", ["get", "class"], "city"],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": FONT,
          "text-size": 11,
        },
        paint: { "text-color": c.label, "text-halo-color": c.labelHalo, "text-halo-width": 1.2, "text-opacity": 0.8 },
      },
    ],
  };
}

/** Repaint the base layers after a light/dark switch, without reloading tiles or overlays. */
export function applyColors(map: maplibregl.Map, c: MapColors) {
  map.setPaintProperty("land", "background-color", c.land);
  map.setPaintProperty("water", "fill-color", c.water);
  map.setPaintProperty("borders", "line-color", c.border);
  for (const id of ["countries", "cities"]) {
    map.setPaintProperty(id, "text-color", c.label);
    map.setPaintProperty(id, "text-halo-color", c.labelHalo);
  }
}
