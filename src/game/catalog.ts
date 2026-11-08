// The industry game's rules: what you can trade, where, and what you can build.
//
// You're based in Berlin. Raw materials are sold at stations all over the world, and there's no
// air or sea freight, only rail: you ride out, buy, and ride home. With the materials in your
// Berlin warehouse you build a factory, run production batches (in real time), and ride your
// products out to the cities that pay best for them. Berlin buys products too, but for less.

/** Players start (and are based) here. The first name that exists wins. */
export const HOME_STOP_NAMES = ["Berlin Hauptbahnhof", "Berlin"];

export const STARTING_BALANCE = 5000;
/** Units of goods you can carry on the train. Your Berlin warehouse has no limit. */
export const CARGO_CAPACITY = 60;
/** Berlin buys finished products for this share of the average price elsewhere. */
export const HOME_SALE_SHARE = 0.55;

export type GoodId =
  | "polysilicon"
  | "copper"
  | "photoresist"
  | "neon"
  | "lithium"
  | "cobalt"
  | "nickel"
  | "graphite"
  | "cocoa"
  | "sugar"
  | "milk"
  | "vanilla"
  | "chips"
  | "batteries"
  | "chocolate";

export interface Good {
  id: GoodId;
  name: string;
  /** Units are crates (raw materials) or cases (products). */
  unit: string;
  kind: "raw" | "product";
}

export const GOODS: Record<GoodId, Good> = {
  polysilicon: { id: "polysilicon", name: "Polysilicon", unit: "crate", kind: "raw" },
  copper: { id: "copper", name: "Copper", unit: "crate", kind: "raw" },
  photoresist: { id: "photoresist", name: "Photoresist", unit: "drum", kind: "raw" },
  neon: { id: "neon", name: "Neon gas", unit: "cylinder", kind: "raw" },
  lithium: { id: "lithium", name: "Lithium carbonate", unit: "crate", kind: "raw" },
  cobalt: { id: "cobalt", name: "Cobalt", unit: "crate", kind: "raw" },
  nickel: { id: "nickel", name: "Nickel", unit: "crate", kind: "raw" },
  graphite: { id: "graphite", name: "Graphite", unit: "crate", kind: "raw" },
  cocoa: { id: "cocoa", name: "Cocoa beans", unit: "sack", kind: "raw" },
  sugar: { id: "sugar", name: "Cane sugar", unit: "sack", kind: "raw" },
  milk: { id: "milk", name: "Milk powder", unit: "sack", kind: "raw" },
  vanilla: { id: "vanilla", name: "Vanilla", unit: "box", kind: "raw" },
  chips: { id: "chips", name: "Microchips", unit: "case", kind: "product" },
  batteries: { id: "batteries", name: "Battery packs", unit: "case", kind: "product" },
  chocolate: { id: "chocolate", name: "Chocolate", unit: "case", kind: "product" },
};

export type IndustryId = "chocolate" | "batteries" | "chips";

export interface Industry {
  id: IndustryId;
  name: string;
  blurb: string;
  /** To build the factory: credits, plus materials in your Berlin warehouse. */
  build: { credits: number; materials: Partial<Record<GoodId, number>> };
  /** Each production batch: inputs from the warehouse → output into it, after `hours`. */
  recipe: { inputs: Partial<Record<GoodId, number>>; output: GoodId; quantity: number; hours: number };
}

// Ordered from the easiest start to the most ambitious.
export const INDUSTRIES: Record<IndustryId, Industry> = {
  chocolate: {
    id: "chocolate",
    name: "Chocolate factory",
    blurb: "Cocoa from West Africa, sugar from Brazil, milk from the Netherlands and vanilla from Tahiti.",
    build: { credits: 2000, materials: { cocoa: 8, sugar: 6, milk: 4, vanilla: 2 } },
    recipe: { inputs: { cocoa: 4, sugar: 2, milk: 2, vanilla: 1 }, output: "chocolate", quantity: 24, hours: 4 },
  },
  batteries: {
    id: "batteries",
    name: "Battery works",
    blurb: "Lithium from the Andes, cobalt from the Copperbelt, nickel from Siberia and graphite from China.",
    build: { credits: 6000, materials: { lithium: 6, cobalt: 4, nickel: 4, graphite: 6 } },
    recipe: { inputs: { lithium: 3, cobalt: 2, nickel: 2, graphite: 3 }, output: "batteries", quantity: 6, hours: 8 },
  },
  chips: {
    id: "chips",
    name: "Semiconductor fab",
    blurb: "Polysilicon from Xinjiang, copper from Chile, photoresist from Japan and neon from Russia.",
    build: { credits: 12000, materials: { polysilicon: 8, copper: 4, photoresist: 4, neon: 4 } },
    recipe: { inputs: { polysilicon: 4, copper: 2, photoresist: 2, neon: 2 }, output: "chips", quantity: 16, hours: 12 },
  },
};

