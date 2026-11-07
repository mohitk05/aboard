import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { Stop } from "../api";
import { greatCircle, trainPosition } from "../lib/motion";
import type { Route, Trip } from "../world";
import type { WorldFocus } from "./focus";
import { subsolarPoint, toLatLng, toVec3, type LatLng } from "./geo";
import { drawLand } from "./land";

// The 3D world behind every screen: a lit globe with rail lines, stations and moving trains.
// Built following the threejs-scene-setup and threejs-materials-lighting skills
// (.claude/skills): setAnimationLoop + Timer, capped pixel ratio, resize via the container,
// OrbitControls with damping, MeshStandardMaterial under a hemisphere fill + directional "sun".

export interface World3DProps {
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  focus: WorldFocus;
}

const R = 1; // globe radius
const TRACK_R = 1.004;
const TRAIN_R = 1.012;

/** Resolve a CSS custom property (which may be light-dark(), color-mix()…) to a concrete colour. */
function cssColor(name: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${name}, ${fallback})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

function theme() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    dark,
    bg: cssColor("--bg", dark ? "#000" : "#f2f2f7"),
    tint: cssColor("--tint", "#a65c0d"),
    label: cssColor("--label", dark ? "#fff" : "#000"),
    // Trains are the palette red: the one thing moving on the globe.
    train: "#ff101f",
    trainEdge: "#0d2423",
    // Oceans icy/frosted blue, land thistle.
    land: dark
      ? { ocean: "#0e2a33", land: "#3a3239", coast: "#5b4e58", grid: "#123540" }
      : { ocean: "#b2ddf7", land: "#cabac8", coast: "#a8959f", grid: "#9ccbe8" },
  };
}

