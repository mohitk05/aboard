import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { badgesFor, levelFor, regionOf } from "../src/game/travels";
import { MIGRATIONS } from "../src/world/schema";
import type { World } from "../src/world/world";
import { api, buildWorld, signup, worldStub } from "./helpers";

let admin: string;
let stops: { id: string; name: string }[];
let route: { id: string };
const id = (name: string) => stops.find((s) => s.name === name)!.id;

beforeEach(async () => {
  await reset();
  ({ admin, stops, route } = await buildWorld());
});

const sql = (q: string, ...args: unknown[]) => runInDurableObject(worldStub(), (w: World) => (w as any).ctx.storage.sql.exec(q, ...args).toArray());
const travels = (token: string, userId: string) => api("GET", `/user/${userId}/travels`, { token });
const tick = () => runInDurableObject(worldStub(), (w: World) => void w.tick(Date.now()));

describe("travel badges, on their own", () => {
  it("puts stations in regions, Russia either side of the Urals", () => {
    expect(regionOf("Germany", 13)).toBe("Europe");
    expect(regionOf("Russia", 37.6)).toBe("Europe"); // Moscow
    expect(regionOf("Russia", 104)).toBe("Asia"); // Irkutsk
    expect(regionOf("French Polynesia", -149)).toBe("Oceania");
    expect(regionOf("Atlantis", 0)).toBeNull();
  });

  it("levels up with places been to", () => {
    expect(levelFor(1)).toEqual({ name: "Newcomer", rank: 1, next: { name: "Day-tripper", places: 3 } });
    expect(levelFor(3).name).toBe("Day-tripper");
    expect(levelFor(24)).toMatchObject({ name: "Voyager", next: { name: "Globetrotter", places: 25 } });
    expect(levelFor(80)).toMatchObject({ name: "Rail Legend", rank: 6, next: null });
  });

  it("earns badges for areas, distance and lines, with progress towards the rest", () => {
    const b = badgesFor({ places: 4, lines: 6, km: 12_000, regions: { Europe: 3, Asia: 1 } });
    const get = (id: string) => b.find((x) => x.id === id)!;
    expect(get("region-europe")).toMatchObject({ earned: true });
    expect(get("region-africa")).toMatchObject({ earned: false, progress: { have: 0, need: 1 } });
    expect(get("region-all")).toMatchObject({ earned: false, progress: { have: 2, need: 7 } });
    expect(get("km-10000")).toMatchObject({ earned: true });
    expect(get("km-earth")).toMatchObject({ earned: false, progress: { have: 12_000, need: 40_075 } });
    expect(get("lines-5")).toMatchObject({ earned: true });
    expect(get("lines-15")).toMatchObject({ earned: false, progress: { have: 6, need: 15 } });
  });
});

describe("travel records", () => {
  it("counts where you got off and the line you rode, not the stations you passed", async () => {
    const { token, user } = await signup(); // starts in Berlin
    let t = (await travels(token, user.id)).data;
    expect(t).toMatchObject({ places: 1, lines: 0, km: 0, level: { name: "Newcomer" } });
    expect(t.placesList.map((p: any) => p.stop.name)).toEqual(["Berlin"]);

    // Berlin → Novosibirsk, through Moscow and Yekaterinburg.
    const trip = (await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active: true } } })).data;
    await api("POST", `/trip/${trip.id}/position`, { token: admin, body: { stopIndex: 3, km: 0 } }); // at Berlin
    const ticket = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: id("Berlin"), to: id("Novosibirsk") } } });
    expect(ticket.status, ticket.error).toBe(201);
    await api("POST", `/trip/${trip.id}/position`, { token: admin, body: { stopIndex: 4, km: 0 } }); // passing Moscow
    await tick();
    await api("POST", `/trip/${trip.id}/position`, { token: admin, body: { stopIndex: 6, km: 0 } }); // at Novosibirsk
    await tick();
    expect((await api("GET", "/user/me", { token })).data.state).toBe("ATSTATION");

    t = (await travels(token, user.id)).data;
    expect(t.placesList.map((p: any) => p.stop.name)).toEqual(["Berlin", "Novosibirsk"]);
    expect(t).toMatchObject({ places: 2, lines: 1, km: Math.round(ticket.data.price * 100) });
    expect(t.linesList).toEqual([{ id: route.id, name: "Lisbon–Vladivostok", times: 1 }]);
    expect(t.regions.find((r: any) => r.region === "Asia")).toEqual({ region: "Asia", places: 1 }); // Novosibirsk
    expect(t.badges.find((b: any) => b.id === "region-asia").earned).toBe(true);
  });

  it("shows a public traveller's level and travels to others; a private one's only to themselves", async () => {
    const a = await signup();
    const b = await signup(undefined, { profileMode: "PRIVATE" });
    expect((await api("GET", `/user/${a.user.id}`, { token: b.token })).data.level).toBe("Newcomer");
    expect((await travels(b.token, a.user.id)).status).toBe(200);
    expect((await api("GET", `/user/${b.user.id}`, { token: a.token })).data.level).toBeNull();
    const hidden = await travels(a.token, b.user.id);
    expect(hidden.status).toBe(403);
    expect(hidden.error).toBe("This traveller keeps their travels private.");
    expect((await travels(b.token, b.user.id)).status).toBe(200);
    expect((await travels(admin, b.user.id)).status).toBe(200);
  });

  it("works out history from old tickets: ridden ones count; cancelled and missed ones don't", async () => {
    // Run the backfill in migration 12 on a hand-made past: rebuild the travel tables empty, then
    // re-run its history part.
    const { user } = await signup();
    const trip = (await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active: true } } })).data;
    const ticket = (n: number, from: string, to: string, price: number) =>
      sql(
        "INSERT INTO tickets (id, user_id, trip_id, from_stop_id, to_stop_id, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        `t${n}`,
        user.id,
        trip.id,
        id(from),
        id(to),
        price,
        1000 + n,
      );
    await ticket(1, "Berlin", "Moscow", 16); // ridden: next seen in Moscow
    await ticket(2, "Moscow", "Irkutsk", 50); // cancelled: next seen in Moscow again
    await ticket(3, "Moscow", "Novosibirsk", 40); // ridden: now in Novosibirsk
    await sql("UPDATE users SET current_stop_id = ?, ticket_id = NULL WHERE id = ?", id("Novosibirsk"), user.id);
    await sql("DELETE FROM visits");
    await sql("DELETE FROM rides");
    await sql("UPDATE users SET km_travelled = 0");
    const backfill = MIGRATIONS[11]!.slice(MIGRATIONS[11]!.indexOf("CREATE TABLE _journeys"));
    await runInDurableObject(worldStub(), (w: World) => void (w as any).ctx.storage.sql.exec(backfill));

    const t = (await travels(admin, user.id)).data;
    expect(t.placesList.map((p: any) => p.stop.name).sort()).toEqual(["Berlin", "Moscow", "Novosibirsk"]);
    expect(t.km).toBe(1600 + 4000);
    expect(t.linesList).toEqual([{ id: route.id, name: "Lisbon–Vladivostok", times: 2 }]);
  });
});
