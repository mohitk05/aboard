import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { CARGO_CAPACITY, INDUSTRIES, MARKETS, priceAt } from "../src/game/catalog";
import type { World } from "../src/world/world";
import { api, buildWorld, signup, worldStub } from "./helpers";

let admin: string;
let berlin: string;
const at: Record<string, string> = {};

// Market stations for the chocolate factory (see src/game/catalog.ts), on top of the test line.
const MARKET_STOPS = [
  { name: "Dakar Central", country: "Senegal", coordinates: { lat: 14.67, lng: -17.43 } },
  { name: "São Paulo Luz", country: "Brazil", coordinates: { lat: -23.53, lng: -46.64 } },
  { name: "Amsterdam Centraal", country: "Netherlands", coordinates: { lat: 52.38, lng: 4.9 } },
  { name: "Papeete Central", country: "French Polynesia", coordinates: { lat: -17.54, lng: -149.57 } },
];

beforeEach(async () => {
  await reset();
  const w = await buildWorld();
  admin = w.admin;
  berlin = w.stops.find((s: any) => s.name === "Berlin")!.id;
  for (const s of MARKET_STOPS) at[s.name] = (await api("POST", "/stop", { token: admin, body: { stop: s } })).data.id;
});

const price = (stop: string, good: string, side: "sells" | "buys") =>
  priceAt((MARKETS[stop] as any)[side][good], stop, good as any, Date.now());
const moveTo = (userId: string, stop: string) => api("POST", `/user/${userId}/place`, { token: admin, body: { stop } });
const game = (token: string) => api("GET", "/game", { token }).then((r) => r.data);

/** Fill a player's warehouse in Berlin: buy each good where it's sold, then go home and unload. */
async function stock(token: string, userId: string, goods: Record<string, number>) {
  const where: Record<string, string> = { cocoa: "Dakar Central", sugar: "São Paulo Luz", milk: "Amsterdam Centraal", vanilla: "Papeete Central" };
  for (const [good, qty] of Object.entries(goods)) {
    await moveTo(userId, at[where[good]!]!);
    const r = await api("POST", "/game/buy", { token, body: { good, qty } });
    expect(r.status, r.error).toBe(200);
  }
  await moveTo(userId, berlin);
  expect((await api("POST", "/game/unload", { token })).status).toBe(200);
}

