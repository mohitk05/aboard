// The contracts board: orders with deadlines, at a premium, for whoever delivers first.
//
// The world keeps a few open at every level of the game, so there's always something within
// reach: starter orders for new businesses (bring a chocolate-factory material home to Berlin,
// a first win in an hour or two), then orders for chocolate, batteries and chips at the markets that buy them.
// Contracts are paid in full on delivery, and don't move market prices.

import { INDUSTRIES, MARKETS, type GoodId, type IndustryId } from "./catalog";

export type ContractTier = "starter" | IndustryId;
export const CONTRACT_TIERS: ContractTier[] = ["starter", "chocolate", "batteries", "chips"];

/** How many contracts the board keeps open at each level. */
export const OPEN_CONTRACTS: Record<ContractTier, number> = { starter: 3, chocolate: 3, batteries: 2, chips: 2 };

/** Sizes of order for each level (cases or crates). */
const SIZES: Record<ContractTier, number[]> = {
  starter: [4, 6, 8],
  chocolate: [24, 36, 48],
  batteries: [8, 16, 24],
  chips: [16, 32, 48],
};

/** A product order pays this much over the usual price (a range; rng picks within it). */
const PREMIUM: [number, number] = [1.35, 1.7];
/** Speed for working out deadlines: a little under the trains', for changes and waits. */
const PLANNING_KMH = 200;
/** On top of the travelling: time to gather, make and load (hours). */
const SLACK_HOURS: Record<ContractTier, number> = { starter: 24, chocolate: 36, batteries: 48, chips: 60 };

export interface NewContract {
  tier: ContractTier;
  stopId: string;
  good: GoodId;
  qty: number;
  /** Credits per unit, paid on delivery. */
  price: number;
  expiresAt: number;
}

export interface ContractContext {
  now: number;
  home: string;
  /** Station ids by name, for the stations that exist in this world. */
  stopIds: Map<string, string>;
  /** Rail distance from home, or null if no running train gets there. */
  kmFromHome: (stopId: string) => number | null;
  /** Stations already holding an open contract for a good ("stopId:good"): no duplicates. */
  taken: Set<string>;
}

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;
const hours = (km: number) => km / PLANNING_KMH;

/** A new contract for a level, or null if this world has nowhere to make one. */
export function newContract(tier: ContractTier, ctx: ContractContext, rng: () => number = Math.random): NewContract | null {
  const qty = pick(SIZES[tier], rng);

  if (tier === "starter") {
    // Bring home a material for the first factory (cheap, and where to find it is worth
    // learning), from somewhere you can get to and back from.
    const options = (Object.keys(INDUSTRIES.chocolate.build.materials) as GoodId[]).flatMap((good) => {
      if (ctx.taken.has(`${ctx.home}:${good}`)) return [];
      const sources = Object.entries(MARKETS).flatMap(([name, m]) => {
        const id = ctx.stopIds.get(name);
        const km = id ? ctx.kmFromHome(id) : null;
        return m.sells?.[good] && km !== null ? [{ km, base: m.sells[good]! }] : [];
      });
      if (!sources.length) return [];
      const nearest = sources.reduce((a, b) => (a.km <= b.km ? a : b));
      return [{ good, ...nearest }];
    });
    // Starters are about a quick first win: favour the nearer sources.
    const near = options.sort((a, b) => a.km - b.km).slice(0, 4);
    if (!near.length) return null;
    const o = pick(near, rng);
    // Pays well for the size: the goods at well over cost, plus something towards the fares.
    const total = qty * o.base * 2.5 + 2 * o.km * 0.01 + 100;
    return {
      tier,
      stopId: ctx.home,
      good: o.good,
      qty,
      price: Math.ceil(total / qty),
      expiresAt: ctx.now + (2 * hours(o.km) + SLACK_HOURS.starter) * 3_600_000,
    };
  }

  // A product, to a market that buys it (not home), somewhere you can get to.
  const good = INDUSTRIES[tier].recipe.output;
  const buyers = Object.entries(MARKETS).flatMap(([name, m]) => {
    const id = ctx.stopIds.get(name);
    const km = id ? ctx.kmFromHome(id) : null;
    return m.buys?.[good] && id && km !== null && !ctx.taken.has(`${id}:${good}`) ? [{ id, km, base: m.buys[good]! }] : [];
  });
  if (!buyers.length) return null;
  const b = pick(buyers, rng);
  const premium = PREMIUM[0] + (PREMIUM[1] - PREMIUM[0]) * rng();
  const { recipe } = INDUSTRIES[tier];
  const making = Math.ceil(qty / recipe.quantity) * recipe.hours;
  return {
    tier,
    stopId: b.id,
    good,
    qty,
    price: Math.round(b.base * premium),
    expiresAt: ctx.now + (2 * hours(b.km) + making + SLACK_HOURS[tier]) * 3_600_000,
  };
}

