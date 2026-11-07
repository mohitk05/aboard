import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useMe } from "./auth";

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
    let retry = 0;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const refetch = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    const onEvent = (e: LiveEvent) => {
      switch (e.type) {
        case "hello":
          // Fresh connection: we may have missed events while away.
          if (retry > 0) refetch("trips", "me", "departures", "fellow", "conversations");
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
      ws = new WebSocket(`${proto}://${location.host}/api/live`);
      ws.onmessage = (m) => {
        if (m.data === "pong") return;
        try {
          onEvent(JSON.parse(m.data));
        } catch {
          /* ignore malformed */
        }
      };
      ws.onopen = () => {
        clearInterval(pingTimer);
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 30_000);
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (stopped) return;
        retry++;
        const wait = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)) * (0.75 + Math.random() * 0.5);
        reconnectTimer = setTimeout(connect, wait);
      };
    };

    connect();
    // Reconnect promptly when the tab comes back, rather than waiting out the backoff.
    const onVisible = () => {
      if (document.visibilityState === "visible" && ws?.readyState === WebSocket.CLOSED) {
        clearTimeout(reconnectTimer);
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
    // Reconnect when the signed-in user changes, so the server knows who to send messages to.
  }, [qc, userId]);
}
