# aboard

A slow, real-time train travel world. Trains run real routes at real-world pace (Lisbon to Vladivostok takes about 10 days). Players buy tickets, board, meet fellow travellers and get off somewhere new. See [docs/CarrierGame.md](docs/CarrierGame.md) for where the game is heading.

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
- **Live updates:** clients keep a WebSocket to the World (`/api/live`, hibernation API, so idle connections are free). It sends an event on every tick, when an admin changes the world, and to conversation members when a message arrives; the app refetches just what changed. Polling remains as a fallback.
- **The world clock** is a Durable Object alarm. It is set when a trip starts and runs `World.tick()` every `WORLD_INTERVAL_MINUTES` while any trip is active.
- **Auth:** passwords are hashed with PBKDF2-SHA256 (WebCrypto). Sessions are HS256 JWTs signed with `JWT_KEY`, sent as an `HttpOnly; Secure; SameSite=Lax` cookie for the web app, or as `Authorization: Bearer` for scripts.
- **Scaling:** one object is plenty for now. When it isn't, split by region (one World per network of connected lines) and give each player their own object for inventory and messages.

## Interface

The whole app is a **three.js world** (`web/src/world3d/`), built following the `threejs-scene-setup` and `threejs-materials-lighting` skills in `.claude/skills/`:

- **A realistic Earth:** NASA Blue Marble imagery by day, city lights at night, terrain relief, sunlight glinting on water, atmospheric haze at the limb and a starfield, all lit by the sun where it really is right now (`earth.ts`, textures and credits in `web/public/textures/`).
- **Rail lines** drawn at a constant on-screen width; hover one to highlight it.
- **Trains** made of a locomotive and carriages that follow the curve of the track, with windows that light up at night (`trains.ts`). They move smoothly between world ticks.
- **Click a train or a line** for its details. The same panels open from "Train details" and "Line details" buttons, so they're reachable by keyboard and screen readers too.

Every screen is a set of panels floating over the world, and steers the camera with `useWorldFocus()`: your station, your trip, the train you're on. The world draws at full frame rate only while it's moving or being touched, and at 15 fps otherwise.

Panels are plain HTML (`web/src/ui.tsx`), so text, forms and screen readers work as usual. Colour follows Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/color): role-based tokens (label, background, separator, tint) with light, dark and increased-contrast values; amber only for interactive things; status colours always alongside text. Titles are set in Redaction 35 and text in Manrope (Google Fonts).

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
```

After changing `wrangler.jsonc`, run `npm run cf-typegen` to regenerate `worker-configuration.d.ts`.

The web app lives in `web/` (Vite + React). The Worker serves its build from `web/dist`: requests to `/api` and `/api/*` go to the Worker, and everything else is a static file, falling back to `index.html` so app routes survive a reload.

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

`POST /api/admin/tick` (admin only) advances the world one tick immediately, which helps when testing by hand.

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
| POST | `/user/signup` | anyone | `{ user: { username, email, password, age, currentStop?, near?, interests?, image?, profileMode? } }`: without `currentStop` you start at the station nearest to `near` (browser coordinates) or to your network location |
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
| GET | `/stop/:id/departures` | player | trains still calling here, with destinations, fares and arrival times |
| GET | `/stop/:id/incoming-vehicles?limit=5` | player | |
| POST | `/stop` | admin | `{ stop: { name, country, coordinates: { lat, lng }, dwellMinutes? } }` |
| GET | `/route` | anyone | all lines with their stations |
| GET | `/route/:id` | player | |
| POST | `/route` | admin | `{ route: { name, stops: [stopId, …] } }` |
| POST | `/route/autogenerate` | admin | `{ config: { count?, minLength?, maxLength? } }` |
| GET | `/vehicle` | admin | |
| GET | `/vehicle/:id` | player | |
| POST | `/vehicle` | admin | `{ vehicle: { name } }` |
| GET | `/trip?active=1` | anyone | running trains, with `asOf` and `segment` for smooth movement |
| GET | `/trip/:id` | player | |
| POST | `/trip` | admin | `{ trip: { route, vehicle?, speedKmh?, active? } }` |
| POST | `/trip/:id/start` | admin | |
| POST | `/trip/:id/position` | admin | `{ stopIndex, km? }`: place a running train at a station, or `km` past it; passengers move with it |
| POST | `/ticket/buy` | player | `{ ticket: { trip, from, to } }` |
| DELETE | `/ticket` | player | cancel your ticket before boarding |
| GET | `/ticket/:id` | admin | |
| GET | `/interest` | anyone | |
| POST | `/interest` | admin | `{ interest: { name, description?, image? } }` |
| GET | `/conversation` | player | your conversations, newest activity first, with the last message |
| POST | `/conversation` | player | `{ conversation: { members: [userId, …] } }` (one-to-one chats are reused) |
| GET | `/conversation/:id/messages` | member | |
| POST | `/conversation/:id/messages` | member | `{ message: { title?, body } }` |
| GET | `/push/key` | anyone | the VAPID public key, or 404 if push isn't set up |
| GET | `/push/subscription` | player | how many devices you've turned notifications on for |
| POST | `/push/subscription` | player | `{ subscription }` from `PushManager.subscribe().toJSON()` |
| DELETE | `/push/subscription` | player | `{ subscription: { endpoint } }` |
| GET | `/live` | anyone | WebSocket: `tick`, `world` and (for you) `message` events |
| POST | `/admin/bootstrap` | `X-Admin-Secret` | same as signup, `currentStop` optional |
| POST | `/admin/tick` | admin | |
| POST | `/admin/seed` | admin | builds the Lisbon → Vladivostok line and starts a train (safe to repeat) |
