import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { live, type LiveEvent as ConnectionEvent, type LiveState } from "../../src/machines/live";
import { useMe } from "./auth";

// The connection's state, for the rest of the app (e.g. the "Reconnecting" note). It only ever
// changes through the live machine (src/machines/live.ts).
let connection: LiveState = live.def.initial;
let dropped = false; // has it gone down since the app started? (then the next "hello" refetches)
const watchers = new Set<() => void>();
function step(event: ConnectionEvent) {
  const to = live.next(connection, event);
  if (to === null) return; // not meaningful in this state (e.g. a late close after stopping)
  connection = to;
  if (to === "WAITING") dropped = true;
  watchers.forEach((w) => w());
}

/** CONNECTING, OPEN, WAITING (dropped, retrying) or STOPPED. */
export function useLiveStatus(): LiveState {
  return useSyncExternalStore(
    (w) => (watchers.add(w), () => watchers.delete(w)),
    () => connection,
  );
}

/**
 * How often a query should poll: every `ms` while the live connection is down, and not at all
 * while it's open, since then each world tick refreshes it (useLiveUpdates). Saves the server
 * (billed by rows read) from re-answering the same question every minute in every open tab.
 */
export function usePollWhileOffline(ms: number): number | false {
  return useLiveStatus() === "OPEN" ? false : ms;
}

type LiveEvent =
  | { type: "hello"; at: number }
  | { type: "tick"; at: number }
  | { type: "world"; at: number }
  | { type: "message"; conversation: string; from: string };

/**
 * One WebSocket to the World for the whole app. Events tell us what changed so we refetch
 * just that, straight away; the regular polling stays as a fallback if the socket drops.
 */
export function useLiveUpdates() {
  const qc = useQueryClient();
  const userId = useMe().data?.id ?? null;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false; // this run is over (sockets from it must not touch the shared state)
    let retry = 0; // consecutive failures, for the backoff
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const refetch = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    const onEvent = (e: LiveEvent) => {
      switch (e.type) {
        case "hello":
          // Back after a drop: we may have missed events while away.
          if (dropped) refetch("trips", "me", "departures", "fellow", "conversations");
          dropped = false;
          retry = 0;
          break;
        case "tick":
          refetch("trips", "me", "departures", "fellow");
          break;
        case "world":
          refetch("stops", "routes", "trips", "vehicles", "departures");
          break;
        case "message":
          qc.invalidateQueries({ queryKey: ["conversation", e.conversation] });
          refetch("conversations");
          break;
      }
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${proto}://${location.host}/api/live`);
      ws = socket;
      socket.onmessage = (m) => {
        if (stopped || m.data === "pong") return;
        try {
          onEvent(JSON.parse(m.data));
        } catch {
          /* ignore malformed */
        }
      };
      socket.onopen = () => {
        if (stopped) return;
        step("opened");
        clearInterval(pingTimer);
        pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send("ping"), 30_000);
      };
      socket.onclose = () => {
        clearInterval(pingTimer);
        if (stopped || ws !== socket) return; // stopped on purpose, or an old socket
        step("closed");
        retry++;
        const wait = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)) * (0.75 + Math.random() * 0.5);
        reconnectTimer = setTimeout(() => {
          step("retry");
          connect();
        }, wait);
      };
    };

    // (Re)start: a new user, or the app mounting.
    connection = "CONNECTING";
    watchers.forEach((w) => w());
    connect();
    // Reconnect promptly when the tab comes back, rather than waiting out the backoff.
    const onVisible = () => {
      if (document.visibilityState === "visible" && connection === "WAITING") {
        clearTimeout(reconnectTimer);
        step("wake");
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      step("stop");
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
    // Reconnect when the signed-in user changes, so the server knows who to send messages to.
  }, [qc, userId]);
}
