import { useEffect, useRef, useSyncExternalStore } from "react";
import type { LatLng } from "./geo";

/**
 * What the 3D world should show right now. There's one world behind every screen; each screen
 * says what it cares about (your station, your train…) and the camera flies there.
 */
export interface WorldFocus {
  /** Accessible name for the world view, e.g. "Map following your train". */
  label: string;
  /** Stations to emphasise. */
  highlight: string[];
  /** Keep this train in view as it moves. */
  follow: string | null;
  /** Look at this point… */
  center: LatLng | null;
  /** …from this far away (globe radius = 1). Null keeps the current distance. */
  distance: number | null;
  onStopClick?: (stopId: string) => void;
  onMapClick?: (at: LatLng) => void;
}

const DEFAULT: WorldFocus = { label: "Map of the rail network", highlight: [], follow: null, center: null, distance: null };

let current: WorldFocus = DEFAULT;
const listeners = new Set<() => void>();
const set = (f: WorldFocus) => {
  current = f;
  listeners.forEach((l) => l());
};

export function useCurrentFocus(): WorldFocus {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}

/** Point the world at something while this screen is shown. */
export function useWorldFocus(f: Partial<WorldFocus>) {
  // Click handlers change identity every render; keep the latest without re-focusing.
  const handlers = useRef({ onStopClick: f.onStopClick, onMapClick: f.onMapClick });
  handlers.current = { onStopClick: f.onStopClick, onMapClick: f.onMapClick };
  const key = JSON.stringify([f.label, f.highlight, f.follow, f.center, f.distance, !!f.onStopClick, !!f.onMapClick]);

  useEffect(() => {
    set({
      ...DEFAULT,
      ...f,
      highlight: f.highlight ?? [],
      onStopClick: f.onStopClick ? (id) => handlers.current.onStopClick?.(id) : undefined,
      onMapClick: f.onMapClick ? (at) => handlers.current.onMapClick?.(at) : undefined,
    });
    return () => set(DEFAULT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