/** Densely sampled great-circle arc as Vector3s at radius r. */
function arcPoints(a: LatLng, b: LatLng, r: number): THREE.Vector3[] {
  const steps = 48;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) pts.push(new THREE.Vector3(...toVec3(greatCircle(a, b, i / steps), r)));
  return pts;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export default function World3D({ stops, routes, trips, focus }: World3DProps) {
  const host = useRef<HTMLDivElement>(null);
  // The latest props, read by the render loop without restarting it.
  const latest = useRef({ stops, routes, trips, focus });
  latest.current = { stops, routes, trips, focus };
  const api = useRef<{ rebuild: () => void; refocus: () => void } | null>(null);

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
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    const labels = new CSS2DRenderer();
    labels.domElement.className = "world-labels";
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
    camera.position.set(...toVec3({ lat: 45, lng: 60 }, 3.2));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.25;
    controls.maxDistance = 4.5;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;

    // Light: soft sky/ground fill so the night side stays readable, plus the sun where it really is.
    const fill = new THREE.HemisphereLight(0xffffff, 0x445566, 1.1);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    scene.add(fill, sun);
    const placeSun = () => sun.position.set(...toVec3(subsolarPoint(new Date()), 10));
    placeSun();

    // Globe.
    let colors = theme();
    // Sharper coastlines where the GPU allows a 4096-wide texture.
    const texWidth = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048;
    const landTexture = new THREE.CanvasTexture(drawLand(colors.land, texWidth));
    landTexture.colorSpace = THREE.SRGBColorSpace;
    landTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshStandardMaterial({ map: landTexture, roughness: 0.95, metalness: 0 }),
    );
    // Canvas is equirectangular with lng -180 at u=0; rotate so lng 0 faces +z like toVec3.
    globe.rotation.y = -Math.PI / 2;
    scene.add(globe);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.015, 64, 32),
      new THREE.MeshBasicMaterial({ color: "#81d6e3", transparent: true, opacity: 0.12, side: THREE.BackSide }),
    );
    scene.add(atmosphere);

    const applyTheme = () => {
      colors = theme();
      scene.background = new THREE.Color(colors.bg);
      landTexture.image = drawLand(colors.land, texWidth);
      landTexture.needsUpdate = true;
      fill.intensity = colors.dark ? 0.7 : 1.1;
      rebuild();
    };

    // Network: lines, stations, labels, trains. Rebuilt when the data or theme changes.
    const network = new THREE.Group();
    const trainGroup = new THREE.Group();
    scene.add(network, trainGroup);
    const stopMeshes: THREE.Mesh[] = [];
    const stopLabels: { obj: CSS2DObject; normal: THREE.Vector3; highlight: boolean }[] = [];
    const trainMeshes = new Map<string, THREE.Mesh>();
    const trainGeometry = new THREE.BoxGeometry(0.026, 0.012, 0.012);
    const stationGeometry = new THREE.SphereGeometry(1, 16, 12);

    function dispose(group: THREE.Group) {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o.geometry !== trainGeometry && o.geometry !== stationGeometry) o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
        if (o instanceof CSS2DObject) o.element.remove();
      });
      group.clear();
    }

    function rebuild() {
      const { stops, routes, focus } = latest.current;
      dispose(network);
      stopMeshes.length = 0;
      stopLabels.length = 0;
      const lineMat = new THREE.MeshBasicMaterial({ color: colors.tint });
      for (const r of routes) {
        for (let i = 1; i < r.stops.length; i++) {
          const curve = new THREE.CatmullRomCurve3(arcPoints(r.stops[i - 1]!.coordinates, r.stops[i]!.coordinates, TRACK_R));
          network.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0028, 6, false), lineMat));
        }
      }
      for (const s of stops) {
        const hi = focus.highlight.includes(s.id);
        const m = new THREE.Mesh(
          stationGeometry,
          new THREE.MeshStandardMaterial({ color: hi ? colors.tint : colors.label, roughness: 0.6 }),
        );
        m.userData.base = hi ? 0.014 : 0.008;
        m.scale.setScalar(m.userData.base);
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
    }

    /** Markers keep a steady size on screen: smaller in world units as the camera comes closer. */
    function markerScale() {
      return THREE.MathUtils.clamp((camera.position.length() - R) / 2.2, 0.3, 1);
    }

    function syncTrains(now: number) {
      const { trips, focus } = latest.current;
      const seen = new Set<string>();
      for (const t of trips) {
        seen.add(t.id);
        let m = trainMeshes.get(t.id);
        if (!m) {
          m = new THREE.Mesh(trainGeometry, new THREE.MeshStandardMaterial({ color: colors.train, emissive: colors.train, emissiveIntensity: 0.35, roughness: 0.4 }));
          trainGroup.add(m);
          trainMeshes.set(t.id, m);
        }
        const p = trainPosition(t, now);
        m.position.set(...toVec3(p, TRAIN_R));
        // Point along the track, upright on the globe.
        const ahead = t.segment ? greatCircle(p, t.segment.to, 0.02) : p;
        m.up.copy(m.position).normalize();
        m.lookAt(new THREE.Vector3(...toVec3(ahead, TRAIN_R)));
        m.rotateY(Math.PI / 2);
        m.scale.setScalar((t.id === focus.follow ? 1.6 : 1) * markerScale());
      }
      for (const [id, m] of trainMeshes) {
        if (!seen.has(id)) {
          (m.material as THREE.Material).dispose();
          trainGroup.remove(m);
          trainMeshes.delete(id);
        }
      }
    }

    // Camera flights: to a point (station) or following a train.
    let flight: { from: THREE.Vector3; to: THREE.Vector3; t0: number; ms: number } | null = null;
    let lastInteraction = -Infinity; // nobody has touched the globe yet
    let waitingForTarget = false; // focus asked to follow a train we haven't seen yet
    controls.addEventListener("start", () => {
      lastInteraction = performance.now();
      flight = null;
    });
    function flyTo(at: LatLng, distance: number | null) {
      const d = distance ?? camera.position.length();
      const to = new THREE.Vector3(...toVec3(at, d));
      if (reduceMotion) {
        camera.position.copy(to);
        return;
      }
      flight = { from: camera.position.clone(), to, t0: performance.now(), ms: 1400 };
    }
    function followTarget(): LatLng | null {
      const { focus, trips } = latest.current;
      const t = focus.follow ? trips.find((x) => x.id === focus.follow) : null;
      return t ? trainPosition(t, Date.now()) : null;
    }
    function refocus() {
      const { focus } = latest.current;
      // The train to follow may not have loaded yet; try again once it has.
      waitingForTarget = !!focus.follow && !followTarget();
      const target = followTarget() ?? focus.center;
      if (target) flyTo(target, focus.distance);
      else if (focus.distance) flyTo(toLatLng(camera.position.toArray() as [number, number, number]), focus.distance);
      el!.setAttribute("aria-label", focus.label);
      rebuild();
    }

    // Clicks (not drags): a station, or a point on the globe.
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      down = null;
      const { focus } = latest.current;
      if (!focus.onStopClick && !focus.onMapClick) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      ray.params.Mesh = {};
      const hitStop = ray.intersectObjects(stopMeshes, false)[0];
      if (hitStop && focus.onStopClick) return focus.onStopClick(hitStop.object.userData.stopId as string);
      const hitGlobe = ray.intersectObject(globe, false)[0];
      if (hitGlobe && focus.onMapClick) focus.onMapClick(toLatLng(hitGlobe.point.toArray() as [number, number, number]));
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // Size to the container.
    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      // Centre the world in the space the panels leave free: right of the panel column on
      // wide screens, the top part of the screen on phones (panels slide up from below).
      if (w >= 900) camera.setViewOffset(w, h, -Math.min(492, w * 0.4) / 2, 0, w, h);
      else camera.setViewOffset(w, h, 0, h * 0.29, w, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labels.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", applyTheme);
    applyTheme();
    refocus();
    api.current = { rebuild, refocus };

    // Render loop.
    const timer = new THREE.Timer();
    timer.connect(document);
    let sunTick = 0;
    const camDir = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      timer.update();
      const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
      if (document.hidden) return;
      const now = performance.now();

      if (waitingForTarget && followTarget()) refocus();
      if (flight) {
        const k = Math.min(1, (now - flight.t0) / flight.ms);
        // Swing around the globe (slerp the direction), easing the distance.
        const dir = flight.from.clone().normalize().lerp(flight.to.clone().normalize(), ease(k)).normalize();
        const dist = THREE.MathUtils.lerp(flight.from.length(), flight.to.length(), ease(k));
        camera.position.copy(dir.multiplyScalar(dist));
        if (k >= 1) flight = null;
      } else {
        const target = followTarget();
        const idle = now - lastInteraction > 6000;
        if (target && idle) {
          // Drift gently after the train.
          const want = new THREE.Vector3(...toVec3(target, camera.position.length()));
          camera.position.lerp(want, Math.min(1, dt * 1.5)).setLength(want.length());
        } else if (!latest.current.focus.center && !target && idle && !reduceMotion) {
          // Nothing in particular to look at: turn the world slowly.
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.04);
        }
      }
      controls.update();

      if ((sunTick += dt) > 30) {
        sunTick = 0;
        placeSun();
      }
      syncTrains(Date.now());
      const k = markerScale();
      for (const m of stopMeshes) m.scale.setScalar((m.userData.base as number) * k);

      // Hide labels on the far side of the globe, and minor ones when zoomed out.
      camera.getWorldDirection(camDir);
      const far = camera.position.length() > 2.6;
      for (const l of stopLabels) {
        const facing = l.normal.dot(camera.position.clone().normalize()) > 0.25;
        l.obj.visible = facing && (l.highlight || !far);
      }

      renderer.render(scene, camera);
      labels.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      timer.dispose();
      ro.disconnect();
      mq.removeEventListener("change", applyTheme);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      dispose(network);
      for (const m of trainMeshes.values()) (m.material as THREE.Material).dispose();
      trainGeometry.dispose();
      stationGeometry.dispose();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      landTexture.dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      renderer.dispose();
      el.replaceChildren();
      api.current = null;
    };
  }, []);

  // Rebuild lines/stations when the network changes; refly when the focus changes.
  useEffect(() => api.current?.rebuild(), [stops, routes]);
  useEffect(() => api.current?.refocus(), [focus]);

  return <div ref={host} className="world" role="img" aria-label={focus.label} />;
}
