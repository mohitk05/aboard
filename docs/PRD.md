# Aboard: Product Requirements

Status: draft v1 (2026-11-21). Currency is **tokens**. Levels 1–11 are agreed. Everything marked **Open** still needs a decision.
Read this first. [Industry.md](Industry.md) describes the game as it is built today; this document describes where it is going and why.

## 1. One-line pitch

You are one of the people who couldn't leave a ruined Earth. Run a supply line on the last working railways and keep ordinary people alive, one need at a time.

## 2. Origin story (final)

The game's world, and the reason every rule exists.

- **The sky and sea closed.** In 2190 there were twelve billion people and one tired planet. Those who could, left on great arks to new worlds among the stars. The people who stayed swore to hold the planet together (the Accord of the Remaining), and in doing so they cooled the sky and warmed the sea. Above three thousand metres wings find nothing to hold, and the oceans never calmed. Nothing flies. No ship survives.
- **So we built rails.** Tunnels under the Atlantic and the Bering Strait, lines across the steppes and through the Andes. The Great Lines took two hundred years. Trains cross continents in days, and the railway is how the world moves.
- **The Remaining, and you.** You are one of the people who stayed behind. When you arrive at your first station, the **Rail Authority** grants you **5,000 tokens** to start a supply line. It is trust, not a prize: you are expected to turn it into survival for ordinary people.
- **The world has been damaged on purpose, and carefully.** Dust, ash and smoke are common. Forests are preserved and closed to ordinary people, so wood is rare and paper is a luxury. Basic resources are scarce and hard to reach, which is why trade happens at all.

Story screens: three short beats on the story page, each over one painting (see `web/src/screens/Story.tsx`). The long history (the Exodus, the Accord, the Thin Sky, the Wild Sea) stays on a "Read the full history" page.

## 3. Who it is for and what it feels like

- Players who like slow, real-time strategy: planning, waiting, checking in.
- It should feel quiet, serious and a little melancholy, with care for the people you serve. It should not feel like chasing a leaderboard.
- Progress is measured in **people served**, not only tokens.

## 4. Core loop (unchanged)

1. Ride out. Buy a train ticket to a station that sells what you need.
2. Buy raw materials into your cargo (up to 60 units).
3. Ride home. Unload into your warehouse.
4. Build a factory and run production batches in real time.
5. Deliver the product to the places that need it, and sell the rest.

Everything runs in real time. Prices are hidden unless you are at the station. Buying pushes a price up and selling pushes it down, and the effect fades over about a day. See [Industry.md](Industry.md) for the exact rules.

## 5. Levels (replaces "choose your industry")

Each level is a **need people have**. You serve it by setting up the factory that meets it. Rules for every level: no more than 4 raw materials; raw materials stay simple and easy to remember; **every fifth level is a luxury**.

| Lvl | Need | Product | Raw materials | Notes |
| --- | --- | --- | --- | --- |
| 1 | Food | Bread | grain, salt, yeast | The tutorial |
| 2 | Water | Clean water | sand, charcoal, chlorine | Weekly regional shortage (§6) |
| 3 | Health | Medicine kits | herbs, alcohol, cotton | |
| 4 | Air | Masks | cotton, charcoal, rubber | Dust and ash; optional "ash season" events |
| **5** | **Luxury I** | Chocolate | cocoa, sugar, milk, vanilla | Exists today |
| 6 | Shelter | Shelter kits | wool, clay, coal | No timber (forests are closed) |
| 7 | Power | Batteries | lithium, nickel, graphite | Cobalt dropped |
| 8 | Machines | Electronics | sand, copper, gold | Replaces chips |
| 9 | Communications | Radios | aluminium, plus electronics and batteries | Uses earlier products as inputs |
| **10** | **Luxury II** | Books | wood pulp (licensed stations only), ink pigment, cloth | Scarce on purpose |
| 11 | Construction | Building supplies | iron ore, limestone, clay, sand | No timber |
| 12+ | **Open** | | | See §8 |

Shared raw materials make levels compete with each other, and that is intended: sand (water, electronics, construction), cotton (medicine, masks), charcoal (water, masks), clay (shelter, construction).

## 6. Recurring need: the water shortage

