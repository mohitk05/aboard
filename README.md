# aboard

A real-time industry game on a world-wide railway. There are no planes and no ships, only long-distance trains running real routes in real time, at the speeds of railways a little ahead of today's. Every player is based in **Berlin**: ride out to buy raw materials around the world, bring them home, build a factory (chocolate, batteries or semiconductors) and sell what you make. See [docs/Industry.md](docs/Industry.md) for the rules.

## Architecture

It runs on **Cloudflare Workers** and **Durable Objects**:

```
browser ──▶ web app (web/, static assets)        Vite + React + three.js, served by the same Worker
client ──HTTP /api──▶ Worker (src/index.ts)      routing, JWT auth, input validation
                   │  RPC
                   ▼
                 World Durable Object             all world state in its SQLite storage
                 (src/world/world.ts)             world clock = Durable Object alarm, every 5 min
```

- **One `World` object** holds stops, routes, trips, users, tickets and messages in SQLite (`src/world/schema.ts`). A Durable Object handles one request at a time, so ticket purchases (and, later, trades) are atomic without locks.
- **Live updates:** clients keep a WebSocket to the World (`/api/live`, hibernation API, so idle connections are free). It sends an event on every tick, when an admin changes the world, when anyone trades, and to conversation members when a message arrives; the app refetches just what changed. Polling remains as a fallback.
- **The world clock** is a Durable Object alarm. It is set when a trip starts and runs `World.tick()` every `WORLD_INTERVAL_MINUTES` while any trip is active.
- **Auth:** passwords are hashed with PBKDF2-SHA256 (WebCrypto). Sessions are HS256 JWTs signed with `JWT_KEY`, sent as an `HttpOnly; Secure; SameSite=Lax` cookie for the web app, or as `Authorization: Bearer` for scripts.
- **State machines:** travellers, trains, factories, invites, the live connection and the globe's camera are explicit state machines in `src/machines/`, shared by server and app. [docs/StateMachines.md](docs/StateMachines.md) (generated: `npm run machines`) has a diagram of each, with the rules and the exact refusal messages.
- **Scaling:** one object is plenty for now. When it isn't, split by region (one World per network of connected lines) and give each player their own object for inventory and messages.

## Interface

The whole app is a **three.js world** (`web/src/world3d/`), built following the `threejs-scene-setup` and `threejs-materials-lighting` skills in `.claude/skills/`:

