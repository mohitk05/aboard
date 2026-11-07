import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { Stop } from "../api";
import { greatCircle, trainPosition } from "../lib/motion";
import type { Route, Trip } from "../world";
import { createEarth, loadStarfield } from "./earth";
import { createTileLayer } from "./tiles";
import type { WorldFocus } from "./focus";
import { subsolarPoint, toLatLng, toVec3, type LatLng } from "./geo";
import { select, type Selection } from "./selection";
import { createTrainKit, poseTrain } from "./trains";

// The 3D world behind every screen: a realistic Earth (NASA imagery, city lights, the real sun),
// rail lines, stations and trains made of a locomotive and carriages. Hover a line to highlight
// it; click a train or a line for its details. Built following the threejs-scene-setup and
// threejs-materials-lighting skills (.claude/skills).

export interface World3DProps {
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  focus: WorldFocus;
  selection: Selection;
}

const R = 1; // globe radius
const TRACK_R = 1.0008; // rails sit just above the surface

/** Densely sampled great-circle arc as Vector3s at radius r. */
function arcPoints(a: LatLng, b: LatLng, r: number): THREE.Vector3[] {
  const steps = 48;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) pts.push(new THREE.Vector3(...toVec3(greatCircle(a, b, i / steps), r)));
  return pts;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// Lines are a cool white, like everything else in the chrome: the Earth supplies the colour.
// A hovered or selected line brightens to pure white and thickens.
const LINE = 0xc8ccd6;
const LINE_HOT = 0xffffff;

