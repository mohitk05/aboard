import { SELF, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE, api, buildWorld } from "./helpers";

let admin: string;
let stops: { id: string; name: string }[];

beforeEach(async () => {
  await reset();
  ({ admin, stops } = await buildWorld());
});

/** A request as if from somewhere: Cloudflare puts the IP's approximate location in `cf`. */
function from(lat: number, lng: number, path: string, init: RequestInit = {}) {
  return SELF.fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    cf: { latitude: String(lat), longitude: String(lng) },
  } as RequestInit);
}

let n = 0;
const newUser = (extra: object = {}) => {
  const u = `loc${Date.now().toString(36)}${++n}`;
  return { user: { username: u, email: `${u}@t.test`, password: "password123", age: 30, ...extra } };
};

describe("starting near where you are", () => {
  it("finds the nearest station from the network location", async () => {
    const r = await (await from(50.1, 8.7, "/stop/nearest")).json<any>(); // Frankfurt
    expect(r.data.source).toBe("network");
    expect(r.data.stop.name).toBe("Berlin"); // ~420 km, a little nearer than Paris (~480 km)
    expect(r.data.km).toBeUndefined();
    expect(r.data.stop.km).toBeGreaterThan(400);
  });

  it("prefers the browser's coordinates when given", async () => {
    const r = await (await from(50.1, 8.7, "/stop/nearest?lat=55.0&lng=83.0")).json<any>(); // Novosibirsk
    expect(r.data).toMatchObject({ source: "browser", stop: { name: "Novosibirsk" } });
  });

  it("signs you up at the station nearest to you when you don't pick one", async () => {
    const res = await from(55.75, 37.6, "/user/signup", { method: "POST", body: JSON.stringify(newUser()) }); // Moscow
    expect(res.status).toBe(201);
    const me = ((await res.json()) as any).data.user;
    expect(me.currentStop).toBe(stops.find((s) => s.name === "Moscow")!.id);
  });

  it("still honours a station you chose", async () => {
    const res = await from(55.75, 37.6, "/user/signup", {
      method: "POST",
      body: JSON.stringify(newUser({ currentStop: stops[0]!.id })),
    });
    expect(((await res.json()) as any).data.user.currentStop).toBe(stops[0]!.id);
  });

  it("places an account with no station (like a new admin) nearest to it", async () => {
    expect((await api("GET", "/user/me", { token: admin })).data.currentStop).toBeNull();
    const res = await from(43.1, 131.9, "/user/me/locate", {
      method: "POST",
      headers: { Authorization: `Bearer ${admin}` },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.currentStop).toBe(stops.find((s) => s.name === "Vladivostok")!.id);
  });

  it("doesn't let players relocate themselves", async () => {
    const signup = await from(38.7, -9.1, "/user/signup", { method: "POST", body: JSON.stringify(newUser()) });
    const token = ((await signup.json()) as any).data.authToken;
    const res = await from(43.1, 131.9, "/user/me/locate", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "{}" });
    expect(res.status).toBe(403);
  });
});
