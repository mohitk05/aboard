import { useQuery } from "@tanstack/react-query";
import { api, type Stop } from "../api";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * The browser's coordinates, but only if the person has already allowed location access:
 * we never pop a permission prompt just to place you. Otherwise null (the server then uses
 * the approximate location of your network).
 */
export async function grantedCoords(): Promise<LatLng | null> {
  try {
    if (!navigator.geolocation || !navigator.permissions) return null;
    const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (p.state !== "granted") return null;
    return await new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 600_000 },
      ),
    );
  } catch {
    return null;
  }
}

/** Ask for the browser's location (this may show a permission prompt). */
export function askCoords(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve(null),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  });
}

export interface Nearest {
  stop: Stop & { km: number | null };
  source: "browser" | "network" | "none";
}

export async function fetchNearest(at: LatLng | null): Promise<Nearest> {
  return api<Nearest>("GET", at ? `/stop/nearest?lat=${at.lat}&lng=${at.lng}` : "/stop/nearest");
}

/** The station nearest to this person, from the best location we can get without asking. */
export function useNearestStation() {
  return useQuery({
    queryKey: ["nearest-stop"],
    queryFn: async () => fetchNearest(await grantedCoords()),
    staleTime: 10 * 60_000,
    retry: false,
  });
}
