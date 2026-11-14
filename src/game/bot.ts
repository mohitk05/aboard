// Bots: players the World runs itself. They follow the same rules as people (every step goes
// through the same World methods a player's request does) and play the way a sensible person
// would: climb the industry ladder, ride out for materials, keep their factories busy, and take
// their products to whichever market pays best once the trip is counted.
//
// This file is the brain, and it's pure: given what a bot can see (a BotView), plan() says what
// to do next (Steps). The World gathers the view, carries the steps out, and finds the trains.

import { GOODS, INDUSTRIES, tradeTotal, type GoodId, type IndustryId } from "./catalog";

/** Keep materials in stock for this many batches of each factory you run. */
export const BATCHES_AHEAD = 3;
/** Never spend below this on goods: it's for fares. */
export const FARE_RESERVE = 300;
/** Go selling once you have at least this many cases (or anything at all if there's nothing else to do). */
export const SALES_LOAD = 20;
/** What a km of travel costs a bot in time, in credits, when comparing markets. */
export const KM_COST = 0.05;
/** Sell where you are if it pays at least this share of the best trip elsewhere. */
export const GOOD_ENOUGH = 0.9;
/** How long to wait when there's nothing to do, if no batch will finish sooner (ms). */
export const IDLE_WAIT_MS = 60 * 60_000;
/** How long to wait when no train goes the right way yet (ms). */
export const NO_TRAIN_WAIT_MS = 30 * 60_000;

/** The industries, cheapest first: bots build them in this order. */
const LADDER: IndustryId[] = ["chocolate", "batteries", "chips"];

export interface BotOffer {
  good: GoodId;
  base: number;
  load: number;
  price: number;
}
export interface BotMarket {
  stopId: string;
  sells: BotOffer[];
  buys: BotOffer[];
}
export interface BotView {
  now: number;
  here: string;
  home: string;
  balance: number;
  cargo: Partial<Record<GoodId, number>>;
  warehouse: Partial<Record<GoodId, number>>;
  cargoCapacity: number;
  /** Factories built, with when their batch is ready (null when idle). */
  factories: { industry: IndustryId; readyAt: number | null }[];
  /** Every market in the world, with today's prices and recent trading. */
  markets: BotMarket[];
  /** Rail distance from here to a station, or null if no running train gets there. */
  km: (stopId: string) => number | null;
  /**
   * The bot's temperament, stable for each bot (e.g. from its id): how much it minds long trips,
   * and which of several similar choices it favours. Without one, every bot would make the same
   * choice in the same place. Leave it out for a plain, predictable bot.
   */
  quirk?: string;
}

/** A small, stable hash of a string, in [0, 1). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}
/** How much this bot minds a km of travel: half to twice the usual. */
const kmCost = (view: BotView) => (view.quirk === undefined ? KM_COST : KM_COST * (0.5 + 1.5 * hash(view.quirk)));
/** This bot's taste for a station: a factor within ±15%, so near-equal choices differ between bots. */
const taste = (view: BotView, stopId: string) => (view.quirk === undefined ? 1 : 0.85 + 0.3 * hash(`${view.quirk}:${stopId}`));

export type Step =
  | { do: "unload" }
  | { do: "build"; industry: IndustryId }
  | { do: "produce"; industry: IndustryId }
  | { do: "load"; good: GoodId; qty: number }
  | { do: "sell"; good: GoodId; qty: number }
  | { do: "buy"; good: GoodId; qty: number }
  | { do: "travel"; to: string }
  | { do: "wait"; until: number };

export interface Plan {
  steps: Step[];
  /** What the bot is up to, in a few words (shown to admins). */
  note: string;
}

type Stock = Partial<Record<GoodId, number>>;
const sum = (s: Stock) => Object.values(s).reduce<number>((a, b) => a + (b ?? 0), 0);
const add = (s: Stock, good: GoodId, n: number) => {
  s[good] = (s[good] ?? 0) + n;
  if (!s[good]) delete s[good];
};
const products = (s: Stock) => Object.fromEntries(Object.entries(s).filter(([g]) => GOODS[g as GoodId].kind === "product")) as Stock;
const materials = (s: Stock) => Object.fromEntries(Object.entries(s).filter(([g]) => GOODS[g as GoodId].kind === "raw")) as Stock;
const has = (stock: Stock, need: Stock) => Object.entries(need).every(([g, n]) => (stock[g as GoodId] ?? 0) >= n!);
const name = (g: GoodId) => GOODS[g].name.toLowerCase();

