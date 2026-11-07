// Pure helpers for placing things on the globe (no three.js import, so they're cheap to test).

export interface LatLng {
  lat: number;
  lng: number;
}
export type Vec3 = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Point on a sphere of radius r. y is up (north pole), and longitude 0 faces +z. */
export function toVec3({ lat, lng }: LatLng, r = 1): Vec3 {
  const φ = rad(lat);
  const λ = rad(lng);
  return [r * Math.cos(φ) * Math.sin(λ), r * Math.sin(φ), r * Math.cos(φ) * Math.cos(λ)];
}

/** Inverse of toVec3 (for clicks on the globe). */
export function toLatLng([x, y, z]: Vec3): LatLng {
  const r = Math.hypot(x, y, z) || 1;
  return { lat: deg(Math.asin(y / r)), lng: deg(Math.atan2(x, z)) };
}

/**
 * Where the sun is overhead right now (approximate: good to a degree or so, plenty for lighting).
 * Declination from the day of the year; longitude from UTC time (noon at 0° → 0°).
 */
export function subsolarPoint(at: Date): LatLng {
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  const day = (at.getTime() - start) / 86_400_000;
  const lat = 23.44 * Math.sin((2 * Math.PI * (day - 81)) / 365);
  const hours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  let lng = -15 * (hours - 12);
  if (lng < -180) lng += 360;
  if (lng > 180) lng -= 360;
  return { lat, lng };
}
