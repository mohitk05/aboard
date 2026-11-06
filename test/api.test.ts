import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { World } from "../src/world/world";
import { api, buildWorld, signup, unique, worldStub } from "./helpers";

let admin: string;
let stops: { id: string; name: string }[];
let route: { id: string; totalKm: number };

beforeEach(async () => {
  await reset();
  ({ admin, stops, route } = await buildWorld());
});

const newTrip = async (active = true) =>
  (await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active } } })).data;

describe("basics", () => {
  it("pings", async () => {
    expect((await api("GET", "/")).data).toBe("hello");
  });

  it("computes route distances in km", async () => {
    const r = (await api("GET", `/route/${route.id}`, { token: admin })).data;
    expect(r.stops.map((s: any) => s.name)).toEqual(stops.map((s) => s.name));
    expect(r.stops[0].kmFromPrevious).toBe(0);
    expect(r.totalKm).toBeGreaterThan(12_000);
    expect(r.totalKm).toBeLessThan(16_000);
  });

  it("rejects routes that repeat a stop", async () => {
    const r = await api("POST", "/route", { token: admin, body: { route: { name: "loop", stops: [stops[0]!.id, stops[1]!.id, stops[0]!.id] } } });
    expect(r.status).toBe(400);
  });

  it("autogenerates routes", async () => {
    const r = await api("POST", "/route/autogenerate", { token: admin, body: { config: { count: 3, minLength: 3, maxLength: 5 } } });
    expect(r.status).toBe(201);
    expect(r.data.length).toBeGreaterThan(0);
    for (const gen of r.data) expect(gen.stops.length).toBeGreaterThanOrEqual(3);
  });
});

describe("auth and security", () => {
  it("never stores plaintext passwords", async () => {
    const { user } = await signup(stops[0]!.id);
    const hash = await runInDurableObject(worldStub(), (_w: World, state) =>
      state.storage.sql.exec<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id).one().password_hash,
    );
    expect(hash).toMatch(/^pbkdf2\$/);
    expect(hash).not.toContain("password123");
  });

  it("logs in with the right password only", async () => {
    const { user } = await signup(stops[0]!.id);
    const good = await api("POST", "/user/login", { body: { user: { email: user.email, password: "password123" } } });
    expect(good.status).toBe(200);
    expect(good.data.authToken).toBeTruthy();
    const bad = await api("POST", "/user/login", { body: { user: { email: user.email, password: "nope" } } });
    expect(bad.status).toBe(401);
  });

  it("rejects query-operator payloads (the old NoSQL injection)", async () => {
    const r = await api("POST", "/user/login", { body: { user: { email: { $ne: null }, password: { $ne: null } } } });
    expect(r.status).toBe(400);
  });

  it("requires a token, and admin for admin routes", async () => {
    expect((await api("GET", `/stop/${stops[0]!.id}`)).status).toBe(401);
    const { token } = await signup(stops[0]!.id);
    expect((await api("GET", `/stop/${stops[0]!.id}`, { token })).status).toBe(200);
    expect((await api("POST", "/vehicle", { token, body: { vehicle: { name: "x" } } })).status).toBe(401);
  });

  it("only bootstraps one admin", async () => {
    const r = await api("POST", "/admin/bootstrap", {
      headers: { "X-Admin-Secret": "test-admin-secret" },
      body: { user: { username: "admin2", email: "a2@aboard.test", password: "admin-password", age: 30, currentStop: stops[0]!.id } },
    });
    expect(r.status).toBe(409);
  });

  it("hides email from other players", async () => {
    const a = await signup(stops[0]!.id);
    const b = await signup(stops[0]!.id);
    const seen = (await api("GET", `/user/${b.user.id}`, { token: a.token })).data;
    expect(seen.username).toBe(b.user.username);
    expect(seen.email).toBeUndefined();
    expect((await api("GET", "/user/me", { token: b.token })).data.email).toBe(b.user.email);
  });
});