/** Rough cost of a set of materials, at the cheapest base price anywhere. */
function estimate(need: Stock, markets: BotMarket[]): number {
  let total = 0;
  for (const [g, n] of Object.entries(need)) {
    const prices = markets.flatMap((m) => m.sells.filter((o) => o.good === g).map((o) => o.price));
    total += (prices.length ? Math.min(...prices) : 0) * n!;
  }
  return total;
}

/**
 * The next industry to work towards, if the bot can afford it: the first on the ladder it hasn't
 * built, once it has the credits for the factory and its materials with some to spare.
 */
export function target(view: Pick<BotView, "balance" | "factories" | "markets">): IndustryId | null {
  const next = LADDER.find((id) => !view.factories.some((f) => f.industry === id));
  if (!next) return null;
  const { build, recipe } = INDUSTRIES[next];
  const materialsCost = estimate(build.materials, view.markets) + estimate(recipe.inputs, view.markets);
  return view.balance >= build.credits + materialsCost * 1.2 + FARE_RESERVE ? next : null;
}

/** Materials still to get: enough to build the target and keep every factory busy. */
export function wanted(view: Pick<BotView, "cargo" | "warehouse" | "factories">, goal: IndustryId | null): Stock {
  const want: Stock = {};
  const running = view.factories.map((f) => f.industry);
  for (const id of goal ? [...running, goal] : running)
    for (const [g, n] of Object.entries(INDUSTRIES[id].recipe.inputs)) add(want, g as GoodId, n! * BATCHES_AHEAD);
  if (goal) for (const [g, n] of Object.entries(INDUSTRIES[goal].build.materials)) add(want, g as GoodId, n!);
  for (const [g] of Object.entries(want)) {
    const short = want[g as GoodId]! - (view.cargo[g as GoodId] ?? 0) - (view.warehouse[g as GoodId] ?? 0);
    if (short > 0) want[g as GoodId] = short;
    else delete want[g as GoodId];
  }
  return want;
}

/** What selling everything in `goods` at a market would fetch. */
function proceeds(market: BotMarket, goods: Stock): number {
  let total = 0;
  for (const [g, n] of Object.entries(goods)) {
    const o = market.buys.find((x) => x.good === g);
    if (o) total += tradeTotal(o.base, "buys", o.load, GOODS[o.good].depth, n!);
  }
  return total;
}

/** The best market elsewhere for what you carry, counting the trip: its stop, and what it's worth. */
function bestSale(view: BotView, goods: Stock): { stopId: string; value: number } | null {
  let best: { stopId: string; value: number } | null = null;
  for (const m of view.markets) {
    if (m.stopId === view.home || m.stopId === view.here) continue; // home pays least; it's for emergencies
    const km = view.km(m.stopId);
    if (km === null) continue;
    const value = proceeds(m, goods) * taste(view, m.stopId) - km * kmCost(view);
    if (value > 0 && (!best || value > best.value)) best = { stopId: m.stopId, value };
  }
  return best;
}

/** The nearest market selling something on the list (cheaper breaks ties). */
function nearestSource(view: BotView, want: Stock): string | null {
  let best: { stopId: string; score: number } | null = null;
  for (const m of view.markets) {
    const offers = m.sells.filter((o) => (want[o.good] ?? 0) > 0);
    if (!offers.length) continue;
    const km = m.stopId === view.here ? 0 : view.km(m.stopId);
    if (km === null) continue;
    const score = (km * kmCost(view) + Math.min(...offers.map((o) => o.price))) * taste(view, m.stopId);
    if (!best || score < best.score) best = { stopId: m.stopId, score };
  }
  return best?.stopId ?? null;
}

/**
 * What to do now, standing at a station with no ticket. Steps are in order, and the quantities
 * already allow for the steps before them (e.g. what you just bought takes cargo space).
 */
