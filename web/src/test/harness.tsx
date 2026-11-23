// Lightweight integration tests: real screens, real react-query, real router, no browser and no
// server. `fakeServer` stands in for the Worker (api.ts is the only thing that calls fetch), and
// the 3D world is never mounted (it lives in WorldLayer, not in the screens). Each test file that
// renders React needs `// @vitest-environment jsdom` at the top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, vi } from "vitest";
import type { Departure, Journey, Me, Stop } from "../api";
import { meKey } from "../auth";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** What a handler returns: the `data` of a success, or `fail(status, message)`. */
export type Reply = unknown;
class Failure {
  constructor(
    readonly status: number,
    readonly error: string,
  ) {}
}
/** Answer a request the way the API does when it refuses. */
export const fail = (status: number, error: string) => new Failure(status, error);

export type Handler = (body: any) => Reply | Promise<Reply>;
export interface Call {
  method: string;
  path: string;
  body: any;
}

/**
 * Stub fetch with a table of "METHOD /path" -> handler (or a fixed reply). A route nobody
 * listed answers 404, like the real thing. `calls` is every request made, in order.
 */
export function fakeServer(routes: Record<string, Handler | object | string | number | null>) {
  const calls: Call[] = [];
  const table = new Map(Object.entries(routes));
  const fetchStub = async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const path = url.replace(/^\/api/, "");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    let reply: Reply;
    if (!table.has(key)) reply = fail(404, `No route: ${key}`);
    else {
      const h = table.get(key);
      reply = typeof h === "function" ? await (h as Handler)(body) : h;
    }
    const failure = reply instanceof Failure ? reply : null;
    return new Response(JSON.stringify(failure ? { success: false, error: failure.error } : { success: true, data: reply }), {
      status: failure ? failure.status : 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  vi.stubGlobal("fetch", fetchStub);
  return {
    calls,
    /** The requests made with this method and path, e.g. `server.to("POST", "/ticket/buy")`. */
    to: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path),
  };
}

/**
 * Render a screen at `route` (the screens are routed, so `path` says which route it answers).
 * Signed-in screens expect the player to be loaded already (App's Gate waits for it): pass
 * `signedIn` to start with them in the cache, as after that check.
 */
export function renderScreen(ui: ReactElement, { route = "/", path = "*", signedIn }: { route?: string; path?: string; signedIn?: Me } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  if (signedIn) client.setQueryData(meKey, signedIn);
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: [route] }, createElement(Routes, null, createElement(Route, { path, element: ui }))),
    ),
  );
}

// ---------- a little data, shaped like the API's ----------

export const stop = (name: string, country: string, id = name.toLowerCase()): Stop => ({
  id,
  name,
  country,
  coordinates: { lat: 0, lng: 0 },
  dwellMinutes: 5,
});

export const me = (over: Partial<Me> = {}): Me => ({
  id: "u1",
  username: "tester",
  email: "tester@example.test",
  age: 28,
  role: 2,
  state: "ATSTATION",
  currentStop: null,
  ticket: null,
  image: null,
  profileMode: "PUBLIC",
  interests: [],
  journey: null,
  ...over,
});

/** A departure from `here` on the line to `terminus`, calling at each of `to`. */
export function departure(trip: string, line: string, terminus: Stop, to: Stop[]): Departure {
  const now = Date.now();
  return {
    trip: { id: trip, route: `${trip}-route` } as Departure["trip"],
    line,
    train: "The Long Way",
    boardingNow: false,
    arrivalTime: now + 20 * 60_000,
    departureTime: now + 25 * 60_000,
    terminus,
    destinations: to.map((s, i) => ({ stop: s, km: 400 * (i + 1), price: 40 * (i + 1), arrivalTime: now + (60 + 30 * i) * 60_000 })),
  };
}

/** A ticket's journey, waiting on the platform at `from`. */
export function waitingJourney(from: Stop, to: Stop, line: string): Journey {
  const now = Date.now();
  return {
    ticket: { id: "tk1", trip: "trip1", from: from.id, to: to.id, desiredTo: null, price: 80 },
    line,
    train: "The Long Way",
    trip: { id: "trip1", state: "MOVING", currentStopIndex: 0 } as Journey["trip"],
    from,
    to,
    fromIndex: 0,
    toIndex: 1,
    boardAt: now + 20 * 60_000,
    arriveAt: now + 3 * 3_600_000,
    kmToDestination: 800,
    tripKm: 800,
    stops: [],
  };
}
