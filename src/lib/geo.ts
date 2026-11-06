import { RAIL_DETOUR_FACTOR } from "./constants";

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. Handles the antimeridian correctly. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Approximate track distance between two stops, in km (rounded to 0.1). */
export function railKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * RAIL_DETOUR_FACTOR * 10) / 10;
}