export default function World3D({ stops, routes, trips, focus, selection }: World3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ stops, routes, trips, focus, selection });
  latest.current = { stops, routes, trips, focus, selection };
  const api = useRef<{ rebuild: () => void; refocus: () => void; reselect: () => void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      el.dataset.webgl = "unavailable"; // panels still work; the world just isn't drawn
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    const labels = new CSS2DRenderer();
    labels.domElement.className = "world-labels";
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const stars = loadStarfield();
    scene.background = stars;
    scene.backgroundIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 50);
    camera.position.set(...toVec3({ lat: 45, lng: 60 }, 3.2));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.045; // as close as the most detailed imagery tiles stay sharp
    controls.maxDistance = 4.5;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;

    // Light: the sun where it really is, and a faint fill so the night side isn't invisible.
    const sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
    const fill = new THREE.HemisphereLight(0x8fb4d9, 0x0b1517, 0.18);
    scene.add(sun, fill);

    const earth = createEarth(renderer, R);
    const tiles = createTileLayer(renderer, R);
    scene.add(earth.globe, tiles.group, earth.atmosphere);
    const sunDir = new THREE.Vector3();
    const placeSun = () => {
      sunDir.set(...toVec3(subsolarPoint(new Date()), 1));
      sun.position.copy(sunDir).multiplyScalar(10);
      earth.setSun(sunDir);
      tiles.setSun(sunDir);
    };
    placeSun();

    // ---------- network: lines (with hover highlight + pick tubes), stations, labels ----------
    const network = new THREE.Group();
    const trainGroup = new THREE.Group();
    scene.add(network, trainGroup);
    const kit = createTrainKit();
    const stationGeometry = new THREE.SphereGeometry(1, 16, 12);
    // Lines keep a constant width in pixels at any zoom (three's "fat lines").
    const lineMat = new LineMaterial({ color: LINE, linewidth: 2.2 });
    const hotMat = new LineMaterial({ color: LINE_HOT, linewidth: 5 });
    const stationMat = new THREE.MeshStandardMaterial({ color: 0xf1f7fa, roughness: 0.5 });
    const stationHi = new THREE.MeshStandardMaterial({ color: LINE, emissive: LINE, emissiveIntensity: 0.4 });

    const stopMeshes: THREE.Mesh[] = [];
    const stopLabels: { obj: CSS2DObject; normal: THREE.Vector3; highlight: boolean }[] = [];
    const routeLines = new Map<string, { normal: Line2[]; hot: Line2[] }>();
    const pickLines: Line2[] = []; // hit-tested in screen pixels, so easy to hover at any zoom
    const trainGroups = new Map<string, THREE.Group>();

    function clearNetwork() {
      network.traverse((o) => {
        if ((o instanceof THREE.Mesh || o instanceof Line2) && o.geometry !== stationGeometry) o.geometry.dispose();
        if (o instanceof CSS2DObject) o.element.remove();
      });
      network.clear();
      stopMeshes.length = 0;
      stopLabels.length = 0;
      pickLines.length = 0;
      routeLines.clear();
    }

    function rebuild() {
      const { stops, routes, focus } = latest.current;
      clearNetwork();
      for (const r of routes) {
        const entry = { normal: [] as Line2[], hot: [] as Line2[] };
        for (let i = 1; i < r.stops.length; i++) {
          const pts = arcPoints(r.stops[i - 1]!.coordinates, r.stops[i]!.coordinates, TRACK_R);
          const geo = new LineGeometry().setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
          const normal = new Line2(geo, lineMat);
          const hot = new Line2(geo.clone(), hotMat);
          hot.visible = false;
          normal.userData.routeId = r.id;
          network.add(normal, hot);
          entry.normal.push(normal);
          entry.hot.push(hot);
          pickLines.push(normal);
        }
        routeLines.set(r.id, entry);
      }
      for (const s of stops) {
        const hi = focus.highlight.includes(s.id);
        const m = new THREE.Mesh(stationGeometry, hi ? stationHi : stationMat);
        m.userData.base = hi ? 0.011 : 0.006;
        const p = toVec3(s.coordinates, TRACK_R);
        m.position.set(...p);
        m.userData.stopId = s.id;
        network.add(m);
        stopMeshes.push(m);

        const div = document.createElement("div");
        div.className = `world-label${hi ? " is-highlight" : ""}`;
        div.textContent = s.name;
        const obj = new CSS2DObject(div);
        obj.position.set(...toVec3(s.coordinates, TRACK_R + 0.01));
        network.add(obj);
        stopLabels.push({ obj, normal: new THREE.Vector3(...p).normalize(), highlight: hi });
      }
      highlightRoutes();
    }

    // A line glows when hovered, and stays lit while its details are open.
    let hoverRoute: string | null = null;
    function highlightRoutes() {
      const sel = latest.current.selection;
      for (const [id, l] of routeLines) {
        const on = id === hoverRoute || (sel?.kind === "route" && sel.id === id);
        l.hot.forEach((m) => (m.visible = on));
        l.normal.forEach((m) => (m.visible = !on));
      }
    }

    // "Your train" label that rides above the followed train.
    const youDiv = document.createElement("div");
    youDiv.className = "world-label is-highlight";
    youDiv.textContent = "Your train";
    const youLabel = new CSS2DObject(youDiv);
    youLabel.visible = false;
    scene.add(youLabel);

    /** Car length in world units: big enough to see from orbit, smaller up close. */
    function carLength() {
      return THREE.MathUtils.clamp((camera.position.length() - R) * 0.012, 0.0024, 0.016);
    }

    function syncTrains(now: number) {
      const { trips, routes, focus } = latest.current;
      const seen = new Set<string>();
      const len = carLength();
      let nightSum = 0;
      for (const t of trips) {
        seen.add(t.id);
        let g = trainGroups.get(t.id);
        if (!g) {
          g = kit.train(t.id);
          trainGroup.add(g);
          trainGroups.set(t.id, g);
        }
        poseTrain(g, t, routes.find((r) => r.id === t.route), now, len, TRACK_R);
        nightSum += 1 - THREE.MathUtils.smoothstep(g.children[0]!.position.clone().normalize().dot(sunDir), -0.1, 0.2);
        if (t.id === focus.follow) {
          // Float the label well above the train so it doesn't sit on station names.
          youLabel.position.copy(g.children[0]!.position).multiplyScalar(1 + Math.max(len * 6, 0.02));
          youLabel.visible = true;
        }
      }
      if (!focus.follow || !trips.some((t) => t.id === focus.follow)) youLabel.visible = false;
      kit.setNight(trips.length ? nightSum / trips.length : 0);
      for (const [id, g] of trainGroups) {
        if (!seen.has(id)) {
          trainGroup.remove(g);
          trainGroups.delete(id);
        }
      }
    }

    // ---------- camera ----------
    let flight: { from: THREE.Vector3; to: THREE.Vector3; t0: number; ms: number } | null = null;
    let lastInteraction = -Infinity;
    let interacting = false;
    let waitingForTarget = false;
    controls.addEventListener("start", () => {
      lastInteraction = performance.now();
      interacting = true;
      flight = null;
    });
    controls.addEventListener("end", () => {
      lastInteraction = performance.now();
      interacting = false;
    });
    function flyTo(at: LatLng, distance: number | null) {
      const d = distance ?? camera.position.length();
      const to = new THREE.Vector3(...toVec3(at, d));
      if (reduceMotion) return void camera.position.copy(to);
      flight = { from: camera.position.clone(), to, t0: performance.now(), ms: 1400 };
    }
    function followTarget(): LatLng | null {
      const { focus, trips } = latest.current;
      const t = focus.follow ? trips.find((x) => x.id === focus.follow) : null;
      return t ? trainPosition(t, Date.now()) : null;
    }
    function refocus() {
      const { focus } = latest.current;
      waitingForTarget = !!focus.follow && !followTarget();
      const target = followTarget() ?? focus.center;
      if (target) flyTo(target, focus.distance);
      else if (focus.distance) flyTo(toLatLng(camera.position.toArray() as [number, number, number]), focus.distance);
      el!.setAttribute("aria-label", focus.label);
      rebuild();
    }
    // Selecting a train or a line flies the camera to it.
    function reselect() {
      highlightRoutes();
      resize(); // the details panel takes space on the right; re-centre the view
      const { selection, routes, trips } = latest.current;
      if (selection?.kind === "train") {
        const t = trips.find((x) => x.id === selection.id);
        if (t) flyTo(trainPosition(t, Date.now()), Math.min(camera.position.length(), 2.4));
      } else if (selection?.kind === "route") {
        const r = routes.find((x) => x.id === selection.id);
        if (r) {
          // Aim at the middle of the line, far enough out to see all of it.
          const mid = new THREE.Vector3();
          for (const s of r.stops) mid.add(new THREE.Vector3(...toVec3(s.coordinates)));
          mid.normalize();
          const spread = Math.max(...r.stops.map((s) => mid.angleTo(new THREE.Vector3(...toVec3(s.coordinates)))));
          flyTo(toLatLng(mid.toArray() as [number, number, number]), THREE.MathUtils.clamp(1.6 + spread * 2.4, 1.8, 4.2));
        }
      }
    }

    // ---------- pointer: hover lines/trains, click for details ----------
    const ray = new THREE.Raycaster();
    ray.camera = camera; // fat lines need the camera to hit-test in pixels
    ray.params.Line2 = { threshold: 8 }; // px of slack around a line
    const ndc = new THREE.Vector2();
    type Hit = { kind: "stop"; id: string } | { kind: "train"; id: string } | { kind: "route"; id: string } | { kind: "globe"; at: LatLng } | null;
    function pick(clientX: number, clientY: number): Hit {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const globeHit = ray.intersectObject(earth.globe, false)[0];
      const inFront = (d: number) => !globeHit || d < globeHit.distance + 1e-4; // nothing behind the planet
      const { focus } = latest.current;
      if (focus.onStopClick) {
        const s = ray.intersectObjects(stopMeshes, false)[0];
        if (s && inFront(s.distance)) return { kind: "stop", id: s.object.userData.stopId };
      }
      const t = ray.intersectObject(trainGroup, true)[0];
      if (t && inFront(t.distance)) return { kind: "train", id: t.object.userData.tripId };
      const r = ray.intersectObjects(pickLines, false)[0];
      if (r && inFront(r.distance)) return { kind: "route", id: r.object.userData.routeId };
      if (globeHit) return { kind: "globe", at: toLatLng(globeHit.point.toArray() as [number, number, number]) };
      return null;
    }

    let down: { x: number; y: number } | null = null;
    let pendingMove: PointerEvent | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") pendingMove = e; // handled once per frame
    };
    const onLeave = () => {
      hoverRoute = null;
      highlightRoutes();
      renderer.domElement.style.cursor = "";
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      down = null;
      const hit = pick(e.clientX, e.clientY);
      const { focus } = latest.current;
      if (hit?.kind === "stop") focus.onStopClick?.(hit.id);
      else if (hit?.kind === "train") select({ kind: "train", id: hit.id });
      else if (hit?.kind === "route") select({ kind: "route", id: hit.id });
      else if (hit?.kind === "globe" && focus.onMapClick) focus.onMapClick(hit.at);
      else select(null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("pointerup", onUp);

    // ---------- size ----------
    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      // Centre the world in the space the panels leave free (left column, and on the right the
      // details panel when something is selected).
      const right = latest.current.selection ? Math.min(396, w * 0.3) : 0;
      if (w >= 900) camera.setViewOffset(w, h, (right - Math.min(492, w * 0.4)) / 2, 0, w, h);
      else camera.setViewOffset(w, h, 0, h * 0.29, w, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labels.setSize(w, h);
      lineMat.resolution.set(w, h);
      hotMat.resolution.set(w, h);
    };
    const ro = new ResizeObserver(() => resize());
    ro.observe(el);
    resize();

    refocus();
    api.current = { rebuild, refocus, reselect };

    // ---------- loop ----------
    const timer = new THREE.Timer();
    timer.connect(document);
    let sunTick = 0;
    let lastFrame = 0;
    const camUnit = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      if (document.hidden) return;
      const now = performance.now();
      // Full frame rate while the camera moves or you're touching the globe; otherwise 15 fps
      // is plenty for trains crawling across a planet, and saves a lot of battery.
      const busy = !!flight || interacting || now - lastInteraction < 1500 || pendingMove !== null;
      if (!busy && now - lastFrame < 66) return;
      lastFrame = now;
      timer.update();
      const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);

      if (waitingForTarget && followTarget()) refocus();
      if (flight) {
        const k = Math.min(1, (now - flight.t0) / flight.ms);
        const dir = flight.from.clone().normalize().lerp(flight.to.clone().normalize(), ease(k)).normalize();
        camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flight.from.length(), flight.to.length(), ease(k))));
        if (k >= 1) flight = null;
      } else {
        const target = followTarget();
        const idle = now - lastInteraction > 6000;
        if (target && idle) {
          const want = new THREE.Vector3(...toVec3(target, camera.position.length()));
          camera.position.lerp(want, Math.min(1, dt * 1.5)).setLength(want.length());
        } else if (!latest.current.focus.center && !target && idle && !reduceMotion) {
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.035);
        }
      }
      controls.update();

      if ((sunTick += dt) > 30) {
        sunTick = 0;
        placeSun();
      }
      syncTrains(Date.now());
      tiles.update(camera);

      // Station dots keep a steady on-screen size.
      const k = THREE.MathUtils.clamp((camera.position.length() - R) / 2.2, 0.25, 1);
      for (const m of stopMeshes) m.scale.setScalar((m.userData.base as number) * k);

      // Hover (mouse only), once per frame.
      if (pendingMove) {
        const hit = pick(pendingMove.clientX, pendingMove.clientY);
        pendingMove = null;
        const next = hit?.kind === "route" ? hit.id : null;
        if (next !== hoverRoute) {
          hoverRoute = next;
          highlightRoutes();
        }
        const clickable = hit && (hit.kind !== "globe" || !!latest.current.focus.onMapClick);
        renderer.domElement.style.cursor = clickable ? "pointer" : "";
      }

      // Labels: hide on the far side of the globe, and minor ones when zoomed out.
      camUnit.copy(camera.position).normalize();
      const far = camera.position.length() > 2.6;
      for (const l of stopLabels) l.obj.visible = l.normal.dot(camUnit) > 0.25 && (l.highlight || !far);

      renderer.render(scene, camera);
      labels.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      timer.dispose();
      ro.disconnect();
      for (const [ev, fn] of [["pointerdown", onDown], ["pointermove", onMove], ["pointerleave", onLeave], ["pointerup", onUp]] as const)
        renderer.domElement.removeEventListener(ev, fn as EventListener);
      controls.dispose();
      clearNetwork();
      kit.dispose();
      stationGeometry.dispose();
      for (const m of [lineMat, hotMat, stationMat, stationHi]) m.dispose();
      earth.dispose();
      tiles.dispose();
      stars.dispose();
      youDiv.remove();
      renderer.dispose();
      el.replaceChildren();
      api.current = null;
    };
  }, []);

  useEffect(() => api.current?.rebuild(), [stops, routes]);
  useEffect(() => api.current?.refocus(), [focus]);
  useEffect(() => api.current?.reselect(), [selection]);

  return <div ref={host} className="world" role="img" aria-label={focus.label} />;
}
