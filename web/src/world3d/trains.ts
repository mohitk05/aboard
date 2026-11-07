import * as THREE from "three";
import { greatCircle, kmAlong } from "../lib/motion";
import type { Route, Trip } from "../world";
import { toVec3, type LatLng } from "./geo";

// Realistic trains: a locomotive and carriages that follow the curve of the line. Cars are built
// along +z (front) so Object3D.lookAt points them down the track; one unit = one car length.

export const CARS = 6; // locomotive + 5 carriages
const GAP = 0.06; // between cars, in car lengths
const EARTH_KM = 6371;

function sideTexture(kind: "loco" | "carriage"): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const w = 512;
  const h = 128;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const paint = make();
  const glow = make();
  const p = paint.getContext("2d")!;
  const g = glow.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);

  if (kind === "loco") {
    p.fillStyle = "#d9302a"; // system red, as deep gloss paint
    p.fillRect(0, 0, w, h);
    p.fillStyle = "#f2f4f6";
    p.fillRect(0, h * 0.7, w, h * 0.08); // white waist stripe
    p.fillStyle = "#1b2a2e";
    p.fillRect(w * 0.82, h * 0.18, w * 0.14, h * 0.3); // cab side window
    g.fillStyle = "#3a3020";
    g.fillRect(w * 0.82, h * 0.18, w * 0.14, h * 0.3);
  } else {
    p.fillStyle = "#d9dee3"; // brushed silver
    p.fillRect(0, 0, w, h);
    p.fillStyle = "#e09a3a"; // amber stripe (the app's tint)
    p.fillRect(0, h * 0.72, w, h * 0.1);
    p.fillStyle = "#1e2b30";
    g.fillStyle = "#ffd9a0";
    for (let i = 0; i < 9; i++) {
      const x = w * (0.05 + i * 0.1);
      p.fillRect(x, h * 0.2, w * 0.07, h * 0.32);
      g.fillRect(x, h * 0.2, w * 0.07, h * 0.32);
    }
  }
  const t = (c: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return { map: t(paint), glow: t(glow) };
}

/** Shared geometry and materials for every train. */
export function createTrainKit() {
  const loco = sideTexture("loco");
  const carriage = sideTexture("carriage");
  const paint = (side: { map: THREE.Texture; glow: THREE.Texture }) =>
    new THREE.MeshStandardMaterial({ map: side.map, emissiveMap: side.glow, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.45, roughness: 0.35 });
  const locoSide = paint(loco);
  const carriageSide = paint(carriage);
  const roofGrey = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.5, roughness: 0.4 });
  const locoRed = new THREE.MeshStandardMaterial({ color: 0xd9302a, metalness: 0.45, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f22, metalness: 0.3, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f1a1e, metalness: 0.9, roughness: 0.1 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });

  const body = new THREE.BoxGeometry(0.26, 0.24, 1);
  const roof = new THREE.CylinderGeometry(0.13, 0.13, 0.98, 16).rotateX(Math.PI / 2).translate(0, 0.12, 0);
  const bogie = new THREE.BoxGeometry(0.22, 0.06, 0.2);
  const nose = new THREE.SphereGeometry(1, 20, 14).scale(0.13, 0.17, 0.3).translate(0, 0.02, 0.48);
  const screen = new THREE.BoxGeometry(0.2, 0.08, 0.02).rotateX(-0.6).translate(0, 0.13, 0.62);
  const light = new THREE.SphereGeometry(0.025, 8, 6);

  // Box faces: +x, -x, +y, -y, +z, -z → sides get the livery, the rest plain.
  const carMats = [carriageSide, carriageSide, roofGrey, dark, roofGrey, roofGrey];
  const locoMats = [locoSide, locoSide, locoRed, dark, locoRed, locoRed];

  function car(isLoco: boolean): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(body, isLoco ? locoMats : carMats));
    g.add(new THREE.Mesh(roof, isLoco ? locoRed : roofGrey));
    for (const z of [-0.32, 0.32]) {
      const b = new THREE.Mesh(bogie, dark);
      b.position.set(0, -0.15, z);
      g.add(b);
    }
    if (isLoco) {
      g.add(new THREE.Mesh(nose, locoRed));
      g.add(new THREE.Mesh(screen, glass));
      for (const x of [-0.07, 0.07]) {
        const l = new THREE.Mesh(light, lamp);
        l.position.set(x, -0.04, 0.76);
        g.add(l);
      }
    }
    return g;
  }

  function train(tripId: string): THREE.Group {
    const t = new THREE.Group();
    t.userData.tripId = tripId;
    for (let i = 0; i < CARS; i++) {
      const c = car(i === 0);
      c.userData.tripId = tripId;
      c.traverse((o) => (o.userData.tripId = tripId));
      t.add(c);
    }
    return t;
  }

  /** Windows glow at night: set from how dark it is where the train is (0 day … 1 night). */
  function setNight(n: number) {
    locoSide.emissiveIntensity = carriageSide.emissiveIntensity = 0.15 + 1.1 * n;
  }

  function dispose() {
    for (const tex of [loco.map, loco.glow, carriage.map, carriage.glow]) tex.dispose();
    for (const m of [locoSide, carriageSide, roofGrey, locoRed, dark, glass, lamp]) m.dispose();
    for (const geo of [body, roof, bogie, nose, screen, light]) geo.dispose();
  }

  return { train, setNight, dispose };
}

/** Distance (km) along the whole route from its first station to the train's head, right now. */
function headKm(trip: Trip, route: Route, now: number): number {
  let km = 0;
  for (let i = 1; i <= trip.currentStopIndex; i++) km += route.stops[i]!.kmFromPrevious;
  return km + kmAlong(trip, now);
}

/** A point `km` along the route; beyond either end it continues along the end segment's circle. */
function pointAlong(route: Route, km: number): LatLng {
  const s = route.stops;
  let acc = 0;
  for (let i = 1; i < s.length; i++) {
    const seg = s[i]!.kmFromPrevious;
    if (km <= acc + seg || i === s.length - 1) {
      const f = seg > 0 ? (km - acc) / seg : 0;
      return greatCircle(s[i - 1]!.coordinates, s[i]!.coordinates, f);
    }
    acc += seg;
  }
  return s[0]!.coordinates;
}

/**
 * Place every car of a train along its route. `carLength` is in world units (globe radius 1);
 * cars are exaggerated in size so they're visible from orbit, but they still follow the track.
 */
export function poseTrain(group: THREE.Group, trip: Trip, route: Route | undefined, now: number, carLength: number, radius: number) {
  const step = carLength * (1 + GAP) * EARTH_KM;
  const lenKm = carLength * EARTH_KM;
  const head = route ? headKm(trip, route, now) : 0;
  const lift = radius + carLength * 0.21; // sit on the rails, not inside the planet
  const front = new THREE.Vector3();
  const back = new THREE.Vector3();
  group.children.forEach((car, i) => {
    const fKm = head - i * step;
    const f = route ? pointAlong(route, fKm) : trip.position;
    const b = route ? pointAlong(route, fKm - lenKm) : trip.position;
    front.set(...toVec3(f, lift));
    back.set(...toVec3(b, lift));
    car.position.copy(front).add(back).multiplyScalar(0.5);
    car.up.copy(car.position).normalize();
    car.lookAt(front);
    car.scale.setScalar(carLength);
  });
}
