import { machine } from "./machine";

/**
 * A train running a line. Stored in trips.state, with trips.active (0 when IDLE), trips.route_id
 * (the line, or its return twin), trips.stop_index (the station it's at, or last left) and
 * trips.progress, which means different things by state: see kmIntoSegment / minutesWaited.
 */
export const TRAIN_STATES = ["IDLE", "STATIONARY", "MOVING"] as const;
export type TrainState = (typeof TRAIN_STATES)[number];
export type TrainEvent = "start" | "dwell" | "depart" | "travel" | "arrive" | "turn_around" | "retire" | "place_at_station" | "place_between";

export const train = machine<TrainState, TrainEvent>({
  name: "Train",
  about: "A train running a line, moved by the world clock every 5 minutes. Lines run both ways: at the end of the line a train turns around onto the line's return twin.",
  stored: "trips.state (with trips.active, trips.route_id, trips.stop_index, trips.progress)",
  initial: "IDLE",
  states: {
    IDLE: { about: "Not running (never started, or retired at the end of a line with no return run).", on: { start: "STATIONARY" } },
    STATIONARY: {
      about: "Standing at stop_index; progress = minutes waited there. Passengers board and get off now.",
      on: { dwell: "STATIONARY", depart: "MOVING", turn_around: "STATIONARY", retire: "IDLE", place_at_station: "STATIONARY", place_between: "MOVING" },
    },
    MOVING: {
      about: "Between stop_index and the next station; progress = km travelled since leaving.",
      on: { travel: "MOVING", arrive: "STATIONARY", place_at_station: "STATIONARY", place_between: "MOVING" },
    },
  },
  events: {
    start: "Start from the first station",
    dwell: "Wait at the platform (a tick shorter than the station's dwell time)",
    depart: "Leave for the next station (the dwell time is up)",
    travel: "Run on towards the next station",
    arrive: "Reach the next station",
    turn_around: "At the end of the line, switch to the return run and wait again",
    retire: "At the end of a line with no return run, stop",
    place_at_station: "An admin puts the train at a station",
    place_between: "An admin puts the train partway along a segment",
  },
  refusals: {
    start: "Trip is already running.",
    place_at_station: { IDLE: "Start the trip first." },
    place_between: { IDLE: "Start the trip first." },
  },
});

/** The bits of a trip row these helpers need. */
export interface TrainRow {
  state: TrainState;
  active: number | boolean;
  stop_index: number;
  progress: number;
}

/** Km travelled since leaving stop_index (0 unless MOVING). */
export const kmIntoSegment = (t: TrainRow) => (t.state === "MOVING" ? t.progress : 0);
/** Minutes waited at stop_index so far (0 unless STATIONARY). */
export const minutesWaited = (t: TrainRow) => (t.state === "STATIONARY" ? t.progress : 0);

/**
 * Where a train is relative to the station at position `pos` on its route:
 * - "approaching": still to come (it hasn't reached pos yet)
 * - "at-platform": standing at pos now (passengers can board or get off)
 * - "departed":    gone (it has left pos, or is past it)
 * - "not-running": the train isn't running
 */
export type StationStatus = "approaching" | "at-platform" | "departed" | "not-running";
export function stationStatus(t: TrainRow, pos: number): StationStatus {
  return t.active ? positionStatus(t, pos) : "not-running";
}
/**
 * stationStatus, judged by position alone (running or not). A train that has stopped at `pos`
 * counts as at the platform there; one that has moved on from it, or is past it, has departed.
 */
export function positionStatus(t: Omit<TrainRow, "active" | "progress">, pos: number): Exclude<StationStatus, "not-running"> {
  if (t.stop_index < pos) return "approaching";
  if (t.stop_index > pos || t.state === "MOVING") return "departed";
  return "at-platform";
}
/** Still due at `pos`: on its way, or at the platform now. */
export const dueAt = (t: TrainRow, pos: number) => {
  const s = stationStatus(t, pos);
  return s === "approaching" || s === "at-platform";
};
