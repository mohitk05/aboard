import { useSyncExternalStore } from "react";

/** What's been clicked in the 3D world: a train or a line, shown in the details panel. */
export type Selection = { kind: "train"; id: string } | { kind: "route"; id: string } | null;

let current: Selection = null;
const listeners = new Set<() => void>();

export function select(s: Selection) {
  current = s;
  listeners.forEach((l) => l());
}

export function useSelection(): Selection {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}
