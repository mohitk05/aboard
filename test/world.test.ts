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

    const w = worldStub();
    const t0 = Date.now();
    // Wait out the 30-minute dwell at Lisbon, then move once.
    for (let i = 1; i <= 7; i++) await w.tick(t0 + i * 5 * 60_000);
    const moving = (await api("GET", `/trip/${seeded.trip}`, { token: admin })).data;
    expect(moving.state).toBe("MOVING");
    expect(moving.asOf).toBe(t0 + 7 * 5 * 60_000);
    expect(moving.progress).toBeCloseTo(5, 5);
    // Next arrival is measured from asOf, not from "now".
    const kmLeft = moving.segment.km - moving.progress;
    expect(moving.nextStopArrival).toBeCloseTo(moving.asOf + (kmLeft / 60) * 3_600_000, -3);
  });
});