- **Weekly.** One region at a time loses clean water. (Large, rarer shortages are possible later.)
- **Regional.** Only that region is affected.
- **Warned.** The telegraph announces it about two days ahead, so players can prepare. It should never be a surprise.
- **One dry day.** For 24 hours, factories in the region cannot run. Batches pause and resume after.
- **Relief.** Delivering clean water to a station in the dry region shortens the dry period. This is how "ask someone for help, or go seek water elsewhere" works.
- **Gentle consequences.** No goods are lost and no factory is destroyed. The cost is a lost day.
- **Open:** all factories are in Berlin today. Either (a) Berlin takes its turn at being dry, so everyone is paused together and relief comes from elsewhere, and other regions going dry stops trading there and posts a water contract; or (b) players start in different home regions. Recommendation: start with (a).

## 7. Onboarding

Learn by doing, in five steps. Each step is one prompt on the Journey screen; everything else stays hidden until needed.

1. **Welcome.** The three story beats, then the 5,000 tokens on arrival.
2. **First ride.** A short trip to fetch grain for a hungry town (the level 1 contract). Explain real time in one line: close the app and you will be told when it is your stop.
3. **Buy at the station.** Prices rise as you buy, and you can carry 60.
4. **Ride home and build.** Unload, build the bakery, start a batch.
5. **Deliver.** Take the bread to people who need it. Show the first "people served" moment.

Each step has a progress strip and a skip link. Each term (cargo, warehouse, contract) is explained once, when it first appears. Mockups: the story, levels, first ride, station and level-up screens (visual style as in [Design.md](Design.md)).

## 8. Open: levels 12 and later

Not agreed. Ideas so far:

- **Rebuilding (cooperative).** Shared projects such as reopening a rail line or rebuilding a water tower. Each needs a stack of goods no single player can supply (building supplies, bread, water, shelter, batteries, radios). Contributions are recorded; finished projects change the world permanently (for example, resistance to water shortages, a new line, or a station that grows). Late projects could reopen mines or fields and unlock new raw materials.
- **More luxuries at levels 15, 20 and so on.** Candidates: tea and coffee, wine and spirits, silk and perfume, instruments, jewellery.
- **An industrial age after about level 20.** It should be unlocked by rebuilding, not given by default, because basic resources are scarce.
- **Open:** whether the later levels are cooperative or stay single-player.

## 9. Open decisions

1. Factory location: Berlin only, or different home regions (§6).
2. Do levels persist forever, or can they be lost?
3. Do radios (and later products) need finished products as inputs, or only raw materials? Currently yes.
4. Level 12 onward (§8).

## 10. Decisions on the risks below

- **Accounts:** one per email (already enforced) and signup stays invite-only. If signups ever open: email verification, and block `+` aliases and disposable domains.
- **Player trades:** happen only through messages, as a trade offer attached to a chat message that the other player accepts. Maximum 5 per day per player. Player-to-player trades do not count towards weekly earnings, and offer prices are capped to a band around the market price. The public order board goes away.
- **Fares:** cancelling a ticket refunds 75% of the fare (a 25% cancellation fee). Raising the fares themselves is still open.
- **Starter contracts:** become the level 1 tutorial, capped per player (for example 2 in total).

## 11. Known risks (from review of the current code)

- **Alt-account funnelling.** Sales through player orders count towards weekly earnings, and order prices are not tied to market prices, so one person with two accounts can push one to the top. Exclude player-to-player trades from weekly earnings, or cap order prices against the market.
- **Travel is almost free.** Fares are 0.01 tokens per km (called credits in the code today), and cancelling a ticket refunds it in full. Time is the only cost.
- **Orders bypass market price effects,** so players can buy materials from each other and skip the ride-out loop. Consider gating orders to a later level.
- **Starter contracts can be farmed** (about 2.5× the price, refilled every half hour, only for players without a factory).
- **Market griefing** on shallow markets (vanilla, and rare goods in general).
- **Bots are predictable** and ignore orders and starter contracts, and will need to learn the new needs.

## 12. Gaps between this PRD and the code

The code today has three industries only: chocolate, batteries, chips (`src/game/catalog.ts`). To reach this PRD:

- Add goods and factories for levels 1–4, 6, 8 (replacing chips), 9–11, and the new raw materials. Drop cobalt from batteries.
- Replace the order board with message trade offers (5 a day), and change the ticket refund to 75%.
- Rename credits to tokens throughout.
- Add a level and "people served" progression, and the arrival reward.
- Add the weekly regional water shortage and the telegraph warning.
- Shorten the story to three beats and add the full-history page (`web/src/screens/Story.tsx`).
- Rebuild the tutorial and level screens around needs.
- Teach the bots (`src/game/bot.ts`) the new ladder.
- After a rule change in `src/machines/`, run `npm run machines` and `npm test`.
