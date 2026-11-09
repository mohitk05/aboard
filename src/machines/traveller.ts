import { machine } from "./machine";

/**
 * Where a player is in a journey. Stored in users.state, alongside users.ticket_id (set while
 * READYTOGO or ONBOARD) and users.current_stop_id (where they are, or the train's last stop).
 */
export const TRAVELLER_STATES = ["ATSTATION", "READYTOGO", "ONBOARD"] as const;
export type TravellerState = (typeof TRAVELLER_STATES)[number];
export type TravellerEvent =
  | "buy_ticket"
  | "cancel_ticket"
  | "board"
  | "miss_train"
  | "pass_station"
  | "arrive"
  | "line_ended"
  | "trade"
  | "choose_station"
  | "move";

export const traveller = machine<TravellerState, TravellerEvent>({
  name: "Traveller",
  about: "Where a player is in a journey: free at a station, holding a ticket and waiting on the platform, or riding a train.",
  stored: "users.state (with users.ticket_id and users.current_stop_id)",
  initial: "ATSTATION",
  states: {
    ATSTATION: {
      about: "At a station with no ticket: can buy a ticket, trade, and (at home) use the warehouse and factories.",
      on: { buy_ticket: "READYTOGO", trade: "ATSTATION", choose_station: "ATSTATION", move: "ATSTATION" },
    },
    READYTOGO: {
      about: "Holding a ticket, waiting on the platform for the train. Can still trade, or cancel for a refund.",
      on: { board: "ONBOARD", cancel_ticket: "ATSTATION", miss_train: "ATSTATION", trade: "READYTOGO" },
    },
    ONBOARD: {
      about: "Riding a train. Set down automatically at the destination (or wherever the line ends).",
      on: { pass_station: "ONBOARD", arrive: "ATSTATION", line_ended: "ATSTATION" },
    },
  },
  events: {
    buy_ticket: "Buy a ticket",
    cancel_ticket: "Cancel the ticket",
    board: "Board the train (when it's at the platform)",
    miss_train: "The train leaves without you",
    pass_station: "The train moves on",
    arrive: "Get off at the destination",
    line_ended: "The line ends; everyone gets off",
    trade: "Buy, sell, load, unload or build",
    choose_station: "Choose where to start (admins, or anyone not yet anywhere)",
    move: "An admin moves the player",
  },
  refusals: {
    buy_ticket: "You already have a ticket.",
    cancel_ticket: {
      ATSTATION: { status: 404, message: "Ticket not found." },
      ONBOARD: "You can only cancel before boarding.",
    },
    trade: "You can only trade at a station, not on the train.",
    choose_station: "You can't change station while you have a ticket.",
    move: "They have a ticket; they can't be moved now.",
  },
});

/** Not on a train: trading, the warehouse and factories are available (at the right station). */
export const canTrade = (state: TravellerState) => traveller.can(state, "trade");
