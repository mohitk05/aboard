# Aboard: build an industry

Status: first version built (2026-11-08). It replaces the free-roaming carrier idea in [CarrierGame.md](CarrierGame.md) as the main game; ideas from that doc (window moments, telegraph news, simulated markets) still fit on top.

## The game

The world has no planes and no ships. People built long-distance railways, and they carry people and goods. Everything happens in real time.

You run a business from **Berlin**. Every player starts at Berlin Hauptbahnhof, their home base, with **5,000 credits**. Your warehouse and factories are there. For now, industry can only be built in Germany, so home is always Berlin.

To build an industry you need raw materials from different parts of the world. At first nobody else will fetch them for you, so you go yourself:

1. **Ride out.** Buy a ticket (fares cost credits, 0.01 per km) and travel to a station that sells what you need.
2. **Buy.** At a station with a market, buy materials into your cargo. You can carry 60 units at a time.
3. **Ride home.** Back in Berlin, unload your cargo into the warehouse. It has no size limit.
4. **Build.** With the credits and the materials in your warehouse, build the factory.
5. **Produce.** Each batch takes materials from the warehouse and, after some real hours, puts products into it. You get a notification when a batch is ready.
6. **Sell.** Berlin buys products, but for about half what other cities pay. To get the best price, take products to the cities that want them.

Lines run both ways. A train that reaches the end of its line waits, turns around and heads back, for ever.

## Industries

| Industry | Build | Each batch | Materials (where) | Best markets |
| --- | --- | --- | --- | --- |
| Chocolate factory | 2,000 cr, plus 8 cocoa, 6 sugar, 4 milk powder and 2 vanilla | 4 cocoa, 2 sugar, 2 milk and 1 vanilla make 24 cases in 4 h | Cocoa: Dakar, São Paulo. Sugar: São Paulo, Mexico City. Milk powder: Amsterdam. Vanilla: Mumbai, or cheaper but much further, Papeete (Tahiti). | Dubai, New York, Paris, London, Amsterdam, LA, Tokyo |
| Battery works | 6,000 cr, plus 6 lithium, 4 cobalt, 4 nickel and 6 graphite | 3 lithium, 2 cobalt, 2 nickel and 3 graphite make 8 cases in 8 h | Lithium: La Paz, Santiago. Cobalt: Lusaka. Nickel: Yakutsk, Toronto. Graphite: Beijing, Ürümqi, Delhi. | Shanghai, Seoul, Tokyo, Dubai, Chicago, Paris |
| Semiconductor fab | 12,000 cr, plus 8 polysilicon, 4 copper, 4 photoresist and 4 neon | 4 polysilicon, 2 copper, 2 photoresist and 2 neon make 16 cases in 12 h | Polysilicon: Ürümqi. Copper: Santiago, Lusaka. Photoresist: Tokyo, or pricier, Dubai. Neon: Irkutsk. | LA, Seoul, Hong Kong, New York, Tokyo, Shanghai |

The chocolate factory is the cheapest place to start. The semiconductor fab costs more than you start with, so you have to earn your way to it.

Each step up the ladder should pay more per day than the one below it. Chocolate is cheap to make but can only be sold so fast, since you carry 60 cases at a time and big sales push the price down. Batteries and chips make fewer, dearer cases. With a sales trip every two days, the rough figures (selling at the best market, buying at the cheapest) are:

| Industry | Profit a day | Days to earn back the build cost |
| --- | --- | --- |
| Chocolate factory | ~300 | ~7 |
| Battery works | ~570 | ~10 |
| Semiconductor fab | ~740 | ~16 |

**Prices** drift by up to ±15% on a weekly cycle that differs for each station and good, so it pays to check the boards (Business → Markets) before setting off.

**Markets react to trading.** Every trade leaves a mark (a "load": units recently traded) on the market where it happens, shared by every player:

- Buying raw materials makes them dearer: each unit costs `base × (1 + load / depth)`.
- Selling products makes them cheaper: each unit fetches `base × depth / (depth + load)`.
- The price moves during a trade too, so selling 60 cases at once gets less per case than selling 10. The whole trade is priced by `tradeTotal`, the integral of the above.
- The load halves every 24 hours, so a market someone has just flooded or emptied comes back over a day or two.

`depth` is set per good: deep, cheap markets for bulk goods (sugar and milk: 400) and shallow ones for rare goods (vanilla: 60). Trading one depth's worth doubles a material's price, or halves a product's. If a rival has just sold their chocolate in Dubai, you'll get more in Tokyo. Whoever reaches Papeete first gets the cheapest vanilla. Supply never runs out; it just gets dearer.

## Standings

Business → Standings ranks every player two ways:

- **This week:** what you earned trading since Monday 00:00 UTC, which is sales less materials and fares (ledger kinds `buy`, `sell`, `fare` and `refund`). Building a factory is an investment, not a loss, so it doesn't count. Last week's top earner is named.
- **Net worth:** credits, plus factories at what they cost to build, plus goods at what they're worth (products at Berlin's base price, materials at their cheapest base price).

Players with private profiles are listed without their name. Admins aren't listed.

All of the numbers are in `src/game/catalog.ts`. A market belongs to a station by name, so a world without that station simply has no market there.

## Where it's built

- **Server.** `World` in `src/world/world.ts` (the "industry game" section) holds balances, holdings (cargo or warehouse), factories and a ledger (schema v4), and each market's recent trading (`market_load`, schema v8). It checks every rule: you must be at a station and not on a train to trade, and in Berlin to unload, load or build. Finished batches are delivered on the world tick, or when you next look.
- **API.** `/api/game/*` (see the README).
- **App.**
  - The **Business** tab shows your credits, each industry (what it needs and where to get it, then production), your warehouse and cargo, today's prices everywhere, and your ledger.
  - The station screen has a **Market** panel wherever there's a market.
  - The station details on the globe list what each market buys and sells.

## Next

- **Couriers.** Other players carry goods between stations for you, for a fee, so you can stay home and run your factories.
- **Growth.** Bigger warehouses, more cargo space, more factory lines, and more industries, including ones that use other industries' products (batteries plus chips make electric cars).
- **More of Germany.** Factories in other German cities, with goods moved between them.
