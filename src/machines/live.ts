import { machine } from "./machine";

/**
 * The web app's live-updates connection (a WebSocket to /api/live). Held in memory by
 * web/src/live.ts; shown to the player while it's down.
 */
export const LIVE_STATES = ["CONNECTING", "OPEN", "WAITING", "STOPPED"] as const;
export type LiveState = (typeof LIVE_STATES)[number];
export type LiveEvent = "opened" | "closed" | "retry" | "wake" | "stop";

export const live = machine<LiveState, LiveEvent>({
  name: "Live connection",
  about:
    "The app's WebSocket for live updates. When it drops, the app retries with backoff (sooner when the tab comes back), keeps polling meanwhile, and refetches everything once it's back. Players see a small 'Reconnecting' note while it's down.",
  stored: "in memory, in web/src/live.ts",
  initial: "CONNECTING",
  states: {
    CONNECTING: { about: "Opening the socket.", on: { opened: "OPEN", closed: "WAITING", stop: "STOPPED" } },
    OPEN: { about: "Live: events arrive as they happen.", on: { closed: "WAITING", stop: "STOPPED" } },
    WAITING: { about: "Dropped; waiting out a backoff (1–30 s) before trying again.", on: { retry: "CONNECTING", wake: "CONNECTING", stop: "STOPPED" } },
    STOPPED: { about: "Closed on purpose (signed out, or the app unmounted)." },
  },
  events: {
    opened: "The socket opens",
    closed: "The socket closes or fails",
    retry: "The backoff is over",
    wake: "The tab becomes visible again",
    stop: "Close it for good",
  },
});
