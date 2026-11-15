import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { OPEN_CONTRACTS, newContract } from "../src/game/contracts";
import type { World } from "../src/world/world";
import { api, buildWorld, signup, worldStub } from "./helpers";

let admin: string;
let berlin: string;
const at: Record<string, string> = {};
let line: { id: string; stops: { id: string }[] };

// Market stations on a running line out of Berlin, so contracts and sightings have somewhere to be.
const MARKET_STOPS = [
  { name: "Amsterdam Centraal", country: "Netherlands", coordinates: { lat: 52.38, lng: 4.9 } },
  { name: "Dakar Central", country: "Senegal", coordinates: { lat: 14.67, lng: -17.43 } },
  { name: "São Paulo Luz", country: "Brazil", coordinates: { lat: -23.53, lng: -46.64 } },
];

beforeEach(async () => {
  await reset();
  const w = await buildWorld();
  admin = w.admin;
  berlin = w.stops.find((s: any) => s.name === "Berlin")!.id;
  for (const s of MARKET_STOPS) at[s.name] = (await api("POST", "/stop", { token: admin, body: { stop: s } })).data.id;
  line = (await api("POST", "/route", { token: admin, body: { route: { name: "South", stops: [berlin, ...MARKET_STOPS.map((s) => at[s.name]!)] } } })).data;
  expect((await api("POST", "/trip", { token: admin, body: { trip: { route: line.id, active: true } } })).status).toBe(201);
});

const sql = (q: string, ...args: unknown[]) => runInDurableObject(worldStub(), (w: World) => (w as any).ctx.storage.sql.exec(q, ...args).toArray());
const moveTo = (userId: string, stop: string) => api("POST", `/user/${userId}/place`, { token: admin, body: { stop } });
const prices = (token: string) => api("GET", "/game/prices", { token }).then((r) => r.data);
const known = async (token: string, stop: string) => (await prices(token)).markets.find((m: any) => m.stop === stop);
const tick = (at = Date.now()) => runInDurableObject(worldStub(), (w: World) => void w.tick(at));
const board = (token: string) => api("GET", "/game/contracts", { token }).then((r) => r.data);
const give = (userId: string, place: "cargo" | "base", good: string, qty: number) =>
  sql("INSERT INTO holdings (user_id, place, good, qty) VALUES (?, ?, ?, ?)", userId, place, good, qty);

describe("hidden prices", () => {
  it("the public catalog has usual prices only", async () => {
    const c = (await api("GET", "/game/catalog")).data;
    const dakar = c.markets.find((m: any) => m.stop.name === "Dakar Central");
    expect(dakar.sells).toEqual([{ good: "cocoa", usual: 14 }]);
    expect((await api("GET", "/game/prices")).status).toBe(401);
  });

  it("you see live prices where you are and at home, and what you last saw elsewhere", async () => {
    const { token, user } = await signup();
    // At home: home is live; nowhere else has been seen.
    let p = await prices(token);
    expect(p.markets.map((m: any) => [m.stop, m.live])).toEqual([[berlin, true]]);

    // In Dakar: live there (and home).
    await moveTo(user.id, at["Dakar Central"]!);
    const there = await known(token, at["Dakar Central"]!);
    expect(there).toMatchObject({ live: true, sells: [expect.objectContaining({ good: "cocoa", price: expect.any(Number), base: expect.any(Number) })] });
    const seenPrice = there.sells[0].price;

    // Someone else buys up the cocoa after you've gone.
    await moveTo(user.id, berlin);
    const rival = await signup();
    await moveTo(rival.user.id, at["Dakar Central"]!);
    await api("POST", "/game/buy", { token: rival.token, body: { good: "cocoa", qty: 60 } });
    expect((await known(rival.token, at["Dakar Central"]!)).sells[0].price).toBeGreaterThan(seenPrice);

    // You still see what you saw, and when.
    p = await known(token, at["Dakar Central"]!);
    expect(p).toMatchObject({ live: false, sells: [{ good: "cocoa", price: seenPrice, base: seenPrice, load: 0 }] });
    expect(p.seenAt).toBeLessThanOrEqual(Date.now());
  });

  it("a train stopping at a station gives its passengers a look at the market", async () => {
    const { token } = await signup();
    const trip = (await api("GET", "/trip")).data.find((t: any) => t.route === line.id);
    // Board at Berlin (the train is at the platform), heading for São Paulo.
    const ticket = await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: berlin, to: at["São Paulo Luz"] } } });
    expect(ticket.status, ticket.error).toBe(201);
    expect((await api("GET", "/user/me", { token })).data.state).toBe("ONBOARD");
    expect(await known(token, at["Amsterdam Centraal"]!)).toBeUndefined();

    // The train is now standing at Amsterdam.
    await api("POST", `/trip/${trip.id}/position`, { token: admin, body: { stopIndex: 1, km: 0 } });
    await tick();
    const seen = await known(token, at["Amsterdam Centraal"]!);
    expect(seen).toMatchObject({ live: false, buys: [expect.objectContaining({ good: "chocolate" })], sells: [expect.objectContaining({ good: "milk" })] });
  });

  it("the telegraph reports big moves, without the numbers", async () => {
    const { token, user } = await signup();
    await moveTo(user.id, at["Dakar Central"]!);
    await api("POST", "/game/buy", { token, body: { good: "cocoa", qty: 2 } }); // small: no news
    expect((await prices(token)).news).toEqual([]);
    await api("POST", "/game/buy", { token, body: { good: "cocoa", qty: 50 } });
    expect((await prices(token)).news).toEqual([{ stop: at["Dakar Central"], good: "cocoa", direction: "up", at: expect.any(Number) }]);
  });
});

