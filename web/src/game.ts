import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Stop } from "./api";

// The industry game: build a business from Berlin. Rules are in src/game/catalog.ts.
export { MARKET_HALF_LIFE_HOURS, tradeTotal } from "../../src/game/catalog";

export type GoodId = string;
export type IndustryId = "chocolate" | "batteries" | "chips";

export interface Good {
  id: GoodId;
  name: string;
  unit: string;
  kind: "raw" | "product";
  /** Trading this many units in one place doubles (raw) or halves (products) the price. */
  depth: number;
}
export interface Industry {
  id: IndustryId;
  name: string;
  blurb: string;
  build: { credits: number; materials: Record<GoodId, number> };
  recipe: { inputs: Record<GoodId, number>; output: GoodId; quantity: number; hours: number };
}
/** What a market trades, at its usual price (public). What's paid right now is hidden: see Prices. */
export interface UsualOffer {
  good: GoodId;
  usual: number;
}
export interface Market {
  stop: Stop;
  sells: UsualOffer[];
  buys: UsualOffer[];
}
/** A price as you know it. Live: exactly what's paid now. Seen: what was paid when you last looked. */
export interface Offer {
  good: GoodId;
  /** The next unit, with recent trading. */
  price: number;
  /** Today's price before recent trading (live only; otherwise the same as price). */
  base: number;
  /** Units recently traded here, fading (live only; otherwise 0). */
  load: number;
}
export interface KnownMarket {
  stop: string;
  /** Live (you're there, or it's home), or what you saw at seenAt. */
  live: boolean;
  seenAt: number;
  sells: Offer[];
  buys: Offer[];
}
/** The telegraph: a big price move somewhere, without the numbers. */
export interface News {
  stop: string;
  good: GoodId;
  /** up: dearer to buy, or fetching more; down: cheaper, or fetching less. */
  direction: "up" | "down";
  at: number;
}
export interface Prices {
  markets: KnownMarket[];
  news: News[];
}
export interface Contract {
  id: string;
  /** starter (bring a raw material home; only before your first factory), or the industry it's for. */
  tier: "starter" | IndustryId;
  stop: string;
  good: GoodId;
  qty: number;
  /** Credits each, paid on delivery. */
  price: number;
  expiresAt: number;
  /** OPEN, DELIVERED or EXPIRED (src/machines/contract.ts). */
  state: import("../../src/machines/contract").ContractState;
  deliveredAt: number | null;
  /** Who delivered it (username null for a private profile). */
  winner: { username: string | null; you: boolean; bot: boolean } | null;
}
/** A player's order between players, settled between Berlin warehouses. */
export interface Order {
  id: string;
  /** buy: they hold credits and want goods; sell: they hold goods and want credits. */
  side: "buy" | "sell";
  good: GoodId;
  qty: number;
  remaining: number;
  price: number;
  createdAt: number;
  expiresAt: number;
  /** OPEN, FILLED, CANCELLED or EXPIRED (src/machines/order.ts). */
  state: import("../../src/machines/order").OrderState;
  mine: boolean;
  /** Who posted it (username null for a private profile). */
  by: { username: string | null; bot: boolean };
}
export interface OrdersBoard {
  open: Order[];
  /** Your own latest orders that are done (filled, taken down or expired). */
  mine: Order[];
}
export interface ContractsBoard {
  open: Contract[];
  closed: Contract[];
}
export interface Catalog {
  home: Stop | null;
  cargoCapacity: number;
  goods: Good[];
  industries: Industry[];
  markets: Market[];
}
export interface Factory {
  industry: IndustryId;
  builtAt: number;
  batches: number;
  /** See the factory state machine (src/machines/factory.ts). */
  state: Exclude<import("../../src/machines/factory").FactoryState, "UNBUILT">;
  batch: { startedAt: number; readyAt: number } | null;
}
export interface GameState {
  balance: number;
  home: Stop | null;
  atHome: boolean;
  cargo: Record<GoodId, number>;
  cargoCapacity: number;
  warehouse: Record<GoodId, number>;
  factories: Factory[];
  ledger: { at: number; kind: string; amount: number; note: string }[];
}

/** Goods, industries and every market at its usual prices. These don't change, so it's cached a long while. */
export function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("GET", "/game/catalog"), staleTime: 60 * 60_000 });
}

/**
 * Prices as you know them (live where you are and at home, last seen elsewhere), and the
 * telegraph. Under "me", so every world tick refreshes it (you may have passed a station).
 */
export function usePrices(enabled = true) {
  return useQuery({ queryKey: ["me", "prices"], queryFn: () => api<Prices>("GET", "/game/prices"), enabled });
}

