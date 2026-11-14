import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { BATCHES_AHEAD, IDLE_WAIT_MS, chooseDeparture, plan, shortestPaths, target, wanted, type BotMarket, type BotView } from "../src/game/bot";
import { INDUSTRIES } from "../src/game/catalog";
import type { World } from "../src/world/world";
import { api, buildWorld, signup, worldStub } from "./helpers";

// ---------- the brain, on its own ----------

const offer = (good: any, price: number) => ({ good, base: price, load: 0, price });
const MARKETS: BotMarket[] = [
  { stopId: "home", sells: [], buys: [offer("chocolate", 8)] },
  { stopId: "dakar", sells: [offer("cocoa", 14)], buys: [] },
  { stopId: "saopaulo", sells: [offer("sugar", 6), offer("cocoa", 18)], buys: [] },
  { stopId: "amsterdam", sells: [offer("milk", 9)], buys: [offer("chocolate", 15)] },
  { stopId: "mumbai", sells: [offer("vanilla", 46)], buys: [] },
  { stopId: "dubai", sells: [], buys: [offer("chocolate", 18)] },
];
const KM: Record<string, number> = { home: 0, amsterdam: 600, dakar: 5000, saopaulo: 10000, mumbai: 7000, dubai: 4500 };

function view(over: Partial<BotView> = {}): BotView {
  const here = over.here ?? "home";
  return {
    now: 1_000_000,
    here,
    home: "home",
    balance: 5000,
    cargo: {},
    warehouse: {},
    cargoCapacity: 60,
    factories: [],
    markets: MARKETS,
    // Distances measured from home; from anywhere else, pretend it's the same plus the way back.
    km: (to) => (to === here ? 0 : (KM[to] ?? 0) + (KM[here] ?? 0)),
    ...over,
  };
}

