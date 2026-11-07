import { useQuery } from "@tanstack/react-query";
import { api, type Stop } from "./api";
import type { TripMotion } from "./lib/motion";

export interface RouteStop extends Stop {
  kmFromPrevious: number;
}

export interface Route {
  id: string;
  name: string;
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

/** How often to re-check the world. The server only moves trains every 5 minutes. */
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
  return useQuery({
    queryKey: worldKeys.trips,
    queryFn: () => api<Trip[]>("GET", "/trip?active=1"),
    refetchInterval: WORLD_REFRESH_MS,
  });
}

/** Everything the map needs. */
export function useWorld() {
  const stops = useStops();
  const routes = useRoutes();
  const trips = useActiveTrips();
  return {
    stops: stops.data ?? [],
    routes: routes.data ?? [],
    trips: trips.data ?? [],
    isPending: stops.isPending || routes.isPending || trips.isPending,
    error: stops.error ?? routes.error ?? trips.error,
  };
}