/** Orders between players. Refreshed when one is posted, filled or taken down (live.ts). */
export function useOrders() {
  return useQuery({ queryKey: ["orders"], queryFn: () => api<OrdersBoard>("GET", "/game/orders"), staleTime: 60_000 });
}

/** Post, fill or take down an order: like a game action, and the board refreshes too. */
export function useOrderAction<I = void>(method: "POST" | "DELETE", path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => api<GameState>(method, `/game/${path}`, method === "DELETE" ? undefined : (input ?? {})),
    onSuccess: (state) => {
      qc.setQueryData(["me", "game"], state);
      qc.invalidateQueries({ queryKey: ["me"], exact: true });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

/** The contracts board. Refreshed when one is added or delivered (live.ts). */
export function useContracts() {
  return useQuery({ queryKey: ["contracts"], queryFn: () => api<ContractsBoard>("GET", "/game/contracts"), staleTime: 60_000 });
}

export interface Standing {
  /** null for a private profile (other than yours). */
  id: string | null;
  username: string | null;
  image: string | null;
  you: boolean;
  /** Run by the game, not a person. */
  bot: boolean;
  netWorth: number;
  /** Earned trading this week: sales, less materials and fares. */
  week: number;
  factories: IndustryId[];
}
export interface Leaderboard {
  weekStart: number;
  weekEnds: number;
  players: Standing[];
  lastWeek: { username: string | null; you: boolean; earned: number } | null;
}

/** Everyone's standing. Refreshed when anyone trades (live.ts). */
export function useLeaderboard() {
  return useQuery({ queryKey: ["leaderboard"], queryFn: () => api<Leaderboard>("GET", "/game/leaderboard"), staleTime: 60_000 });
}

/** Your business. Under "me", so every world tick refreshes it (see live.ts). */
export function useGame() {
  return useQuery({ queryKey: ["me", "game"], queryFn: () => api<GameState>("GET", "/game") });
}

/** A game action (buy, sell, build…): the server answers with your new state. */
export function useGameAction<I = void>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => api<GameState>("POST", `/game/${path}`, input ?? {}),
    onSuccess: (state) => {
      qc.setQueryData(["me", "game"], state);
      qc.invalidateQueries({ queryKey: ["me"], exact: true }); // balance on your profile
      qc.invalidateQueries({ queryKey: ["me", "prices"] }); // your trade moved the price
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });
}

export const credits = (n: number) => `${new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(Math.floor(n))} cr`;

export const total = (h: Record<GoodId, number>) => Object.values(h).reduce((a, b) => a + b, 0);

/** Name of a good, with a plural-aware unit: "12 sacks of Cocoa beans". */
export function amount(goods: Good[] | undefined, id: GoodId, qty: number) {
  const g = goods?.find((x) => x.id === id);
  if (!g) return `${qty} × ${id}`;
  const unit = qty === 1 ? g.unit : /(x|s|ch|sh)$/.test(g.unit) ? `${g.unit}es` : `${g.unit}s`;
  return `${qty} ${unit} of ${g.name.toLowerCase()}`;
}

export const goodName = (goods: Good[] | undefined, id: GoodId) => goods?.find((g) => g.id === id)?.name ?? id;

/** A market's price for a good as you know it: live, seen (with when), or just the usual price. */
export interface PriceKnown {
  stop: Stop;
  /** Live or last-seen price, or the usual price if you've never seen this market. */
  price: number;
  usual: number;
  /** "live", "seen" (at seenAt), or "usual" (never seen). */
  known: "live" | "seen" | "usual";
  seenAt: number | null;
  /** How far recent trading has moved a live price (0 otherwise). */
  moved: number;
}

/** Where each good is sold (raw) or bought (products), cheapest/best first, as far as you know. */
export function marketsFor(catalog: Catalog | undefined, good: GoodId, side: "sells" | "buys", prices?: Prices): PriceKnown[] {
  const list = (catalog?.markets ?? []).flatMap((m) =>
    m[side]
      .filter((o) => o.good === good)
      .map((o): PriceKnown => {
        const k = prices?.markets.find((x) => x.stop === m.stop.id);
        const offer = k?.[side].find((x) => x.good === good);
        if (!k || !offer) return { stop: m.stop, price: o.usual, usual: o.usual, known: "usual", seenAt: null, moved: 0 };
        return { stop: m.stop, price: offer.price, usual: o.usual, known: k.live ? "live" : "seen", seenAt: k.seenAt, moved: k.live ? offer.price - offer.base : 0 };
      }),
  );
  return list.sort((a, b) => (side === "sells" ? a.price - b.price : b.price - a.price));
}