describe("a bot's brain", () => {
  it("starts with the cheapest industry, and wants its materials plus a few batches' worth", () => {
    expect(target(view())).toBe("chocolate");
    const { build, recipe } = INDUSTRIES.chocolate;
    expect(wanted(view(), "chocolate")).toEqual({
      cocoa: build.materials.cocoa! + recipe.inputs.cocoa! * BATCHES_AHEAD,
      sugar: build.materials.sugar! + recipe.inputs.sugar! * BATCHES_AHEAD,
      milk: build.materials.milk! + recipe.inputs.milk! * BATCHES_AHEAD,
      vanilla: build.materials.vanilla! + recipe.inputs.vanilla! * BATCHES_AHEAD,
    });
    // Too poor for a factory: nothing to aim for yet.
    expect(target(view({ balance: 1500 }))).toBeNull();
  });

  it("rides out to the nearest market selling what it needs", () => {
    const p = plan(view());
    expect(p.steps).toEqual([{ do: "travel", to: "amsterdam" }]);
    expect(p.note).toMatch(/off to buy/);
  });

  it("each bot has its own temperament, so they don't all go the same way", () => {
    // Amsterdam (milk) and Dakar (cocoa) about as far away: bots differ on which comes first.
    const km = (to: string) => ({ home: 0, amsterdam: 600, dakar: 650 })[to as "home"] ?? 9000;
    const where = new Set(Array.from({ length: 20 }, (_, i) => (plan(view({ quirk: `bot-${i}`, km })).steps.at(-1) as any).to));
    expect(where.size).toBeGreaterThan(1);
    // The same bot always decides the same way.
    expect(plan(view({ quirk: "bot-1" }))).toEqual(plan(view({ quirk: "bot-1" })));
  });

  it("buys what it needs where it is, then goes on to the next source", () => {
    const p = plan(view({ here: "amsterdam" }));
    expect(p.steps[0]).toEqual({ do: "buy", good: "milk", qty: wanted(view(), "chocolate").milk });
    expect(p.steps.at(-1)).toEqual({ do: "travel", to: "dakar" });
  });

  it("goes home when the cargo is full", () => {
    const p = plan(view({ here: "dakar", cargo: { sugar: 30, milk: 30 } }));
    expect(p.steps).toEqual([{ do: "travel", to: "home" }]);
    expect(p.note).toMatch(/bringing materials home/);
  });

  it("at home: unloads, builds the factory and starts a batch", () => {
    const { build, recipe } = INDUSTRIES.chocolate;
    const cargo = Object.fromEntries(Object.entries(build.materials).map(([g, n]) => [g, n! + recipe.inputs[g as "cocoa"]!]));
    const p = plan(view({ cargo }));
    expect(p.steps.slice(0, 3)).toEqual([{ do: "unload" }, { do: "build", industry: "chocolate" }, { do: "produce", industry: "chocolate" }]);
  });

  it("takes products to the market that pays best for the trip, and sells there", () => {
    const factories = [{ industry: "chocolate" as const, readyAt: null }];
    const warehouse = { chocolate: 48, cocoa: 12, sugar: 6, milk: 6, vanilla: 3 };
    const out = plan(view({ factories, warehouse }));
    expect(out.steps).toContainEqual({ do: "load", good: "chocolate", qty: 48 });
    // Amsterdam pays 15 and is close; Dubai pays 18 but is 4,500 km away, which isn't worth it.
    expect(out.steps.at(-1)).toEqual({ do: "travel", to: "amsterdam" });
    // When the far market pays enough more, it's worth the ride.
    const rich = MARKETS.map((m) => (m.stopId === "dubai" ? { ...m, buys: [offer("chocolate", 30)] } : m));
    expect(plan(view({ factories, warehouse, markets: rich })).steps.at(-1)).toEqual({ do: "travel", to: "dubai" });

    const there = plan(view({ here: "dubai", factories, cargo: { chocolate: 48 } }));
    expect(there.steps[0]).toEqual({ do: "sell", good: "chocolate", qty: 48 });
    // Its warehouse is empty, so straight on to buy materials for the next batches.
    expect(there.note).toMatch(/^sold chocolate, off to buy/);
    expect(there.steps.at(-1)).toEqual({ do: "travel", to: "amsterdam" });
    // With the warehouse stocked, it heads home.
    const stocked = { cocoa: 12, sugar: 6, milk: 6, vanilla: 3 };
    expect(plan(view({ here: "dubai", factories, cargo: { chocolate: 48 }, warehouse: stocked })).steps.at(-1)).toEqual({ do: "travel", to: "home" });
  });

  it("sells where it is when nowhere else is better, whatever its temperament", () => {
    const factories = [{ industry: "chocolate" as const, readyAt: null }];
    const onlyAmsterdam = MARKETS.filter((m) => m.stopId !== "dubai");
    for (let i = 0; i < 50; i++) {
      const p = plan(view({ here: "amsterdam", factories, cargo: { chocolate: 24 }, markets: onlyAmsterdam, quirk: `bot-${i}` }));
      expect(p.steps[0]).toEqual({ do: "sell", good: "chocolate", qty: 24 });
      expect(p.steps).not.toContainEqual({ do: "travel", to: "amsterdam" });
    }
  });

  it("doesn't sell at home unless it's broke", () => {
    const factories = [{ industry: "chocolate" as const, readyAt: 2_000_000 }];
    expect(plan(view({ factories, warehouse: { chocolate: 5 } })).steps).not.toContainEqual(expect.objectContaining({ do: "sell" }));
    expect(plan(view({ factories, warehouse: { chocolate: 5 }, balance: 10 })).steps).toContainEqual({ do: "sell", good: "chocolate", qty: 5 });
  });

  it("waits at home for the next batch when there's nothing else to do", () => {
    const factories = [{ industry: "chocolate" as const, readyAt: 1_000_000 + 60_000 }];
    const warehouse = { cocoa: 12, sugar: 6, milk: 6, vanilla: 3 };
    expect(plan(view({ factories, warehouse, balance: 1000 })).steps).toEqual([{ do: "wait", until: 1_060_000 }]);
    expect(plan(view({ factories: [], balance: 100 })).steps).toEqual([{ do: "wait", until: 1_000_000 + IDLE_WAIT_MS }]);
  });

  it("finds the shortest way by rail, and the train that covers most of it", () => {
    const edges = new Map([
      ["a", [{ to: "b", km: 100 }, { to: "x", km: 50 }]],
      ["b", [{ to: "c", km: 100 }]],
      ["x", [{ to: "c", km: 500 }]],
    ]);
    const { dist, path } = shortestPaths(edges, "a");
    expect(dist.get("c")).toBe(200);
    expect(path("c")).toEqual(["a", "b", "c"]);
    expect(path("nowhere")).toBeNull();

    // Distances to c, from the reversed track.
    const back = new Map([
      ["b", [{ to: "a", km: 100 }]],
      ["c", [{ to: "b", km: 100 }, { to: "x", km: 500 }]],
      ["x", [{ to: "a", km: 50 }]],
    ]);
    const toC = shortestPaths(back, "c").dist;
    expect(Object.fromEntries(toC)).toEqual({ c: 0, b: 100, a: 200, x: 500 });

    const calls = (...stops: [string, number][]) => stops.map(([id, km]) => ({ stop: { id }, km }));
    const now = 0;
    const justB = { departureTime: now, destinations: calls(["b", 100]) };
    const through = { departureTime: now + 30 * 60_000, destinations: calls(["b", 100], ["c", 200]) };
    const viaX = { departureTime: now, destinations: calls(["x", 50], ["c", 550]) };
    // The through train, half an hour later, beats going partway now or the long way round.
    expect(chooseDeparture([justB, through, viaX], toC, "a", now)).toEqual({ departure: through, to: "c" });
    // Much later, it loses to a train that gets part of the way now.
    const lateThrough = { ...through, departureTime: now + 10 * 3_600_000 };
    expect(chooseDeparture([justB, lateThrough], toC, "a", now)).toEqual({ departure: justB, to: "b" });
    // Any train that brings you closer will do, even off the shortest path.
    expect(chooseDeparture([viaX], toC, "a", now)).toEqual({ departure: viaX, to: "c" });
    // But not one that takes you further away.
    expect(chooseDeparture([{ departureTime: now, destinations: calls(["x", 50]) }], toC, "a", now)).toBeNull();
  });
});

