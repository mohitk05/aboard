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
| Battery works | 6,000 cr, plus 6 lithium, 4 cobalt, 4 nickel and 6 graphite | 3 lithium, 2 cobalt, 2 nickel and 3 graphite make 6 cases in 8 h | Lithium: La Paz, Santiago. Cobalt: Lusaka. Nickel: Yakutsk, Toronto. Graphite: Beijing, Ürümqi, Delhi. | Shanghai, Seoul, Tokyo, Dubai, Chicago, Paris |
| Semiconductor fab | 12,000 cr, plus 8 polysilicon, 4 copper, 4 photoresist and 4 neon | 4 polysilicon, 2 copper, 2 photoresist and 2 neon make 16 cases in 12 h | Polysilicon: Ürümqi. Copper: Santiago, Lusaka. Photoresist: Tokyo, or pricier, Dubai. Neon: Irkutsk. | LA, Seoul, Hong Kong, New York, Tokyo, Shanghai |

The chocolate factory is the cheapest place to start. The semiconductor fab costs more than you start with, so you have to earn your way to it.

**Prices** drift by up to ±15% on a weekly cycle that differs for each station and good, so it pays to check the boards (Business → Markets) before setting off. Supply is unlimited for now.

All of the numbers are in `src/game/catalog.ts`. A market belongs to a station by name, so a world without that station simply has no market there.

## Where it's built

- **Server.** `World` in `src/world/world.ts` (the "industry game" section) holds balances, holdings (cargo or warehouse), factories and a ledger (schema v4). It checks every rule: you must be at a station and not on a train to trade, and in Berlin to unload, load or build. Finished batches are delivered on the world tick, or when you next look.
- **API.** `/api/game/*` (see the README).
- **App.**
  - The **Business** tab shows your credits, each industry (what it needs and where to get it, then production), your warehouse and cargo, today's prices everywhere, and your ledger.
  - The station screen has a **Market** panel wherever there's a market.
  - The station details on the globe list what each market buys and sells.

## Next

- **Couriers.** Other players carry goods between stations for you, for a fee, so you can stay home and run your factories.
- **Markets that react.** Prices respond to what players buy and sell, then recover over days.
- **Growth.** Bigger warehouses, more cargo space, more factory lines, and more industries, including ones that use other industries' products (batteries plus chips make electric cars).
- **More of Germany.** Factories in other German cities, with goods moved between them.