export function plan(view: BotView): Plan {
  const steps: Step[] = [];
  const notes: string[] = [];
  const cargo: Stock = { ...view.cargo };
  const warehouse: Stock = { ...view.warehouse };
  let balance = view.balance;
  const atHome = view.here === view.home;
  const here = view.markets.find((m) => m.stopId === view.here);
  const factories = view.factories.map((f) => ({ ...f }));

  // ---- at home: the warehouse and the factories ----
  if (atHome) {
    if (sum(cargo)) {
      steps.push({ do: "unload" });
      for (const [g, n] of Object.entries(cargo)) add(warehouse, g as GoodId, n!);
      for (const g of Object.keys(cargo)) delete cargo[g as GoodId];
    }
    const goal = target({ balance, factories, markets: view.markets });
    if (goal && has(warehouse, INDUSTRIES[goal].build.materials) && balance >= INDUSTRIES[goal].build.credits) {
      steps.push({ do: "build", industry: goal });
      for (const [g, n] of Object.entries(INDUSTRIES[goal].build.materials)) add(warehouse, g as GoodId, -n!);
      balance -= INDUSTRIES[goal].build.credits;
      factories.push({ industry: goal, readyAt: null });
      notes.push(`built a ${INDUSTRIES[goal].name.toLowerCase()}`);
    }
    for (const f of factories) {
      const { recipe } = INDUSTRIES[f.industry];
      if ((f.readyAt === null || f.readyAt <= view.now) && has(warehouse, recipe.inputs)) {
        steps.push({ do: "produce", industry: f.industry });
        for (const [g, n] of Object.entries(recipe.inputs)) add(warehouse, g as GoodId, -n!);
        f.readyAt = view.now + recipe.hours * 3_600_000;
      }
    }
  }

  // ---- sell what you carry, if this market is good enough ----
  const carried = products(cargo);
  if (here && sum(carried) && !atHome) {
    const sellable = Object.fromEntries(Object.entries(carried).filter(([g]) => here.buys.some((o) => o.good === g))) as Stock;
    const elsewhere = bestSale(view, carried);
    if (sum(sellable) && (!elsewhere || proceeds(here, sellable) * taste(view, here.stopId) >= GOOD_ENOUGH * elsewhere.value)) {
      for (const [g, n] of Object.entries(sellable)) {
        steps.push({ do: "sell", good: g as GoodId, qty: n! });
        add(cargo, g as GoodId, -n!);
      }
      balance += proceeds(here, sellable);
      notes.push(`sold ${Object.keys(sellable).map((g) => name(g as GoodId)).join(" and ")}`);
    }
  }

  // ---- broke at home: sell some stock here to keep going ----
  if (atHome && here && balance < FARE_RESERVE) {
    for (const [g, n] of Object.entries(products(warehouse))) {
      if (!here.buys.some((o) => o.good === g)) continue;
      steps.push({ do: "sell", good: g as GoodId, qty: n! });
      add(warehouse, g as GoodId, -n!);
      balance += proceeds(here, { [g]: n });
    }
  }

  // ---- buy materials here ----
  const goal = target({ balance, factories, markets: view.markets });
  const want = wanted({ cargo, warehouse, factories }, goal);
  // While saving up for a factory, keep its price aside.
  const keep = FARE_RESERVE + (goal && !factories.some((f) => f.industry === goal) ? INDUSTRIES[goal].build.credits : 0);
  if (here) {
    for (const o of [...here.sells].sort((a, b) => a.price - b.price)) {
      const space = view.cargoCapacity - sum(cargo);
      let qty = Math.min(want[o.good] ?? 0, space);
      while (qty > 0 && tradeTotal(o.base, "sells", o.load, GOODS[o.good].depth, qty) > balance - keep) qty--;
      if (qty <= 0) continue;
      steps.push({ do: "buy", good: o.good, qty });
      balance -= tradeTotal(o.base, "sells", o.load, GOODS[o.good].depth, qty);
      add(cargo, o.good, qty);
      add(want, o.good, -qty);
      notes.push(`bought ${name(o.good)}`);
    }
  }

  // ---- at home: take products out to sell ----
  if (atHome) {
    const stock = products(warehouse);
    const nothingElse = !sum(want) || balance <= keep;
    if (sum(stock) >= SALES_LOAD || (sum(stock) > 0 && nothingElse)) {
      for (const [g, n] of Object.entries(stock).sort((a, b) => GOODS[b[0] as GoodId].depth - GOODS[a[0] as GoodId].depth)) {
        const qty = Math.min(n!, view.cargoCapacity - sum(cargo));
        if (qty <= 0) break;
        steps.push({ do: "load", good: g as GoodId, qty });
        add(cargo, g as GoodId, qty);
      }
    }
  }

  // ---- where next ----
  const space = view.cargoCapacity - sum(cargo);
  const sale = sum(products(cargo)) ? bestSale(view, products(cargo)) : null;
  const source = space > 0 && balance > keep && sum(want) ? nearestSource(view, want) : null;
  const done = (note: string) => ({ steps, note: [...notes, note].join(", ") });
  if (sale) {
    steps.push({ do: "travel", to: sale.stopId });
    return done(`taking ${Object.keys(products(cargo)).map((g) => name(g as GoodId)).join(" and ")} to market`);
  }
  if (source && source !== view.here) {
    steps.push({ do: "travel", to: source });
    return done(`off to buy ${Object.keys(want).map((g) => name(g as GoodId)).join(", ")}`);
  }
  if (!atHome) {
    steps.push({ do: "travel", to: view.home });
    return done(sum(materials(cargo)) ? "bringing materials home" : "heading home");
  }
  // Home, with nothing to fetch or sell: wait for the next batch (or a while).
  const next = factories.map((f) => f.readyAt).filter((t): t is number => t !== null && t > view.now);
  steps.push({ do: "wait", until: Math.min(view.now + IDLE_WAIT_MS, ...next) });
  return done(next.length ? "waiting for a batch" : "waiting");
}

