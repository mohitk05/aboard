import { useSyncExternalStore } from "react";

/** What's been clicked in the 3D world: a train, a line or a station, shown in the details panel. */
export type Selection = { kind: "train"; id: string } | { kind: "route"; id: string } | { kind: "stop"; id: string } | null;

let current: Selection = null;
const listeners = new Set<() => void>();

export function select(s: Selection) {
  // A line's return twin is the same line.
  current = s?.kind === "route" && s.id.endsWith("~r") ? { kind: "route", id: s.id.slice(0, -2) } : s;
  listeners.forEach((l) => l());
}

export function useSelection(): Selection {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}