- **A realistic Earth:** NASA Blue Marble imagery by day, city lights at night, terrain relief, sunlight glinting on water, atmospheric haze at the limb and a starfield, all lit by the sun where it really is right now (`earth.ts`, textures and credits in `web/public/textures/`).
- **Streamed satellite tiles:** zoom in and the globe swaps its whole-Earth texture for map tiles of just the area in view (Web Mercator, zoom 3–8), like a map app (`tiles.ts`). They're NASA GIBS imagery (Blue Marble by day, Black Marble city lights at night, public domain), fetched through the Worker at `/tiles/{day|night}/{z}/{x}/{y}.{jpg|png}`, which caches them at Cloudflare's edge because GIBS sends `no-store`.
- **Rail lines** in cool white at a constant on-screen width; hover one to highlight it.
- **Trains** made of a locomotive and carriages that follow the curve of the track, with windows that light up at night (`trains.ts`). They move smoothly between world ticks.
- **Station names only where they matter:** your home base (Berlin, tagged "Home base"), the station you're at, the stops on your journey, and every station of a line or train you've selected. Other stations are dots; hover one for its name.
- **Click a station** for a photo of the place (the lead image of its Wikipedia article, credited) and its live arrivals and departures. Hover one and its name brightens.
- **Click a train or a line** for its details. The same panels open from "Train details", "Line details" and "Station details" buttons (and station names in a line's details), so they're reachable by keyboard and screen readers too.

Every screen is a set of panels floating over the world, and steers the camera with `useWorldFocus()`: your station, your trip, the train you're on. The world draws at full frame rate only while it's moving or being touched, and at 15 fps otherwise.

Panels are plain HTML (`web/src/ui.tsx`), so text, forms and screen readers work as usual. The look is **mission control** ([docs/Design.md](docs/Design.md)): a black canvas where the Earth supplies all the colour, 1px hairlines instead of shadows, white ghost-pill buttons, titles in Redaction 35 and everything else in Barlow, with small tracked capitals for labels and navigation. Status colours only ever carry meaning, alongside text.

## Development

```sh
npm install                      # npm 11 recommended (npx npm@11 install)
cp .dev.vars.example .dev.vars   # set JWT_KEY and ADMIN_SECRET
npm run dev                      # builds the web app, then serves app + API on http://localhost:8787
npm run dev:web                  # in a second terminal: hot-reloading app on :5173, proxying /api to :8787
npm test                         # API tests run inside the Workers runtime (workerd)
npm run typecheck                # Worker and web app
npm run build                    # what Workers Builds runs: build the app, typecheck, test
npm run e2e                      # browser tests (Playwright) against a fresh `wrangler dev` world
npm run machines                 # regenerate docs/StateMachines.md after changing a state machine
python3 scripts/logo.py && node scripts/icons.mjs   # redraw the logo ("Abo" in Redaction 35 on black) and the app icons
```

After changing `wrangler.jsonc`, run `npm run cf-typegen` to regenerate `worker-configuration.d.ts`.

The web app lives in `web/` (Vite + React). The Worker serves its build from `web/dist`: requests to `/api`, `/api/*` and `/tiles/*` go to the Worker, and everything else is a static file, falling back to `index.html` so app routes survive a reload.

### Invites

Aboard is invite-only. In the admin console (**Admin → Invites**), create an invite link (optionally noting who it's for, and when it expires) and send it to someone. Each link signs up one person; the list shows who used which. Admins can also create accounts directly with `POST /api/user`.

### First admin

There are no admins at first. Create one with the bootstrap endpoint. It only works while no admin exists:

```sh
curl -X POST localhost:8787/api/admin/bootstrap \
  -H 'X-Admin-Secret: <ADMIN_SECRET>' -H 'Content-Type: application/json' \
  -d '{"user":{"username":"admin","email":"admin@example.com","password":"...","age":30}}'
```

Admins don't need a `currentStop`. Then create stops, routes and trips with the admin token.

### Seed data

- **Lisbon → Vladivostok:** the "Seed" button in the admin console (or `POST /api/admin/seed`). Safe to repeat.
- **The Nexus network** (21 stations on six continents, 6 lines, trains mid-journey, 8 travellers with tickets and chats), ported from the old MongoDB seed script:

  ```sh
  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-nexus.sh                       # live site
  BASE_URL=http://localhost:8787 ADMIN_EMAIL=… ADMIN_PASSWORD=… ./scripts/seed-nexus.sh         # local
  ```

  Needs `curl` and `jq`. It runs once (it stops if the Nexus stations exist) and prints the password all seeded travellers share (set `SEED_PASSWORD` to choose it). The top of the script lists where it differs from the old one.

- **Ten more lines** (`scripts/seed-routes.sh`): each runs through three Nexus stations and 4–6 new ones (50 new stations), from the Great Lakes Express to Cape to Bosphorus, with a train on each. Run it after the Nexus seed, the same way (`ADMIN_TOKEN=… ./scripts/seed-routes.sh` also works). It runs once.
- **Intercontinental lines** (`scripts/seed-intercontinental.sh`): six long-distance routes joining the continents through imagined tunnels (Darién Gap, South Atlantic, Southern Ocean, North Atlantic, Bering Strait, Pacific), four of them through South America, with 27 new stations and a 320–600 km/h train on each. Run it after the two seeds above.
- **Lines out of Berlin** (`scripts/seed-berlin.sh`): six express lines from Berlin Hauptbahnhof, the players' home base, straight out to where the raw materials are (São Paulo, Tokyo, Cape Town, Santiago, Yakutsk, Delhi), using existing stations, with two trains each: one leaving Berlin and one on its way back. Run it after the three seeds above.
- **Lines through Mumbai and Delhi** (`scripts/seed-india.sh`): Nexus-23 to Nexus-27 (Indian Ocean Crossing, Spice Route, Frontier Mail, Himalayan Express, Grand Trunk Road), five lines through Mumbai Terminus and New Delhi Central using only existing stations, with a first train on each. Run it after the seeds above, then the top-up below.
- **Top up the timetable** (`scripts/fill-trains.mjs`, Node 18+): makes sure every line has trains running both ways, two per direction (three on lines over 15,000 km), placed where the gaps between existing trains are largest, at the line's usual speed. Safe to repeat; `DRY_RUN=1` prints the plan without changing anything.

  ```sh
  DRY_RUN=1 ADMIN_TOKEN=… node scripts/fill-trains.mjs   # see what it would add
  ADMIN_TOKEN=… node scripts/fill-trains.mjs             # add them
  ```
- **Bots** (`scripts/seed-bots.sh`): marks the Nexus travellers as bots and adds five new bot players in Berlin. Bots are players the World runs itself: they build businesses the way people do (see [docs/Industry.md](docs/Industry.md#bots)). Safe to repeat.

  ```sh
  ADMIN_TOKEN=… ./scripts/seed-bots.sh
  ```

`POST /api/admin/tick` (admin only) advances the world one tick immediately, which helps when testing by hand.

`GET /api/admin/sql-stats` (admin only) shows which SQL statements read the most rows. The free plan allows 5M rows read a day, so check it if that number climbs. The rail network is kept in the World's memory, and the web app polls only while its live connection is down.

### Deploy

Deploys happen automatically through [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/): every push to `master` builds, tests and deploys the Worker.

One-time setup in the Cloudflare dashboard (**Workers & Pages → Create → Import a repository**, or on an existing Worker, **Settings → Build → Connect**):

| Setting | Value |
| --- | --- |
| Repository | `mohitk05/aboard` |
| Worker name | `aboard` (must match `name` in `wrangler.jsonc`) |
| Production branch | `master` |
| Build command | `npm run build` (typecheck + tests; a failure stops the deploy) |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

Then, under **Settings → Variables and Secrets**, add two secrets: `JWT_KEY` (a long random string) and `ADMIN_SECRET`. The build doesn't set them, and they persist across deploys. Without `JWT_KEY`, signup and login return 500.

For push notifications, also add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` address push services can contact). Generate the key pair with `npm run vapid`. Without them the app works, and the notifications switch says they aren't set up. Keep the same keys once people subscribe: changing them invalidates every subscription.

The Durable Object and its migrations are created by `wrangler deploy` from `wrangler.jsonc`, so no other setup is needed. Pushes to other branches upload a preview version without changing production, if non-production branch builds are turned on (they are by default).

To deploy by hand instead: `npx wrangler secret put JWT_KEY`, `npx wrangler secret put ADMIN_SECRET`, `npm run deploy`.

## API

All paths below are under `/api` (for example `POST /api/user/login`). Every response is `{ success, data }` or `{ success: false, error }`. All routes except `/`, signup, login, logout, `GET /stop`, `GET /interest` and bootstrap need the session cookie or `Authorization: Bearer <token>`.

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| GET | `/` | anyone | |
| POST | `/user/signup` | anyone with an invite | `{ user: { username, email, password, age, invite, interests?, image?, profileMode? } }`: Aboard is invite-only (403 without an invite). Every player starts at home in Berlin, with 5,000 credits |
| GET | `/invite/:code` | anyone | whether an invite code can be used (`{ valid, note }`, or why not) |
| POST | `/user/login` | anyone | `{ user: { email, password } }` (sets the session cookie) |
| POST | `/user/logout` | anyone | clears the session cookie |
| GET | `/user/me` | player | includes `journey` (ticket, train, stop-by-stop arrival times) when you have a ticket |
| GET | `/user/:id` | player | (email etc. only for yourself or admin) |
| GET | `/user/fellow-users` | player | |
| PATCH | `/user/me` | player | `{ user: { interests?, image?, profileMode?, currentStop? } }` (`currentStop` only if you have none yet, or you're an admin) |
| POST | `/user/me/locate` | player | `{ near? }`: put me at the nearest station (same rule as `currentStop`) |
| POST | `/user/password` | player | `{ current, next }` |
| POST | `/user` | admin | same as signup |
| GET | `/stop` | anyone | all stops |
| GET | `/stop/nearest?lat=&lng=` | anyone | the station nearest to those coordinates, or to your network location |
| GET | `/stop/:id` | player | |
| GET | `/stop/:id/board` | anyone | the station's arrivals and departures |
| GET | `/stop/:id/photo` | anyone | a photo of the place from Wikipedia, with credit and licence (cached a week) |
| GET | `/stop/:id/departures` | player | trains still calling here, with destinations, fares and arrival times |
| GET | `/stop/:id/incoming-vehicles?limit=5` | player | |
| POST | `/stop` | admin | `{ stop: { name, country, coordinates: { lat, lng }, dwellMinutes? } }` |
| GET | `/route` | anyone | all lines with their stations, and each line's return twin (`returnOf`; id + `~r`), which trains switch to at the end of the line |
| GET | `/route/:id` | player | |
| POST | `/route` | admin | `{ route: { name, stops: [stopId, …] } }` |
| PUT | `/route/:id` | admin | `{ route: { stops: [stopId, …], name? } }`: change a line's stations (its return run follows). Its trains stay on it, at the same share of the way along; refused (409) while anyone holds a ticket on them |
| POST | `/route/autogenerate` | admin | `{ config: { count?, minLength?, maxLength? } }` |
| GET | `/vehicle` | admin | |
| GET | `/vehicle/:id` | player | |
| POST | `/vehicle` | admin | `{ vehicle: { name } }` |
| GET | `/trip?active=1` | anyone | running trains, with `asOf` and `segment` for smooth movement |
| GET | `/trip/:id` | player | |
| POST | `/trip` | admin | `{ trip: { route, vehicle?, speedKmh?, active? } }` |
| POST | `/trip/:id/start` | admin | |
| POST | `/trip/:id/position` | admin | `{ stopIndex, km? }`: place a running train at a station, or `km` past it; passengers move with it |
| POST | `/ticket/buy` | player | `{ ticket: { trip, from, to } }`: costs 0.01 credits per km |
| DELETE | `/ticket` | player | cancel your ticket before boarding (refunded) |
| GET | `/ticket/:id` | admin | |
| GET | `/interest` | anyone | the interests on offer (active ones) |
| POST | `/interest` | admin | `{ interest: { name, description?, image? } }` |
| PATCH | `/interest/:id` | admin | `{ interest: { active } }`: stop offering an interest (left out of `GET /interest`; travellers who picked it keep it), or offer it again |
| GET | `/conversation` | player | your conversations, newest activity first, with the last message |
| POST | `/conversation` | player | `{ conversation: { members: [userId, …] } }` (one-to-one chats are reused) |
| GET | `/conversation/:id/messages` | member | |
| POST | `/conversation/:id/messages` | member | `{ message: { title?, body } }` |
| GET | `/push/key` | anyone | the VAPID public key, or 404 if push isn't set up |
| GET | `/push/subscription` | player | how many devices you've turned notifications on for |
| POST | `/push/subscription` | player | `{ subscription }` from `PushManager.subscribe().toJSON()` |
| DELETE | `/push/subscription` | player | `{ subscription: { endpoint } }` |
| GET | `/game/catalog` | anyone | goods, industries, home station and every market's prices: each offer has `price` (the next unit), `base` (today's price before recent trading) and `load` (units recently traded there) |
| GET | `/game` | player | your credits, cargo, warehouse, factories and ledger (finished batches are delivered first) |
| GET | `/game/leaderboard` | player | every player's net worth and what they earned trading this week (private profiles unnamed), and last week's top earner |
| POST | `/game/buy` | player | `{ good, qty }` at a station that sells it, into your cargo (60 units max) |
| POST | `/game/sell` | player | `{ good, qty }` at a station that buys it, from your cargo (in Berlin, also from your warehouse) |
| POST | `/game/unload` | player | in Berlin: move your cargo into the warehouse |
| POST | `/game/load` | player | in Berlin: `{ good, qty }` from the warehouse into your cargo |
| POST | `/game/build` | player | in Berlin: `{ industry }`, paid in credits and warehouse materials |
| POST | `/game/produce` | player | `{ industry }`: start a batch (inputs from the warehouse, output after some hours) |
| POST | `/user/:id/place` | admin | `{ stop }`: move a player to a station |
| POST | `/user/:id/grant` | admin | `{ credits }`: give (or take) credits |
| GET | `/admin/bots` | admin | every bot: where it is, its credits, and what it's up to |
| POST | `/admin/bots` | admin | `{ usernames, bot? }`: make players bots (or, with `bot: false`, people again) |
| GET | `/live` | anyone | WebSocket: `tick`, `world`, `market` (someone traded) and (for you) `message` events |
| POST | `/admin/bootstrap` | `X-Admin-Secret` | same as signup, `currentStop` optional |
| POST | `/admin/tick` | admin | |
| GET | `/admin/sql-stats?limit=25` | admin | rows read per SQL statement since the world last woke (Cloudflare bills Durable Object SQLite by rows read) |
| GET | `/admin/invites` | admin | every invite, with its status and who used it |
| POST | `/admin/invites` | admin | `{ invite: { note?, days? } }`: a one-time signup code; share it as `/signup?invite=CODE` |
| DELETE | `/admin/invites/:code` | admin | withdraw an unused invite |
| POST | `/admin/seed` | admin | builds the Lisbon → Vladivostok line and starts a train (safe to repeat) |