describe("the industry game", () => {
  it("lists the markets that exist in this world, with Berlin buying products as home", async () => {
    const c = (await api("GET", "/game/catalog")).data;
    expect(c.home.name).toBe("Berlin");
    expect(c.industries.map((i: any) => i.id)).toEqual(["chocolate", "batteries", "chips"]);
    const names = c.markets.map((m: any) => m.stop.name).sort();
    expect(names).toEqual(["Amsterdam Centraal", "Berlin", "Dakar Central", "Papeete Central", "São Paulo Luz"]);
    const home = c.markets.find((m: any) => m.stop.name === "Berlin");
    expect(home.sells).toEqual([]);
    expect(home.buys.map((b: any) => b.good).sort()).toEqual(["batteries", "chips", "chocolate"]);
  });

  it("buys raw materials where they're sold, into your cargo", async () => {
    const { token, user } = await signup();
    expect((await game(token)).atHome).toBe(true);

    // Berlin doesn't sell cocoa.
    expect((await api("POST", "/game/buy", { token, body: { good: "cocoa", qty: 1 } })).status).toBe(400);

    await moveTo(user.id, at["Dakar Central"]!);
    const r = await api("POST", "/game/buy", { token, body: { good: "cocoa", qty: 10 } });
    expect(r.status).toBe(200);
    expect(r.data.cargo).toEqual({ cocoa: 10 });
    expect(r.data.balance).toBe(5000 - 10 * price("Dakar Central", "cocoa", "sells"));
    expect(r.data.ledger[0]).toMatchObject({ kind: "buy", note: "10 × Cocoa beans at Dakar Central" });
    expect(r.data.atHome).toBe(false);

    // There's only so much you can carry.
    const tooMuch = await api("POST", "/game/buy", { token, body: { good: "cocoa", qty: CARGO_CAPACITY } });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.error).toMatch(`${CARGO_CAPACITY - 10} more`);
  });

  it("won't let you spend money you don't have", async () => {
    const { token, user } = await signup();
    await api("POST", `/user/${user.id}/grant`, { token: admin, body: { credits: -4990 } });
    await moveTo(user.id, at["Papeete Central"]!);
    const r = await api("POST", "/game/buy", { token, body: { good: "vanilla", qty: 1 } });
    expect(r.status).toBe(409);
    expect(r.error).toMatch(/you have 10/);
  });

  it("keeps the warehouse and factories in Berlin", async () => {
    const { token, user } = await signup();
    await moveTo(user.id, at["Dakar Central"]!);
    expect((await api("POST", "/game/unload", { token })).status).toBe(409);
    expect((await api("POST", "/game/build", { token, body: { industry: "chocolate" } })).error).toMatch(/at Berlin/);
  });

  it("builds a chocolate factory from materials brought home, makes chocolate in real time, and sells it", async () => {
    const { token, user } = await signup();
    const { build, recipe } = INDUSTRIES.chocolate;

    // Not enough materials yet.
    const early = await api("POST", "/game/build", { token, body: { industry: "chocolate" } });
    expect(early.status).toBe(409);
    expect(early.error).toMatch(/short of 8 × Cocoa beans/);

    // Materials for the factory and one batch.
    const need = (g: keyof typeof build.materials) => build.materials[g]! + recipe.inputs[g]!;
    await stock(token, user.id, { cocoa: need("cocoa"), sugar: need("sugar"), milk: need("milk"), vanilla: need("vanilla") });
    let g = await game(token);
    expect(g.cargo).toEqual({});
    expect(g.warehouse).toEqual({ cocoa: 12, milk: 6, sugar: 8, vanilla: 3 });
    const before = g.balance;

    const built = await api("POST", "/game/build", { token, body: { industry: "chocolate" } });
    expect(built.status).toBe(200);
    expect(built.data.balance).toBe(before - build.credits);
    expect(built.data.warehouse).toEqual({ cocoa: 4, milk: 2, sugar: 2, vanilla: 1 });
    expect(built.data.factories).toEqual([expect.objectContaining({ industry: "chocolate", batches: 0, batch: null })]);
    expect((await api("POST", "/game/build", { token, body: { industry: "chocolate" } })).status).toBe(409);

    // One batch at a time; the inputs leave the warehouse when it starts.
    const started = await api("POST", "/game/produce", { token, body: { industry: "chocolate" } });
    expect(started.status).toBe(200);
    expect(started.data.warehouse).toEqual({});
    const batch = started.data.factories[0].batch;
    expect(batch.readyAt - batch.startedAt).toBe(recipe.hours * 3_600_000);
    expect((await api("POST", "/game/produce", { token, body: { industry: "chocolate" } })).status).toBe(409);

    // The world ticks on; once the batch is done, it's in the warehouse.
    await runInDurableObject(worldStub(), (w: World) => {
      w.tick(batch.readyAt - 60_000);
    });
    expect((await game(token)).warehouse).toEqual({});
    await runInDurableObject(worldStub(), (w: World) => {
      w.tick(batch.readyAt + 60_000);
    });
    g = await game(token);
    expect(g.warehouse).toEqual({ chocolate: recipe.quantity });
    expect(g.factories[0]).toMatchObject({ batches: 1, batch: null });

    // Sell some at home, straight from the warehouse…
    const home = (await api("GET", "/game/catalog")).data.markets.find((m: any) => m.stop.name === "Berlin");
    const homePrice = home.buys.find((b: any) => b.good === "chocolate").price;
    const soldHome = await api("POST", "/game/sell", { token, body: { good: "chocolate", qty: 4 } });
    expect(soldHome.status).toBe(200);
    expect(soldHome.data.balance).toBe(g.balance + 4 * homePrice);

    // …and take the rest to Amsterdam, which pays more.
    expect((await api("POST", "/game/load", { token, body: { good: "chocolate", qty: 20 } })).data.cargo).toEqual({ chocolate: 20 });
    await moveTo(user.id, at["Amsterdam Centraal"]!);
    const amsterdam = price("Amsterdam Centraal", "chocolate", "buys");
    expect(amsterdam).toBeGreaterThan(homePrice);
    const sold = await api("POST", "/game/sell", { token, body: { good: "chocolate", qty: 20 } });
    expect(sold.status).toBe(200);
    expect(sold.data.cargo).toEqual({});
    expect(sold.data.balance).toBe(soldHome.data.balance + 20 * amsterdam);
    expect((await api("POST", "/game/sell", { token, body: { good: "chocolate", qty: 1 } })).status).toBe(409);
  });

  it("charges fares for tickets, and refunds them if you cancel before boarding", async () => {
    const { token } = await signup();
    const routes = (await api("GET", "/route")).data;
    const line = routes.find((r: any) => !r.returnOf);
    const back = routes.find((r: any) => r.returnOf === line.id);
    // A train heading back towards Lisbon, still a few stations east of Berlin.
    const made = await api("POST", "/trip", { token: admin, body: { trip: { route: back.id, active: true } } });
    expect(made.status, made.error).toBe(201);
    const trip = made.data;
    const toParis = back.stops.find((s: any) => s.name === "Paris").id;
    const bought = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: berlin, to: toParis } } });
    expect(bought.status, bought.error).toBe(201);
    const fare = bought.data.price;
    expect(fare).toBeGreaterThan(5);
    expect((await game(token)).balance).toBeCloseTo(5000 - fare, 2);
    expect((await api("DELETE", "/ticket", { token })).status).toBe(200);
    const g = await game(token);
    expect(g.balance).toBeCloseTo(5000, 2);
    expect(g.ledger.map((l: any) => l.kind)).toEqual(["refund", "fare"]);
  });
});
