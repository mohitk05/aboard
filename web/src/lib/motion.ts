// Where is a train right now? The server moves trains once per world tick (5 minutes).
// Between ticks the client extrapolates from the last known state so trains glide
// instead of jumping 5 km at a time.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TripMotion {
  state: "MOVING" | "STATIONARY" | "IDLE";
  speedKmh: number;
  progress: number;
  asOf: number;
  position: LatLng;
  segment: { from: LatLng; to: LatLng; km: number } | null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Point a fraction `f` (0..1) of the way along the great circle from a to b. */
export function greatCircle(a: LatLng, b: LatLng, f: number): LatLng {
  const [φ1, λ1, φ2, λ2] = [rad(a.lat), rad(a.lng), rad(b.lat), rad(b.lng)];
  const d =
    2 *
    Math.asin(
      Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2),
    );
  if (d === 0) return { ...a };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: deg(Math.atan2(y, x)) };
}

/**
 * Points along the great circle a → b, with longitudes kept continuous (they may run past ±180)
 * so a line crossing the antimeridian draws the short way round.
 */
export function arc(a: LatLng, b: LatLng, steps = 32): [number, number][] {
  const pts: [number, number][] = [];
  let prev: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const p = greatCircle(a, b, i / steps);
    let lng = p.lng;
    if (prev !== null) {
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
    }
    prev = lng;
    pts.push([lng, p.lat]);
  }
  return pts;
}

/** km travelled along the current segment at time `now`, extrapolated from the last tick. */
export function kmAlong(trip: TripMotion, now: number): number {
  if (trip.state !== "MOVING" || !trip.segment) return 0;
  const elapsedH = Math.max(0, now - trip.asOf) / 3_600_000;
  return Math.min(trip.segment.km, trip.progress + trip.speedKmh * elapsedH);
}

/** Best estimate of where the train is at `now`. */
export function trainPosition(trip: TripMotion, now: number): LatLng {
  if (trip.state !== "MOVING" || !trip.segment) return trip.position;
  return greatCircle(trip.segment.from, trip.segment.to, kmAlong(trip, now) / trip.segment.km);
}
