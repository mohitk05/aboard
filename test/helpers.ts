import { SELF, env } from "cloudflare:test";

export const BASE = "https://aboard.test";

export async function api<T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; success: boolean; data: T; error?: string }> {
  const res = await SELF.fetch(BASE + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, ...json };
}

export const worldStub = () => env.WORLD.get(env.WORLD.idFromName("world"));

let n = 0;
export const unique = (prefix: string) => `${prefix}${++n}${Math.random().toString(36).slice(2, 6)}`;

/** Lisbon → Vladivostok, roughly the real overland line. */
export const LINE = [
  { name: "Lisbon", country: "Portugal", coordinates: { lat: 38.72, lng: -9.14 } },
  { name: "Madrid", country: "Spain", coordinates: { lat: 40.42, lng: -3.7 } },
  { name: "Paris", country: "France", coordinates: { lat: 48.86, lng: 2.35 } },
  { name: "Berlin", country: "Germany", coordinates: { lat: 52.52, lng: 13.4 } },
  { name: "Moscow", country: "Russia", coordinates: { lat: 55.76, lng: 37.62 } },
  { name: "Yekaterinburg", country: "Russia", coordinates: { lat: 56.84, lng: 60.61 } },
  { name: "Novosibirsk", country: "Russia", coordinates: { lat: 55.03, lng: 82.92 } },
  { name: "Irkutsk", country: "Russia", coordinates: { lat: 52.29, lng: 104.3 } },
  { name: "Khabarovsk", country: "Russia", coordinates: { lat: 48.48, lng: 135.08 } },
  { name: "Vladivostok", country: "Russia", coordinates: { lat: 43.12, lng: 131.89 } },
];

export async function bootstrapAdmin() {
  const r = await api("POST", "/admin/bootstrap", {
    headers: { "X-Admin-Secret": "test-admin-secret" },
    body: { user: { username: "admin", email: "admin@aboard.test", password: "admin-password", age: 30 } },
  });
  if (r.status !== 201) throw new Error(`bootstrap failed: ${r.status} ${r.error}`);
  return r.data.authToken as string;
}

/** Builds a world: an admin, the stops in LINE, and a route through them. */
export async function buildWorld() {
  const admin = await bootstrapAdmin();
  const stops = [];
  for (const s of LINE) stops.push((await api("POST", "/stop", { token: admin, body: { stop: s } })).data);
  const route = (await api("POST", "/route", { token: admin, body: { route: { name: "Lisbon–Vladivostok", stops: stops.map((s) => s.id) } } })).data;
  return { admin, stops, route };
}

/** The bootstrapped admin's token (see bootstrapAdmin). */
export async function adminToken() {
  const r = await api("POST", "/user/login", { body: { user: { email: "admin@aboard.test", password: "admin-password" } } });
  if (r.status !== 200) throw new Error(`admin login failed: ${r.status} ${r.error}`);
  return r.data.authToken as string;
}

/**
 * A new player. Players always start at home (Berlin); to start a test somewhere else, pass the
 * stop and the admin moves them there.
 */
export async function signup(currentStop?: string, extra: Record<string, unknown> = {}) {
  const username = unique("p");
  const r = await api("POST", "/user/signup", {
    body: { user: { username, email: `${username}@aboard.test`, password: "password123", age: 25, ...extra } },
  });
  if (r.status !== 201) throw new Error(`signup failed: ${r.status} ${r.error}`);
  const token = r.data.authToken as string;
  let user = r.data.user;
  if (currentStop && user.currentStop !== currentStop) {
    const placed = await api("POST", `/user/${user.id}/place`, { token: await adminToken(), body: { stop: currentStop } });
    if (placed.status !== 200) throw new Error(`placing failed: ${placed.status} ${placed.error}`);
    user = (await api("GET", "/user/me", { token })).data;
  }
  return { token, user };
}