describe("travel", () => {
  it("boards, rides and alights (the old boarding bug)", async () => {
    const trip = await newTrip(false);
    const { token, user } = await signup(stops[0]!.id);
    const ticket = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[0]!.id, to: stops[2]!.id } } });
    expect(ticket.status).toBe(201);
    expect(ticket.data.price).toBeGreaterThan(0);
    expect((await api("GET", "/user/me", { token })).data.state).toBe("READYTOGO");

    await api("POST", `/trip/${trip.id}/start`, { token: admin });
    const w = worldStub();
    await w.tick(Date.now());
    expect((await api("GET", "/user/me", { token })).data.state).toBe("ONBOARD");

    // Ride until the user has been set down.
    let me: any;
    for (let i = 0; i < 2_000; i++) {
      await w.tick(Date.now());
      me = (await api("GET", `/user/${user.id}`, { token })).data;
      if (me.state === "ATSTATION") break;
    }
    expect(me.state).toBe("ATSTATION");
    expect(me.currentStop).toBe(stops[2]!.id);
    expect(me.ticket).toBeNull();
  });

  it("boards immediately if the train is already waiting at the platform", async () => {
    const trip = await newTrip(true);
    const { token } = await signup(stops[0]!.id);
    await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[0]!.id, to: stops[1]!.id } } });
    expect((await api("GET", "/user/me", { token })).data.state).toBe("ONBOARD");
  });

  it("drops a ticket when the train leaves without you", async () => {
    const trip = await newTrip(true);
    const { token } = await signup(stops[1]!.id);
    await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[1]!.id, to: stops[2]!.id } } });
    // Push the train past Madrid without it stopping for passengers.
    await runInDurableObject(worldStub(), (_w: World, state) => {
      state.storage.sql.exec("UPDATE trips SET state = 'MOVING', stop_index = 1, progress = 1 WHERE id = ?", trip.id);
    });
    const summary = await worldStub().tick(Date.now());
    expect(summary.missed).toBe(1);
    const me = (await api("GET", "/user/me", { token })).data;
    expect(me.state).toBe("ATSTATION");
    expect(me.ticket).toBeNull();
  });

  it("validates tickets", async () => {
    const trip = await newTrip(true);
    const { token } = await signup(stops[1]!.id);
    const wrongStart = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[0]!.id, to: stops[2]!.id } } });
    expect(wrongStart.status).toBe(400);
    const backwards = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[1]!.id, to: stops[0]!.id } } });
    expect(backwards.status).toBe(400);
    const ok = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[1]!.id, to: stops[3]!.id } } });
    expect(ok.status).toBe(201);
    const twice = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[1]!.id, to: stops[3]!.id } } });
    expect(twice.status).toBe(409);
    expect((await api("DELETE", "/ticket", { token })).status).toBe(200);
    expect((await api("GET", "/user/me", { token })).data.state).toBe("ATSTATION");
  });

  it("lists incoming trains soonest first", async () => {
    const t1 = await newTrip(true);
    const { token } = await signup(stops[3]!.id);
    const r = (await api("GET", `/stop/${stops[3]!.id}/incoming-vehicles`, { token })).data;
    expect(r).toHaveLength(1);
    expect(r[0].trip.id).toBe(t1.id);
    expect(r[0].distanceKm).toBeGreaterThan(2_000);
    expect(r[0].arrivalTime).toBeGreaterThan(Date.now() + 24 * 3600_000);
  });

  it("runs Lisbon → Vladivostok at real-world pace (~10 days)", async () => {
    const trip = await newTrip(true);
    const ticks = await runInDurableObject(worldStub(), (w: World) => {
      let n = 0;
      const t0 = Date.now();
      while (w.getTrip(trip.id).ok && (w.getTrip(trip.id) as any).data.active && n < 10_000) {
        w.tick(t0 + n * 5 * 60_000);
        n++;
      }
      return n;
    });
    const days = (ticks * 5) / 60 / 24;
    expect(days).toBeGreaterThan(9);
    expect(days).toBeLessThan(12);
  });

  it("ticks on a Durable Object alarm once a trip starts", async () => {
    await newTrip(true);
    const alarm = await runInDurableObject(worldStub(), (_w: World, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
  });
});

describe("fellow travellers", () => {
  it("matches people at your stop by shared interests, keeping minors separate", async () => {
    const mk = async (name: string) => (await api("POST", "/interest", { token: admin, body: { interest: { name } } })).data.id;
    const [trains, tea, chess] = [await mk("Trains"), await mk("Tea"), await mk("Chess")];
    const here = stops[4]!.id;
    const me = await signup(here, { interests: [trains, tea] });
    const close = await signup(here, { interests: [trains, tea] });
    const partial = await signup(here, { interests: [tea, chess] });
    await signup(here, { interests: [chess] }); // nothing in common
    await signup(here, { interests: [trains, tea], age: 15 }); // minor
    await signup(here, { interests: [trains, tea], profileMode: "PRIVATE" });
    await signup(stops[5]!.id, { interests: [trains, tea] }); // elsewhere

    const r = (await api("GET", "/user/fellow-users", { token: me.token })).data;
    expect(r.map((m: any) => m.user.id)).toEqual([close.user.id, partial.user.id]);
    expect(r[0].score).toBe(100);
    expect(r[1].score).toBe(50);
  });
});

describe("messaging", () => {
  it("lets members talk and keeps others out", async () => {
    const a = await signup(stops[0]!.id);
    const b = await signup(stops[0]!.id);
    const outsider = await signup(stops[0]!.id);
    const conv = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [b.user.id] } } })).data;
    expect(conv.members).toHaveLength(2);
    await api("POST", `/conversation/${conv.id}/messages`, { token: a.token, body: { message: { body: "Tea at Irkutsk?" } } });
    const msgs = (await api("GET", `/conversation/${conv.id}/messages`, { token: b.token })).data;
    expect(msgs[0].content.body).toBe("Tea at Irkutsk?");
    expect((await api("GET", `/conversation/${conv.id}/messages`, { token: outsider.token })).status).toBe(403);
  });
});

describe("validation", () => {
  it("rejects bad input with 400", async () => {
    const username = unique("v");
    const r = await api("POST", "/user/signup", { body: { user: { username, email: "not-an-email", password: "x", age: 5, currentStop: stops[0]!.id } } });
    expect(r.status).toBe(400);
    expect((await api("GET", "/trip/not-a-uuid", { token: admin })).status).toBe(404);
  });
});