describe("contracts", () => {
  it("the world keeps a few open at each level it can", async () => {
    const { token } = await signup();
    expect((await board(token)).open).toEqual([]);
    await tick();
    const open = (await board(token)).open;
    const starters = open.filter((c: any) => c.tier === "starter");
    expect(starters).toHaveLength(OPEN_CONTRACTS.starter);
    for (const c of starters) expect(c).toMatchObject({ stop: berlin, state: "OPEN", winner: null });
    // Amsterdam is the only chocolate buyer here; one contract per station and good.
    expect(open.filter((c: any) => c.tier === "chocolate")).toEqual([expect.objectContaining({ stop: at["Amsterdam Centraal"], good: "chocolate" })]);
    // Nobody here buys batteries or chips.
    expect(open.filter((c: any) => c.tier === "batteries" || c.tier === "chips")).toEqual([]);
    // Ticking again doesn't add more.
    await tick();
    expect((await board(token)).open).toHaveLength(open.length);
  });

  it("pays the first to deliver, in full, and nobody after", async () => {
    await tick();
    const a = await signup();
    const b = await signup();
    const c = (await board(a.token)).open.find((x: any) => x.tier === "starter");
    for (const p of [a, b]) await give(p.user.id, "cargo", c.good, c.qty);

    const delivered = await api("POST", `/game/contracts/${c.id}/deliver`, { token: a.token });
    expect(delivered.status, delivered.error).toBe(200);
    expect(delivered.data.balance).toBe(5000 + c.qty * c.price);
    expect(delivered.data.cargo).toEqual({});
    expect(delivered.data.ledger[0]).toMatchObject({ kind: "contract", amount: c.qty * c.price });

    const late = await api("POST", `/game/contracts/${c.id}/deliver`, { token: b.token });
    expect(late.status).toBe(409);
    expect(late.error).toBe("Someone else delivered this one first.");
    const closed = (await board(b.token)).closed.find((x: any) => x.id === c.id);
    expect(closed).toMatchObject({ state: "DELIVERED", winner: { username: a.user.username, you: false, bot: false } });
    // It counts as earnings this week.
    const standing = (await api("GET", "/game/leaderboard", { token: a.token })).data.players.find((p: any) => p.you);
    expect(standing.week).toBe(c.qty * c.price);
  });

  it("needs the whole order, at the right station, in time; starters are for new businesses", async () => {
    await tick();
    const { token, user } = await signup();
    const starter = (await board(token)).open.find((x: any) => x.tier === "starter");
    const chocolate = (await board(token)).open.find((x: any) => x.tier === "chocolate");
    const deliver = (id: string) => api("POST", `/game/contracts/${id}/deliver`, { token });

    await give(user.id, "cargo", starter.good, starter.qty - 1);
    expect((await deliver(starter.id)).error).toBe(`It needs ${starter.qty} and you have ${starter.qty - 1}.`);
    expect((await deliver(chocolate.id)).error).toBe("This contract is for delivery at Amsterdam Centraal.");

    // At home, the warehouse counts too.
    await give(user.id, "base", starter.good, 1);
    // But not once you've built a factory.
    await sql("INSERT INTO factories (user_id, industry, built_at) VALUES (?, 'chocolate', ?)", user.id, Date.now());
    expect((await deliver(starter.id)).error).toBe("Starter contracts are for businesses that haven't built a factory yet.");
    await sql("DELETE FROM factories WHERE user_id = ?", user.id);
    expect((await deliver(starter.id)).status).toBe(200);

    // Too late.
    await moveTo(user.id, at["Amsterdam Centraal"]!);
    await give(user.id, "cargo", "chocolate", chocolate.qty);
    await sql("UPDATE contracts SET expires_at = ? WHERE id = ?", Date.now() - 1, chocolate.id);
    expect((await deliver(chocolate.id)).error).toBe("This contract has expired.");
    expect((await board(token)).closed.find((x: any) => x.id === chocolate.id)).toMatchObject({ state: "EXPIRED", winner: null });
  });

  it("makes contracts that pay a premium, with time to do them", () => {
    const ctx = {
      now: 0,
      home: "berlin",
      stopIds: new Map([
        ["Amsterdam Centraal", "ams"],
        ["Dubai Central Station", "dxb"],
      ]),
      kmFromHome: (id: string) => ({ berlin: 0, ams: 700, dxb: 5000 })[id as "ams"] ?? null,
      taken: new Set<string>(),
    };
    for (let i = 0; i < 20; i++) {
      const rng = () => (i + 0.5) / 20;
      const c = newContract("chocolate", ctx, rng)!;
      const usual = c.stopId === "ams" ? 15 : 18;
      expect(c.price).toBeGreaterThanOrEqual(Math.round(usual * 1.35));
      expect(c.price).toBeLessThanOrEqual(Math.round(usual * 1.7));
      expect(c.expiresAt).toBeGreaterThan(24 * 3_600_000);
      const s = newContract("starter", ctx, rng)!;
      expect(s).toMatchObject({ stopId: "berlin", good: "milk" }); // the only material sold anywhere reachable
      expect(s.qty * s.price).toBeGreaterThan(s.qty * 9 * 2); // well over what the milk costs
    }
    // Nowhere reachable to buy: no contract.
    expect(newContract("chips", ctx)).toBeNull();
    expect(newContract("chocolate", { ...ctx, taken: new Set(["ams:chocolate", "dxb:chocolate"]) })).toBeNull();
  });
});
