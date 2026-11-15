import { machine } from "./machine";

/**
 * An order on the contracts board: a station wants a quantity of a good by a deadline, at a
 * premium. The first player to deliver it all there is paid. Not stored as a column: derived
 * from the contracts row by contractState().
 */
export const CONTRACT_STATES = ["OPEN", "DELIVERED", "EXPIRED"] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];
export type ContractEvent = "deliver" | "expire";

export const contract = machine<ContractState, ContractEvent>({
  name: "Contract",
  about: "An order on the contracts board: a station wants a quantity of a good by a deadline, and pays a premium to whoever delivers it all there first.",
  stored: "derived from contracts (delivered_at set = DELIVERED; otherwise expires_at past = EXPIRED; else OPEN)",
  initial: "OPEN",
  states: {
    OPEN: { about: "Waiting for someone to deliver, until expires_at.", on: { deliver: "DELIVERED", expire: "EXPIRED" } },
    DELIVERED: { about: "Someone delivered it and was paid (delivered_by)." },
    EXPIRED: { about: "Nobody delivered in time." },
  },
  events: {
    deliver: "A player hands over the goods at the station and is paid",
    expire: "The deadline passes",
  },
  refusals: {
    deliver: { DELIVERED: "Someone else delivered this one first.", EXPIRED: "This contract has expired." },
  },
});

export interface ContractRow {
  expires_at: number;
  delivered_at: number | null;
}
/** The state of a contract row at time `now`. */
export function contractState(row: ContractRow, now: number): ContractState {
  if (row.delivered_at !== null) return "DELIVERED";
  return row.expires_at <= now ? "EXPIRED" : "OPEN";
}
