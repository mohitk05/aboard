# Aboard as a carrier game

Status: design agreed, not yet implemented (2026-11-06).

## The idea

You are a long-distance carrier. You ride real routes at real-world pace, buy what a city makes cheaply, and sell it where it is scarce. Distance is what makes money: Portuguese cork is cheap in Lisbon and dear in Irkutsk, and getting it there takes ten days. The journey is the game: you choose a route, plan your sales while the scenery goes by, and come back when the train pulls into a station.

### Decisions

| Area | Decision |
| --- | --- |
| Pace | Real time, at advanced-railway speeds (updated 2026-11-07): maglev ~450 km/h, high-speed 280–320, sleepers 160; default 300. London → Tokyo ≈ 2 days. Originally real-world pace (~60 km/h, Lisbon → Vladivostok ≈ 10 days). |
| Economy | Simulated markets. Each city produces some goods and wants others. Prices move with stock levels and recover over days. |
| Between stops | Window moments (scenery tied to the train's real position, collected in a journal) and telegraph news (price and disruption news that arrives while you travel). |
| Progression | Cargo capacity (compartment tiers) and shared projects that change the map for everyone. |

### Not in this version

These are deliberately left out. Each can be added later without reworking what's here:

- Player-to-player markets
- A system for fellow passengers
- Trade licenses
- Route unlocking

## Core loop

1. **At a stop:** see the local market, buy and sell within your cargo space and budget, and choose a train.
2. **Travelling:** telegraph news arrives, window moments happen, and you set **arrival orders** (for example, "at Novosibirsk, sell all tea if the price is at least 40").
3. **Arrival:** a notification is sent. Your arrival orders run whether or not you're online. If you are online, trade by hand during the dwell time.
4. **Over weeks:** upgrade your compartment and put money into shared projects.

Real-world pace makes arrival orders necessary: nobody will be awake for every stop, and missing one shouldn't punish you. They also turn the time between stops into planning time, which is what the telegraph news is for.

## Systems

The models below are sketches. Each becomes a SQLite table in the `World` Durable Object (`src/world/schema.ts`), added as a new migration.

### 1. Time and movement

**Done** as part of the move to Cloudflare Workers (see `src/world/world.ts`, `src/lib/geo.ts`):

- **Distance in km.** Great-circle (haversine) distance × a rail detour factor of 1.25, stored per route segment in `route_stops.km`. The old version used whole degrees and got the antimeridian wrong.
- **Any speed works.** Trips have `speed_kmh` (60 by default). The old rule that speeds had to divide every segment evenly (`possibleSpeeds`) is gone; a train arrives once it has covered the segment.
- **Real dwell times.** Each stop has `dwellMinutes` (20 by default). Use about 60 for major cities. Trading by hand is only possible while the train is stationary.

Checked in `test/api.test.ts`: Lisbon → Vladivostok through 10 stops is about 13,900 km and takes 9.8 days.

### 2. Goods

A fixed, hand-written catalogue to start with (about 15–25 goods):

```js
Good {
  key: 'cork',            // stable id
  name: 'Cork',
  size: 1,                // cargo units per crate
  basePrice: 20,          // world reference price
  fragile: false,         // needs sleeper tier or above
  highValue: false        // needs private cabin or above
}
```

### 3. Markets (simulated)

There is one market entry per (stop, good) for the goods a city trades:

```js
MarketEntry {
  stop, good,
  role: 'PRODUCES' | 'CONSUMES' | 'BOTH',
  equilibrium: 200,       // stock the city settles at
  stock: 200,             // current stock
  localFactor: 0.6        // < 1 = cheap here (producer), > 1 = dear (consumer)
}
```

- **Price:** `price = basePrice × localFactor × (equilibrium / max(stock, 1))^k`, with k ≈ 0.5, clamped to [0.25×, 4×] of `basePrice × localFactor`.
- **Spread:** the city buys from you at about 90% of the price and sells to you at 100%, so trading back and forth in one place loses money.
- **Recovery:** each tick, `stock` moves about 2% of the way back toward `equilibrium`. A heavy sale takes roughly three days to fade, so a popular route pays less until the market recovers.
- **Disruptions** (below) change `equilibrium` or `localFactor` for a while.

### 4. Cargo and compartments

```js
User.compartment: 'HARD_SEAT' | 'SLEEPER' | 'CABIN' | 'FREIGHT'
User.cargo: [{ good, qty, avgCost }]   // travels with the user
```

| Tier | Capacity (units) | Unlocks | Upgrade cost |
| --- | --- | --- | --- |
| Hard seat | 4 | — | start |
| Sleeper | 12 | fragile goods | tune |
| Private cabin | 30 | high-value goods | tune |
| Freight car | 120 | — | tune |

The compartment upgrade is permanent. Ticket price (currently `COST_PER_UNIT_DISTANCE`) also goes up with tier, so a bigger compartment costs more to run.

### 5. Money

`User.wallet` stores whole numbers only, never floats. New players start with enough for one ticket and a few crates. Every change to the balance (fare, buy, sell, contribution) is recorded so balances can be checked:

```js
Transaction { user, kind: 'FARE'|'BUY'|'SELL'|'CONTRIBUTE', amount, ref, createdAt }
```

Buying and selling have to be atomic. This comes for free: the whole world is one Durable Object, which handles one request at a time, so checking `wallet >= cost`, stock and cargo space and then writing inside one `transactionSync` can't be raced.

### 6. Telegraph

These are news items delivered to players who are on a trip:

```js
Telegram { user, kind: 'PRICE'|'DISRUPTION'|'PROJECT', text, stop?, good?, createdAt, readAt? }
```

- **What creates them:** a disruption starting or ending, a large price change at a stop on or near your route, and shared-project milestones.
- **How much:** at most a few a day per player, ranked by relevance to stops still ahead on your route. They should help you plan, not flood you.
- This is a separate model from `Message`/`Conversation`, which stay for messages between players.

### 7. Window moments

```js
WindowMoment {
  from: Stop, to: Stop,           // the segment it belongs to
  at: 0.42,                       // fraction of the way along the segment
  localHours?: [5, 8],            // optional: only at dawn, etc.
  months?: [12, 1, 2],            // optional: winter only
  title, text, image?
}
User.journal: [{ moment, trip, seenAt }]
```

On each tick, for every trip that is moving, find the moments whose `at` the train passed during that tick and add them to each onboard player's journal. They're unlocked automatically and need no action. Filling in the journal is a quiet goal of its own, and moments limited to certain hours or seasons give a reason to ride the same line again. The content is written by hand, a few per segment.

### 8. Disruptions

```js
Disruption {
  kind: 'STRIKE'|'FLOOD'|'HARVEST'|'FESTIVAL'|'SNOW',
  stop?, segment?,
  effects: [{ good, equilibriumMult?, localFactorMult? }],
  speedMult?,                      // e.g. 0.5 for snow on a segment
  startsAt, endsAt
}
```

A scheduled job creates them at random, keeping a small number active across the world at once. Each one also creates a telegram. Their job is to keep the best routes shifting, so players have to plan instead of repeating one profitable loop.

### 9. Shared projects

```js
Project {
  key: 'bering-tunnel', name, description,
  goal: 5_000_000, funded: 0,
  effect: { addStops: [...], addRoutes: [...] },
  completedAt?
}
ProjectContribution { project, user, amount, createdAt }
```

- Players contribute from their wallet (recorded as a `Transaction`). When the total reaches the goal, the project's stops and routes are created and every player gets a telegram.
- Contributors are listed on the project, and the biggest contributors could name a station.
- Start with one modest project (a new branch line) to test the idea before the Bering Strait tunnel.

## Changes to the tick (`World.tick` in `src/world/world.ts`)

The tick runs on a Durable Object alarm every `WORLD_INTERVAL_MINUTES` (5). Each tick:

1. Board and drop off passengers, against where trains are now (already built).
2. Move trips by km speed and handle dwell times (already built). Add any disruption `speedMult`.
3. **New:** run arrival orders for players whose train has just arrived.
4. **New:** unlock window moments for onboard players.
5. **New:** move market stock back toward equilibrium.

Run these at their own, slower intervals: create and expire disruptions, send telegrams, and check whether projects are complete.

## API additions

- `GET /stops/:id/market`: prices, stock and roles at a stop
- `POST /market/buy`, `POST /market/sell`: `{ good, qty }`, only while at the stop or while the train is stationary there
- `GET/POST/DELETE /orders`: arrival orders
- `GET /me/cargo`, `GET /me/wallet`, `GET /me/journal`, `GET /me/telegrams`
- `POST /me/compartment/upgrade`
- `GET /projects`, `POST /projects/:id/contribute`

## Build order

**0. Fix what blocks this. Done** in the move to Workers and Durable Objects. In the old Express/MongoDB server:
- `User.find(...query)` threw, so the passenger half of the tick never ran.
- Changes to users were never saved, because `userPromises` was never filled.
- Stops were compared as ObjectIds by reference, which is always false.
- `.catch(e => e)` hid all of the above.
- Passwords were stored in plain text, and logins were open to NoSQL injection.

Boarding, riding and getting off are now covered by tests. Passwords are hashed with PBKDF2, and every input is checked against a schema.

**1. Real-world pace. Done.** km distances, any speed, dwell times, and a test of the Lisbon → Vladivostok travel time.

**2. Economy core.** Goods catalogue, market entries for the existing stops, wallet and transactions, buy/sell with atomic guards, stock recovery.

**3. Cargo.** Compartment tiers and capacity checks. Ticket price changes with tier.

**4. Arrival orders.** Without these, real-world pace can't be played.

**5. Telegraph and disruptions.** These go together, because disruptions are what make the news worth reading.

**6. Window moments.** Model, unlocking on each tick, journal. Write content for one route first.

**7. Shared projects.** One small project first.

Each step can be played and tested by itself. Steps 0–4 are the smallest version of the game.

## Open questions

- **Spoilage:** should perishable goods (fish, fruit) lose value over a 10-day trip? This adds a speed-versus-cost decision, but also something extra to manage.
- **Starting money and upgrade costs:** tune these with a simple simulation once the markets exist.
- **Where goods data comes from:** which goods each city produces and wants, hand-written for the existing stops. Who writes it?
- **Map coverage:** the Bering Strait tunnel needs stops in Alaska and North America, which aren't in the world yet.
- **Missing a stop:** if you miss a stop and have no arrival order, should anything happen automatically (for example, nothing is sold), or should it just be logged?
