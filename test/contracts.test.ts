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

describe("orders between players", () => {
  const post = (token: string, order: Record<string, unknown>) => api("POST", "/game/orders", { token, body: order });
  const orders = (token: string) => api("GET", "/game/orders", { token }).then((r) => r.data);
  const fill = (token: string, id: string, qty: number) => api("POST", `/game/orders/${id}/fill`, { token, body: { qty } });

  it("a buy order holds the credits; others sell into it a part at a time, from Berlin", async () => {
    const buyer = await signup();
    const seller = await signup();
    expect((await api("GET", "/game/orders")).status).toBe(401);

    const posted = await post(buyer.token, { side: "buy", good: "vanilla", qty: 6, price: 50 });
    expect(posted.status, posted.error).toBe(201);
    expect(posted.data.balance).toBe(5000 - 300); // held
    expect(posted.data.ledger[0]).toMatchObject({ kind: "order", amount: -300 });
    const [o] = (await orders(seller.token)).open;
    expect(o).toMatchObject({ side: "buy", good: "vanilla", qty: 6, remaining: 6, price: 50, state: "OPEN", mine: false, by: { username: buyer.user.username, bot: false } });

    // The seller needs the goods in Berlin: away, what they carry doesn't count.
    await give(seller.user.id, "cargo", "vanilla", 4);
    await moveTo(seller.user.id, at["Dakar Central"]!);
    expect((await fill(seller.token, o.id, 2)).error).toMatch(/You have 0 vanilla in Berlin/);
    await moveTo(seller.user.id, berlin);
    expect((await fill(buyer.token, o.id, 1)).error).toBe("That's your own order.");
    expect((await fill(seller.token, o.id, 7)).error).toBe("Only 6 left on that order.");

    const sold = await fill(seller.token, o.id, 4);
    expect(sold.status, sold.error).toBe(200);
    expect(sold.data.balance).toBe(5000 + 200);
    expect(sold.data.cargo).toEqual({});
    expect((await api("GET", "/game", { token: buyer.token })).data.warehouse).toEqual({ vanilla: 4 });
    expect((await orders(buyer.token)).open[0]).toMatchObject({ remaining: 2, mine: true });

    // Taking it down gives back what's still held (2 × 50).
    const down = await api("DELETE", `/game/orders/${o.id}`, { token: buyer.token });
    expect(down.data.balance).toBe(5000 - 300 + 100);
    expect((await orders(buyer.token)).mine[0]).toMatchObject({ id: o.id, state: "CANCELLED", remaining: 2 });
    expect((await fill(seller.token, o.id, 1)).error).toBe("That order was taken down.");
    expect((await api("DELETE", `/game/orders/${o.id}`, { token: buyer.token })).error).toBe("That order was already taken down.");
    expect((await api("DELETE", `/game/orders/${o.id}`, { token: seller.token })).status).toBe(404);
  });

  it("a sell order holds the goods; a buyer anywhere pays and gets them in Berlin", async () => {
    const seller = await signup();
    const buyer = await signup();
    await give(seller.user.id, "base", "cocoa", 3);
    await give(seller.user.id, "cargo", "cocoa", 7); // at home, so this counts too
    expect((await post(seller.token, { side: "sell", good: "cocoa", qty: 11, price: 20 })).error).toMatch(/You have 10 cocoa beans in Berlin/);
    const posted = await post(seller.token, { side: "sell", good: "cocoa", qty: 10, price: 20 });
    expect(posted.status, posted.error).toBe(201);
    expect(posted.data.warehouse).toEqual({});
    expect(posted.data.cargo).toEqual({});
    const [o] = (await orders(buyer.token)).open;

    await moveTo(buyer.user.id, at["São Paulo Luz"]!); // away: fine, it lands in the warehouse
    const bought = await fill(buyer.token, o.id, 10);
    expect(bought.status, bought.error).toBe(200);
    expect(bought.data.balance).toBe(5000 - 200);
    expect(bought.data.warehouse).toEqual({ cocoa: 10 });
    expect((await api("GET", "/game", { token: seller.token })).data.balance).toBe(5000 + 200);
    expect((await orders(seller.token)).mine[0]).toMatchObject({ state: "FILLED", remaining: 0 });
    expect((await fill(buyer.token, o.id, 1)).error).toBe("That order has been filled.");
  });

  it("what isn't filled goes back when an order expires, and counts in net worth meanwhile", async () => {
    const { token, user } = await signup();
    await give(user.id, "base", "milk", 5);
    await post(token, { side: "sell", good: "milk", qty: 5, price: 30, days: 1 });
    await post(token, { side: "buy", good: "sugar", qty: 10, price: 10, days: 1 });
    const standing = async () => (await api("GET", "/game/leaderboard", { token })).data.players.find((p: any) => p.you);
    // Nothing is lost while it's held: 100 credits held, and 5 milk at their usual value.
    expect((await standing()).netWorth).toBe(5000 + 5 * 9);
    // Posting a buy order isn't a loss: the held credits come back if nobody sells.
    await sql("UPDATE orders SET expires_at = ? WHERE user_id = ?", Date.now() - 1, user.id);
    await tick();
    const g = (await api("GET", "/game", { token })).data;
    expect(g.balance).toBe(5000);
    expect(g.warehouse).toEqual({ milk: 5 });
    expect((await orders(token)).mine.map((o: any) => o.state)).toEqual(["EXPIRED", "EXPIRED"]);
    expect((await standing()).week).toBe(0);
  });

  it("limits what you can put up", async () => {
    const { token } = await signup();
    expect((await post(token, { side: "buy", good: "gold", qty: 1, price: 1 })).status).toBe(400);
    expect((await post(token, { side: "buy", good: "milk", qty: 1000, price: 1 })).status).toBe(400);
    expect((await post(token, { side: "buy", good: "milk", qty: 10, price: 1000 })).error).toMatch(/holds 10000 credits/);
    for (let i = 0; i < 10; i++) expect((await post(token, { side: "buy", good: "milk", qty: 1, price: 1 })).status).toBe(201);
    expect((await post(token, { side: "buy", good: "milk", qty: 1, price: 1 })).error).toBe("You can have 10 orders up at once.");
  });
});
