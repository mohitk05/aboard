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

export type UserState = "ATSTATION" | "READYTOGO" | "ONBOARD";

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
}

export const ADMIN_ROLE = 1;
