// Thin client for the Worker API. The session lives in an HttpOnly cookie, so there is no
// token to store or attach: same-origin fetches send it automatically.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Aboard. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: string } | null;
  if (!res.ok || !json?.success) throw new ApiError(res.status, json?.error ?? "Something went wrong.");
  return json.data as T;
}

// ---------- shapes returned by the API ----------

/** Where a player is in a journey: see the traveller state machine (src/machines/traveller.ts). */
import type { TravellerState } from "../../src/machines/traveller";
export type UserState = TravellerState;

export interface Stop {
  id: string;
  name: string;
  country: string;
  coordinates: { lat: number; lng: number };
  dwellMinutes: number;
}

export interface Interest {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
}

export interface Me {
  id: string;
  username: string;
  email: string;
  age: number;
  role: 1 | 2;
  state: UserState;
  currentStop: string | null;
  ticket: string | null;
  image: string | null;
  profileMode: "PUBLIC" | "PRIVATE";
  interests: { id: string; name: string }[];
  journey: Journey | null;
}

export interface JourneyStop extends Stop {
  kmFromPrevious: number;
  eta: number | null;
  passed: boolean;
  current: boolean;
}

export interface Journey {
  ticket: { id: string; trip: string; from: string; to: string; desiredTo: string | null; price: number };
  line: string;
  train: string | null;
  trip: import("./world").Trip;
  from: Stop;
  to: Stop;
  fromIndex: number;
  toIndex: number;
  boardAt: number | null;
  arriveAt: number | null;
  kmToDestination: number;
  tripKm: number;
  stops: JourneyStop[];
}

export interface Departure {
  trip: import("./world").Trip;
  line: string;
  train: string | null;
  boardingNow: boolean;
  arrivalTime: number;
  departureTime: number;
  terminus: Stop;
  destinations: { stop: Stop; km: number; price: number; arrivalTime: number }[];
}

export const ADMIN_ROLE = 1;
