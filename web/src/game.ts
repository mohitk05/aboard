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
export interface Offer {
  good: GoodId;
  /** The next unit, with recent trading. */
  price: number;
  /** Today's price before recent trading. */
  base: number;
  /** Units recently traded here (fading). */
  load: number;
}
export interface Market {
  stop: Stop;
  sells: Offer[];
  buys: Offer[];
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

/**
 * Goods, industries and prices everywhere. Trades move prices, and a live "market" event says
 * when anyone trades (see live.ts), so it doesn't need refetching otherwise for a while.
 */
export function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("GET", "/game/catalog"), staleTime: 10 * 60_000 });
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
      qc.invalidateQueries({ queryKey: ["catalog"] }); // your trade moved the price
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
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

/** Where each good is sold (raw) or bought (products), cheapest/best first. */
export function marketsFor(catalog: Catalog | undefined, good: GoodId, side: "sells" | "buys") {
  const list = (catalog?.markets ?? []).flatMap((m) =>
    m[side].filter((o) => o.good === good).map((o) => ({ stop: m.stop, price: o.price, moved: o.price - o.base })),
  );
  return list.sort((a, b) => (side === "sells" ? a.price - b.price : b.price - a.price));
}
