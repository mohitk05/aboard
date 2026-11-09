import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, type Stop } from "./api";
import { usePollWhileOffline } from "./live";
import type { TripMotion } from "./lib/motion";

export interface RouteStop extends Stop {
  kmFromPrevious: number;
}

export interface Route {
  id: string;
  name: string;
  /** Set on a line's return twin (same stations, reversed): the line it runs back along. */
  returnOf: string | null;
  stops: RouteStop[];
  totalKm: number;
}

export interface Trip extends TripMotion {
  id: string;
  route: string;
  vehicle: string | null;
  active: boolean;
  currentStopIndex: number;
  currentStop: string;
  nextStop: string | null;
  nextStopArrival: number | null;
  currentStopTimestamp: number | null;
  line: string | null;
  train: string | null;
  lastStop: string;
  nextStopName: string | null;
}

export interface Vehicle {
  id: string;
  name: string;
  activeTrips: string[];
}

/** How often to re-check the world when the live connection is down. The server only moves trains every 5 minutes. */
const WORLD_REFRESH_MS = 60_000;

export const worldKeys = {
  stops: ["stops"] as const,
  routes: ["routes"] as const,
  trips: ["trips", "active"] as const,
};

export function useStops() {
  return useQuery({ queryKey: worldKeys.stops, queryFn: () => api<Stop[]>("GET", "/stop"), staleTime: 5 * 60_000 });
}

export function useRoutes() {
  return useQuery({ queryKey: worldKeys.routes, queryFn: () => api<Route[]>("GET", "/route"), staleTime: 5 * 60_000 });
}

export function useActiveTrips() {
  const poll = usePollWhileOffline(WORLD_REFRESH_MS);
  return useQuery({
    queryKey: worldKeys.trips,
    queryFn: () => api<Trip[]>("GET", "/trip?active=1"),
    refetchInterval: poll,
  });
}

const NONE: Route[] = [];

/**
 * Lines run both ways: each has a return twin (id + "~r") that trains switch to at the end of
 * the line. For display, a twin is the same line.
 */
export const lineId = (routeId: string) => (routeId.endsWith("~r") ? routeId.slice(0, -2) : routeId);

/** Everything the map needs. `routes` are the lines; `allRoutes` adds their return twins. */
export function useWorld() {
  const stops = useStops();
  const routes = useRoutes();
  const trips = useActiveTrips();
  const all = routes.data ?? NONE;
  // Memoised: a new array here would make the globe rebuild its whole network every render.
  const lines = useMemo(() => all.filter((r) => !r.returnOf), [all]);
  return {
    stops: stops.data ?? [],
    routes: lines,
    allRoutes: all,
    trips: trips.data ?? [],
    isPending: stops.isPending || routes.isPending || trips.isPending,
    error: stops.error ?? routes.error ?? trips.error,
  };
}

/** Average speed (km/h) of a new train; the server uses the same default. */
export { DEFAULT_SPEED_KMH } from "../../src/lib/constants";

/**
 * End-to-end time (hours) for a line: its length at the average speed of the trains running on
 * it (or the default speed if none are), plus the wait at every intermediate station.
 */
export function lineHours(route: Route, trips: Trip[], fallbackKmh: number): number {
  const running = trips.filter((t) => lineId(t.route) === route.id);
  const speed = running.length ? running.reduce((s, t) => s + t.speedKmh, 0) / running.length : fallbackKmh;
  const waits = route.stops.slice(1, -1).reduce((m, s) => m + s.dwellMinutes, 0) / 60;
  return route.totalKm / speed + waits;
}

// ---------- a station's boards and photo (public) ----------

export interface StationArrival {
  trip: string;
  line: string;
  train: string | null;
  speedKmh: number;
  from: string;
  previous: string;
  arrivalTime: number;
  arrived: boolean;
  terminates: boolean;
}
export interface StationDeparture {
  trip: string;
  line: string;
  train: string | null;
  speedKmh: number;
  to: string;
  next: string;
  departureTime: number;
  boarding: boolean;
}
export interface StationBoard {
  stop: Stop;
  arrivals: StationArrival[];
  departures: StationDeparture[];
}
export interface StopPhoto {
  url: string;
  width: number;
  height: number;
  title: string;
  page: string;
  source: string;
  credit: string | null;
  license: string | null;
}

export function useStationBoard(id: string) {
  const poll = usePollWhileOffline(60_000);
  return useQuery({
    queryKey: ["departures", "board", id], // refreshed on every world tick (live.ts)
    queryFn: () => api<StationBoard>("GET", `/stop/${id}/board`),
    refetchInterval: poll,
  });
}

export function useStopPhoto(id: string) {
  return useQuery({
    queryKey: ["stop", id, "photo"],
    queryFn: () => api<StopPhoto>("GET", `/stop/${id}/photo`),
    staleTime: Infinity,
    retry: false,
  });
}