/**
 * Shortest rail distances from `from` over the given track (each pair of consecutive stations on
 * a running line), with the previous station on each shortest path.
 */
export function shortestPaths(edges: Map<string, { to: string; km: number }[]>, from: string) {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  // Networks here are small (hundreds of stations): a plain scan for the nearest is fine.
  for (;;) {
    let u: string | null = null;
    for (const [s, d] of dist) if (!done.has(s) && (u === null || d < dist.get(u)!)) u = s;
    if (u === null) break;
    done.add(u);
    for (const e of edges.get(u) ?? []) {
      const d = dist.get(u)! + e.km;
      if (d < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, d);
        prev.set(e.to, u);
      }
    }
  }
  const path = (to: string): string[] | null => {
    if (!dist.has(to)) return null;
    const out = [to];
    while (out[0] !== from) out.unshift(prev.get(out[0]!)!);
    return out;
  };
  return { dist, path };
}

/** An hour's wait is worth about this many km of travel (a little under a train's speed). */
const WAIT_KM_PER_HOUR = 150;
/** Changing trains means waiting for the next one: count it as about an hour. */
const CHANGE_KM = WAIT_KM_PER_HOUR;

/**
 * Which train to take towards somewhere: of every departure and every station it calls at, the
 * ride that leaves the least to do, counting the km ridden, the km still to go from where you get
 * off (`distTo`: rail distance to the destination from each station), the wait, and another wait
 * if you'll have to change. It must get
 * you closer than you are now (`distTo` from here). Returns the departure and where to get off,
 * or null if no train helps.
 */
export function chooseDeparture<D extends { departureTime: number; destinations: { stop: { id: string }; km: number }[] }>(
  departures: D[],
  distTo: Map<string, number>,
  here: string,
  now: number,
): { departure: D; to: string } | null {
  const fromHere = distTo.get(here);
  if (fromHere === undefined) return null;
  let best: { departure: D; to: string; cost: number } | null = null;
  for (const d of departures) {
    const wait = (Math.max(0, d.departureTime - now) / 3_600_000) * WAIT_KM_PER_HOUR;
    for (const x of d.destinations) {
      const left = distTo.get(x.stop.id);
      if (left === undefined || left >= fromHere) continue;
      const cost = x.km + left + wait + (left > 0 ? CHANGE_KM : 0);
      if (!best || cost < best.cost) best = { departure: d, to: x.stop.id, cost };
    }
  }
  return best && { departure: best.departure, to: best.to };
}
