import type { Stop } from "./api";
import { DEFAULT_SPEED_KMH } from "./world";

// The new-player tutorial (docs/PRD.md §7). The towns that "need bread" are the stations nearest
// to home, so it works in any world; how many people they are and how long they have left are
// tutorial figures until the game has towns that really run out of things.

export interface Town {
  stop: Stop;
  km: number;
  people: number;
  hoursLeft: number;
}

/** People and hours of bread left, from the nearest town outwards. */
const NEED = [
  { people: 4000, hoursLeft: 38 },
  { people: 2200, hoursLeft: 72 },
  { people: 6500, hoursLeft: 120 },
];

/** How many people one batch of bread feeds (24 loaves). */
export const FED_PER_BATCH = 240;

/** Great-circle distance in km. */
export function distanceKm(a: Stop["coordinates"], b: Stop["coordinates"]): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Every station but home, nearest first. */
function byDistance(stops: Stop[], homeId: string): { stop: Stop; km: number }[] {
  const home = stops.find((s) => s.id === homeId);
  if (!home) return [];
  return stops
    .filter((s) => s.id !== homeId)
    .map((stop) => ({ stop, km: distanceKm(home.coordinates, stop.coordinates) }))
    .sort((a, b) => a.km - b.km || a.stop.name.localeCompare(b.stop.name));
}

/** The tutorial's two places: where the ingredients are bought, and the towns that need the bread. */
export interface Plan {
  /** Where the first train goes: the nearest station, standing in for the station that sells the ingredients. */
  market: Stop;
  /** The towns that need bread, most urgent first: the next nearest stations. */
  towns: Town[];
}

/**
 * Berlin has no grain, so the first train goes to the nearest station (the market), and the bread
 * goes to the next nearest (the towns in need). In a world with only one other station it does
 * both jobs.
 */
export function tutorialPlan(stops: Stop[], homeId: string, townCount = 3): Plan | null {
  const ranked = byDistance(stops, homeId);
  const [first, ...rest] = ranked;
  if (!first) return null;
  const towns = (rest.length ? rest : [first]).slice(0, townCount).map((t, i) => ({ ...t, ...NEED[i]! }));
  return { market: first.stop, towns };
}

/** A rough travel time in ms at the average train speed, for before there is a real departure. */
export const travelMs = (km: number) => (km / DEFAULT_SPEED_KMH) * 3_600_000;

/** "38 h", "3 days": how long a town's bread lasts. */
export const formatHoursLeft = (hours: number) => (hours < 72 ? `${hours} h` : `${Math.round(hours / 24)} days`);

/** The radius (km) within which you're "the only supply line": round up to the next 100 km. */
export const supplyRadiusKm = (towns: Town[]) => Math.max(100, Math.ceil(Math.max(0, ...towns.map((t) => t.km)) / 100) * 100);
