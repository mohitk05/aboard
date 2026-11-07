import { reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, bootstrapAdmin, worldStub } from "./helpers";

let admin: string;

beforeEach(async () => {
  await reset();
  admin = await bootstrapAdmin();
});

describe("demo seed", () => {
  it("builds the line, interests and a running train, and is safe to repeat", async () => {
    const first = await api("POST", "/admin/seed", { token: admin });
    expect(first.status).toBe(201);
    expect(first.data.stops).toBe(11);

    const again = await api("POST", "/admin/seed", { token: admin });
    expect(again.data.trip).toBe(first.data.trip);
    expect(again.data.route).toBe(first.data.route);

    expect((await api("GET", "/stop")).data).toHaveLength(11);
    expect((await api("GET", "/route")).data).toHaveLength(1);
    expect((await api("GET", "/interest")).data.length).toBeGreaterThanOrEqual(10);
    const trips = (await api("GET", "/trip?active=1")).data;
    expect(trips).toHaveLength(1);
    expect(trips[0].state).toBe("STATIONARY");
  });

  it("is admin only", async () => {
    expect((await api("POST", "/admin/seed")).status).toBe(401);
  });
});

describe("public world view", () => {
  it("lists routes and active trips without signing in", async () => {
    await api("POST", "/admin/seed", { token: admin });
    const routes = await api("GET", "/route");
    expect(routes.status).toBe(200);
    expect(routes.data[0].stops[0].name).toBe("Lisbon");
    const trips = await api("GET", "/trip?active=1");
    expect(trips.status).toBe(200);
  });

  it("lists vehicles for admins only", async () => {
    await api("POST", "/admin/seed", { token: admin });
    expect((await api("GET", "/vehicle")).status).toBe(401);
    expect((await api("GET", "/vehicle", { token: admin })).data[0].name).toBe("The Long Way");
  });
});

describe("trip timing data", () => {
  it("reports the segment and the moment its progress describes", async () => {
    const seeded = (await api("POST", "/admin/seed", { token: admin })).data;
    const before = (await api("GET", `/trip/${seeded.trip}`, { token: admin })).data;
    expect(before.segment.km).toBeGreaterThan(400);
    expect(before.segment.from).toEqual({ lat: 38.72, lng: -9.14 });
    expect(before).toMatchObject({ line: "Lisbon – Vladivostok", train: "The Long Way", lastStop: "Lisbon", nextStopName: "Madrid" });

    const w = worldStub();
    const t0 = Date.now();
    // Wait out the 30-minute dwell at Lisbon, then move once.
    for (let i = 1; i <= 7; i++) await w.tick(t0 + i * 5 * 60_000);
    const moving = (await api("GET", `/trip/${seeded.trip}`, { token: admin })).data;
    expect(moving.state).toBe("MOVING");
    expect(moving.asOf).toBe(t0 + 7 * 5 * 60_000);
    expect(moving.progress).toBeCloseTo((160 * 5) / 60, 5); // the demo sleeper: 160 km/h for one 5-minute tick
    // Next arrival is measured from asOf, not from "now".
    const kmLeft = moving.segment.km - moving.progress;
    expect(moving.nextStopArrival).toBeCloseTo(moving.asOf + (kmLeft / moving.speedKmh) * 3_600_000, -3);
  });
});

describe("placing a train", () => {
  it("puts a running train at a station or partway along, carrying its passengers", async () => {
    const seeded = (await api("POST", "/admin/seed", { token: admin })).data;
    const lisbon = (await api("GET", "/stop")).data.find((s: any) => s.name === "Lisbon").id;
    const username = `p${Date.now().toString(36)}`;
    const player = (
      await api("POST", "/user/signup", {
        body: { user: { username, email: `${username}@t.test`, password: "password123", age: 30, currentStop: lisbon } },
      })
    ).data;
    const route = (await api("GET", `/route/${seeded.route}`, { token: admin })).data;
    await api("POST", "/ticket/buy", {
      token: player.authToken,
      body: { ticket: { trip: seeded.trip, from: lisbon, to: route.stops[5].id } },
    });
    expect((await api("GET", "/user/me", { token: player.authToken })).data.state).toBe("ONBOARD");

    // 300 km past Paris.
    const moved = await api("POST", `/trip/${seeded.trip}/position`, { token: admin, body: { stopIndex: 2, km: 300 } });
    expect(moved.status).toBe(200);
    expect(moved.data).toMatchObject({ state: "MOVING", currentStopIndex: 2, progress: 300 });
    expect((await api("GET", "/user/me", { token: player.authToken })).data.currentStop).toBe(route.stops[2].id);

    // Too far is capped short of the next station; past the end is refused.
    const capped = (await api("POST", `/trip/${seeded.trip}/position`, { token: admin, body: { stopIndex: 2, km: 99_99 } })).data;
    expect(capped.progress).toBeLessThan(route.stops[3].kmFromPrevious);
    expect((await api("POST", `/trip/${seeded.trip}/position`, { token: admin, body: { stopIndex: 10, km: 5 } })).status).toBe(400);

    // At a station.
    const parked = (await api("POST", `/trip/${seeded.trip}/position`, { token: admin, body: { stopIndex: 4 } })).data;
    expect(parked).toMatchObject({ state: "STATIONARY", currentStopIndex: 4 });
    expect((await api("POST", `/trip/${seeded.trip}/position`, { body: { stopIndex: 1 } })).status).toBe(401);
  });
});

describe("train speed", () => {
  it("lets admins change a running train's speed, within bounds", async () => {
    const seeded = (await api("POST", "/admin/seed", { token: admin })).data;
    expect((await api("GET", `/trip/${seeded.trip}`, { token: admin })).data.speedKmh).toBe(160);
    const r = await api("PATCH", `/trip/${seeded.trip}`, { token: admin, body: { trip: { speedKmh: 450 } } });
    expect(r.status).toBe(200);
    expect(r.data.speedKmh).toBe(450);
    expect((await api("PATCH", `/trip/${seeded.trip}`, { token: admin, body: { trip: { speedKmh: 5000 } } })).status).toBe(400);
    expect((await api("PATCH", `/trip/${seeded.trip}`, { body: { trip: { speedKmh: 300 } } })).status).toBe(401);
  });
});