/**
 * Markets, by station name: raw materials they sell, products they buy, at base prices (credits
 * per unit). Prices drift day to day (see priceAt). A station that doesn't exist in this world
 * simply has no market.
 */
export const MARKETS: Record<string, { sells?: Partial<Record<GoodId, number>>; buys?: Partial<Record<GoodId, number>> }> = {
  // Raw materials
  "Ürümqi South": { sells: { polysilicon: 40, graphite: 18 } },
  "Santiago Estación Central": { sells: { copper: 30, lithium: 34 } },
  "Tokyo Central Station": { sells: { photoresist: 60 }, buys: { chips: 55, batteries: 70, chocolate: 14 } },
  "Saint Petersburg Moskovsky": { sells: { neon: 25 } },
  "La Paz Central": { sells: { lithium: 28 } },
  "Lusaka Central": { sells: { cobalt: 50, copper: 26 } },
  "Yakutsk Central": { sells: { nickel: 35 } },
  "Beijing West Station": { sells: { graphite: 15 }, buys: { chocolate: 13 } },
  "Dakar Central": { sells: { cocoa: 14 } },
  "São Paulo Luz": { sells: { sugar: 6, cocoa: 18 } },
  "Amsterdam Centraal": { sells: { milk: 9 }, buys: { chocolate: 15 } },
  "Papeete Central": { sells: { vanilla: 38 } },
  // Buyers of finished products
  "Seoul Station": { buys: { chips: 60, batteries: 72 } },
  "Hong Kong West Kowloon": { buys: { chips: 58 } },
  "Los Angeles Union Terminal": { buys: { chips: 62, chocolate: 15 } },
  "Shanghai Hongqiao Station": { buys: { batteries: 75, chips: 52 } },
  "Chicago Grand Central": { buys: { batteries: 68, chocolate: 13 } },
  "Paris Gare du Nord": { buys: { chocolate: 16, batteries: 66 } },
  "London King's Cross": { buys: { chocolate: 15 } },
  "New York Central Terminal": { buys: { chocolate: 17, chips: 58 } },
  "Dubai Central Station": { buys: { chocolate: 18, batteries: 70 } },
  "Moscow Belorussky Station": { buys: { chocolate: 14, batteries: 64 } },
};

/** What Berlin pays for products: a share of the average price at the markets that buy them. */
export function homeBuys(): Partial<Record<GoodId, number>> {
  const out: Partial<Record<GoodId, number>> = {};
  for (const good of Object.values(GOODS)) {
    if (good.kind !== "product") continue;
    const prices = Object.values(MARKETS).flatMap((m) => (m.buys?.[good.id] ? [m.buys[good.id]!] : []));
    if (prices.length) out[good.id] = Math.max(1, Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * HOME_SALE_SHARE));
  }
  return out;
}

/** A small, stable hash of a string, for spreading price cycles out. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/**
 * Today's price: the base price drifting ±15% on a weekly cycle that's different for every
 * station and good, so it pays to check the boards before you travel. Whole credits.
 */
export function priceAt(base: number, stopName: string, good: GoodId, at: number): number {
  const days = at / 86_400_000;
  const phase = hash(`${stopName}:${good}`) * 2 * Math.PI;
  return Math.max(1, Math.round(base * (1 + 0.15 * Math.sin((2 * Math.PI * days) / 7 + phase))));
}

export const isGood = (id: string): id is GoodId => id in GOODS;
export const isIndustry = (id: string): id is IndustryId => id in INDUSTRIES;
