import { machine } from "./machine";

/**
 * A player's factory for one industry. Not stored as a column: derived from the factories row
 * (absent = UNBUILT) and its batch timestamps, by factoryState().
 */
export const FACTORY_STATES = ["UNBUILT", "IDLE", "PRODUCING", "READY"] as const;
export type FactoryState = (typeof FACTORY_STATES)[number];
export type FactoryEvent = "build" | "start_batch" | "finish_batch" | "collect";

export const factory = machine<FactoryState, FactoryEvent>({
  name: "Factory",
  about: "One of a player's factories in Berlin. A batch takes inputs from the warehouse when it starts, and puts the output in the warehouse when it's collected (on the world tick, or when the player next looks).",
  stored: "derived from factories (no row = UNBUILT; batch_ready_at null = IDLE; in the future = PRODUCING; past = READY)",
  initial: "UNBUILT",
  states: {
    UNBUILT: { about: "No factory yet.", on: { build: "IDLE" } },
    IDLE: { about: "Built, nothing in production.", on: { start_batch: "PRODUCING" } },
    PRODUCING: { about: "A batch is running until batch_ready_at.", on: { finish_batch: "READY" } },
    READY: { about: "The batch is done; its output is delivered to the warehouse on collection.", on: { collect: "IDLE" } },
  },
  events: {
    build: "Build the factory (credits and materials from the warehouse)",
    start_batch: "Start a production batch (inputs leave the warehouse)",
    finish_batch: "The batch's time is up",
    collect: "Deliver the output to the warehouse",
  },
  refusals: {
    // The industry's name is filled in by the caller (see refusalFor in world.ts).
    build: "You already have this factory.",
    start_batch: { UNBUILT: "Build this factory first.", PRODUCING: "A batch is already in production.", READY: "A batch is already in production." },
  },
});

export interface FactoryRow {
  batch_ready_at: number | null;
}
/** The state of a factory row (or of none) at time `now`. */
export function factoryState(row: FactoryRow | undefined | null, now: number): FactoryState {
  if (!row) return "UNBUILT";
  if (row.batch_ready_at === null) return "IDLE";
  return row.batch_ready_at > now ? "PRODUCING" : "READY";
}
