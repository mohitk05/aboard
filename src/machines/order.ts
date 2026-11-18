import { machine } from "./machine";

/**
 * A player's order on the contracts board: to buy (credits held) or to sell (goods held) a
 * quantity of a good at a price each, settled between Berlin warehouses. Others fill it a part at
 * a time. Not stored as a column: derived from the orders row by orderState().
 */
export const ORDER_STATES = ["OPEN", "FILLED", "CANCELLED", "EXPIRED"] as const;
export type OrderState = (typeof ORDER_STATES)[number];
export type OrderEvent = "fill" | "fill_last" | "cancel" | "expire" | "give_back";

export const order = machine<OrderState, OrderEvent>({
  name: "Order",
  about:
    "A player's order between players: to buy (the credits are held) or to sell (the goods are held) a quantity of a good at a price each. Other players fill it a part at a time; goods and credits move between Berlin warehouses. Whatever isn't filled goes back when it's cancelled or expires.",
  stored: "derived from orders (cancelled_at set = CANCELLED; remaining 0 = FILLED; expires_at past = EXPIRED; else OPEN)",
  initial: "OPEN",
  states: {
    OPEN: { about: "On the board until expires_at, with `remaining` still to fill.", on: { fill: "OPEN", fill_last: "FILLED", cancel: "CANCELLED", expire: "EXPIRED" } },
    FILLED: { about: "All of it was bought or sold." },
    CANCELLED: { about: "Its player took it down; what wasn't filled went back to them." },
    EXPIRED: { about: "Its time ran out. What wasn't filled goes back to its player on the next world tick.", on: { give_back: "EXPIRED" } },
  },
  events: {
    fill: "Another player fills part of it",
    fill_last: "Another player fills the rest of it",
    cancel: "Its player takes it down",
    expire: "Its time runs out",
    give_back: "What it still holds goes back to its player",
  },
  refusals: {
    fill: { FILLED: "That order has been filled.", CANCELLED: "That order was taken down.", EXPIRED: "That order has expired." },
    fill_last: { FILLED: "That order has been filled.", CANCELLED: "That order was taken down.", EXPIRED: "That order has expired." },
    cancel: { FILLED: "That order has been filled.", CANCELLED: "That order was already taken down.", EXPIRED: "That order has expired." },
  },
});

export interface OrderRow {
  remaining: number;
  expires_at: number;
  cancelled_at: number | null;
}
/** The state of an order row at time `now`. */
export function orderState(row: OrderRow, now: number): OrderState {
  if (row.cancelled_at !== null) return "CANCELLED";
  if (row.remaining <= 0) return "FILLED";
  return row.expires_at <= now ? "EXPIRED" : "OPEN";
}
