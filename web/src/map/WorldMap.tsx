import type { Feature, FeatureCollection } from "geojson";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Stop } from "../api";
import { arc, trainPosition, type LatLng } from "../lib/motion";
import type { Route, Trip } from "../world";
import { applyColors, baseStyle, FONT, themeColors } from "./style";

export interface WorldMapProps {
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  /** Stops to emphasise (e.g. your station, your destination). */
  highlightStops?: string[];
  /** Keep this train in view as it moves. */
  followTrip?: string | null;
  /** Initial view. Defaults to fitting all stops. */
  center?: LatLng;
  zoom?: number;
  onMapClick?: (at: LatLng) => void;
  onStopClick?: (stopId: string) => void;
  label?: string;
  className?: string;
}

type FC = FeatureCollection;
const fc = (features: Feature[]): FC => ({ type: "FeatureCollection", features });

function routesGeo(routes: Route[]): FC {
  return fc(
    routes.map((r) => {
      const coords: [number, number][] = [];
      for (let i = 1; i < r.stops.length; i++) {
        const seg = arc(r.stops[i - 1]!.coordinates, r.stops[i]!.coordinates);
        // Keep the whole line continuous in longitude, so it never jumps across the map.
        const last = coords.at(-1);
        const shift = last ? Math.round((last[0] - seg[0]![0]) / 360) * 360 : 0;
        coords.push(...seg.slice(last ? 1 : 0).map(([x, y]) => [x + shift, y] as [number, number]));
      }
      return { type: "Feature", properties: { id: r.id, name: r.name }, geometry: { type: "LineString", coordinates: coords } };
    }),
  );
}

function stopsGeo(stops: Stop[], highlight: string[]): FC {
  return fc(
    stops.map((s) => ({
      type: "Feature",
      properties: { id: s.id, name: s.name, highlight: highlight.includes(s.id) ? 1 : 0 },
      geometry: { type: "Point", coordinates: [s.coordinates.lng, s.coordinates.lat] },
    })),
  );
}

function trainsGeo(trips: Trip[], now: number, follow?: string | null): FC {
  return fc(
    trips.map((t) => {
      const p = trainPosition(t, now);
      return {
        type: "Feature",
        properties: { id: t.id, moving: t.state === "MOVING" ? 1 : 0, mine: t.id === follow ? 1 : 0 },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      };
    }),
  );
}

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function WorldMap({
  stops,
  routes,
  trips,
  highlightStops = [],
  followTrip,
  center,
  zoom,
  onMapClick,
  onStopClick,
  label = "Map of the rail network",
  className,
}: WorldMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const latest = useRef({ stops, routes, trips, highlightStops, followTrip, onMapClick, onStopClick });
  latest.current = { stops, routes, trips, highlightStops, followTrip, onMapClick, onStopClick };
  const fitted = useRef(false);

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle(themeColors()),
      center: center ? [center.lng, center.lat] : [60, 50],
      zoom: zoom ?? 2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current = m;

    m.on("load", () => {
      const accent = css("--accent", "#b5650f");
      const ink = css("--ink", "#1f1b16");
      const surface = css("--surface", "#fffaf1");
      const trainColor = css("--board-ink", "#f3c14b");
      const trainEdge = css("--board-bg", "#15130f");

      m.addSource("routes", { type: "geojson", data: fc([]) });
      m.addSource("stops", { type: "geojson", data: fc([]) });
      m.addSource("trains", { type: "geojson", data: fc([]) });

      m.addLayer({
        id: "routes-casing",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": surface, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 4, 8, 8] },
      });
      m.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accent, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 2, 8, 4] },
      });
      m.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["case", ["==", ["get", "highlight"], 1], 7, 4.5],
          "circle-color": ["case", ["==", ["get", "highlight"], 1], accent, surface],
          "circle-stroke-color": ink,
          "circle-stroke-width": 1.5,
        },
      });
      m.addLayer({
        id: "stop-labels",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "name"],
          "text-font": FONT,
          "text-size": ["case", ["==", ["get", "highlight"], 1], 14, 12],
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": ink, "text-halo-color": surface, "text-halo-width": 1.5 },
      });
      m.addLayer({
        id: "trains",
        type: "circle",
        source: "trains",
        paint: {
          "circle-radius": ["case", ["==", ["get", "mine"], 1], 9, 7],
          "circle-color": trainColor,
          "circle-stroke-color": trainEdge,
          "circle-stroke-width": 2.5,
        },
      });

      ready.current = true;
      sync();
    });

    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ["stops"] })[0];
      const id = hit?.properties?.id as string | undefined;
      if (id && latest.current.onStopClick) latest.current.onStopClick(id);
      else latest.current.onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.wrap().lng });
    });
    m.on("mouseenter", "stops", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "stops", () => (m.getCanvas().style.cursor = ""));

    // Follow light/dark changes.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => ready.current && applyColors(m, themeColors());
    mq.addEventListener("change", onScheme);

    // Move trains smoothly between server updates, only while the page is visible.
    let raf = 0;
    let lastFrame = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!ready.current || document.hidden || t - lastFrame < 250) return; // 4 fps is plenty at 60 km/h
      lastFrame = t;
      const { trips, followTrip } = latest.current;
      const data = trainsGeo(trips, Date.now(), followTrip);
      (m.getSource("trains") as GeoJSONSource | undefined)?.setData(data);
      if (followTrip) {
        const f = data.features.find((x) => x.properties?.id === followTrip);
        if (f && f.geometry.type === "Point" && !m.isMoving()) {
          const [lng, lat] = f.geometry.coordinates as [number, number];
          const c = m.getCenter();
          if (Math.abs(c.lng - lng) > 0.0005 || Math.abs(c.lat - lat) > 0.0005) m.easeTo({ center: [lng, lat], duration: 200 });
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onScheme);
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { stops, routes, trips, highlightStops, followTrip } = latest.current;
    (m.getSource("routes") as GeoJSONSource).setData(routesGeo(routes));
    (m.getSource("stops") as GeoJSONSource).setData(stopsGeo(stops, highlightStops));
    (m.getSource("trains") as GeoJSONSource).setData(trainsGeo(trips, Date.now(), followTrip));

    // First time we have stops and no fixed view: fit them all in.
    if (!fitted.current && !center && stops.length) {
      fitted.current = true;
      const b = new maplibregl.LngLatBounds();
      for (const s of stops) b.extend([s.coordinates.lng, s.coordinates.lat]);
      m.fitBounds(b, { padding: 40, maxZoom: 6, duration: 0 });
    }
    if (followTrip && !fitted.current) fitted.current = true;
  }

  // Push new data into the map whenever it changes.
  useEffect(sync, [stops, routes, trips, highlightStops.join(","), followTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={`map ${className ?? ""}`} role="region" aria-label={label} />;
}

export default WorldMap;