// ---------- a bot playing in a real world ----------

let admin: string;
let berlin: string;

beforeEach(async () => {
  await reset();
  const w = await buildWorld();
  admin = w.admin;
  berlin = w.stops.find((s: any) => s.name === "Berlin")!.id;
});

describe("bots in the world", () => {
  it("only admins manage bots, and only players can be bots", async () => {
    const { token, user } = await signup();
    expect((await api("POST", "/admin/bots", { token, body: { usernames: [user.username] } })).status).toBe(401);
    const r = await api("POST", "/admin/bots", { token: admin, body: { usernames: [user.username] } });
    expect(r.status, r.error).toBe(200);
    expect(r.data.changed).toEqual([user.username]);
    expect((await api("GET", "/admin/bots", { token: admin })).data).toEqual([expect.objectContaining({ username: user.username })]);
    expect((await api("POST", "/admin/bots", { token: admin, body: { usernames: ["admin"] } })).status).toBe(400);
    expect((await api("POST", "/admin/bots", { token: admin, body: { usernames: ["nobody"] } })).status).toBe(404);
    // Other players can tell.
    expect((await api("GET", `/user/${user.id}`, { token })).data.bot).toBe(true);
    // And people again.
    await api("POST", "/admin/bots", { token: admin, body: { usernames: [user.username], bot: false } });
    expect((await api("GET", "/admin/bots", { token: admin })).data).toEqual([]);
  });

  it("rides out for materials, builds a chocolate factory, makes chocolate and sells it", { timeout: 60_000 }, async () => {
    // A compact chocolate world: the market stations close to Berlin, on one line with fast trains
    // both ways, so a few days of world time pass in a few thousand ticks.
    const near = (name: string, country: string, dLng: number) => ({ name, country, coordinates: { lat: 52.5, lng: 13.4 + dLng } });
    const ids = [berlin];
    for (const s of [
      near("Amsterdam Centraal", "Netherlands", 2),
      near("Dakar Central", "Senegal", 4),
      near("São Paulo Luz", "Brazil", 6),
      near("Mumbai Terminus", "India", 8),
    ])
      ids.push((await api("POST", "/stop", { token: admin, body: { stop: s } })).data.id);
    const line = (await api("POST", "/route", { token: admin, body: { route: { name: "Chocolate run", stops: ids } } })).data;
    const back = (await api("GET", "/route")).data.find((r: any) => r.returnOf === line.id);
    for (const route of [line.id, line.id, back.id, back.id])
      expect((await api("POST", "/trip", { token: admin, body: { trip: { route, active: true, speedKmh: 600 } } })).status).toBe(201);

    const { token, user } = await signup();
    await api("POST", "/admin/bots", { token: admin, body: { usernames: [user.username] } });

    let sold = false;
    let ticks = 0;
    await runInDurableObject(worldStub(), (w: World) => {
      const start = Date.now();
      for (; ticks < 3000 && !sold; ticks++) {
        w.tick(start + ticks * 5 * 60_000);
        sold = (w as any).ctx.storage.sql.exec("SELECT 1 FROM ledger WHERE user_id = ? AND kind = 'sell'", user.id).toArray().length > 0;
      }
    });
    const game = (await api("GET", "/game", { token })).data;
    const ledger = (await runInDurableObject(worldStub(), (w: World) =>
      (w as any).ctx.storage.sql.exec("SELECT kind, note FROM ledger WHERE user_id = ? ORDER BY at, rowid", user.id).toArray(),
    )) as { kind: string; note: string }[];
    const kinds = new Set(ledger.map((l) => l.kind));
    expect(kinds, JSON.stringify(ledger.slice(-10))).toContain("fare");
    expect(kinds).toContain("buy");
    expect(game.factories.map((f: any) => f.industry)).toEqual(["chocolate"]);
    expect(kinds).toContain("produce");
    expect(sold).toBe(true);
    expect(ledger.find((l) => l.kind === "sell")!.note).toMatch(/Chocolate at Amsterdam Centraal/);

    // Admins can see what it's up to.
    const bots = (await api("GET", "/admin/bots", { token: admin })).data;
    expect(bots[0].note).toEqual(expect.any(String));
  });
});
