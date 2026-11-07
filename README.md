# aboard

A slow, real-time train travel world. Trains run real routes at real-world pace (Lisbon to Vladivostok takes about 10 days). Players buy tickets, board, meet fellow travellers and get off somewhere new. See [docs/CarrierGame.md](docs/CarrierGame.md) for where the game is heading.

## Architecture

It runs on **Cloudflare Workers** and **Durable Objects**:

```
browser ──▶ web app (web/, static assets)        Vite + React, served by the same Worker
client ──HTTP /api──▶ Worker (src/index.ts)      routing, JWT auth, input validation
                   │  RPC
                   ▼
                 World Durable Object             all world state in its SQLite storage
                 (src/world/world.ts)             world clock = Durable Object alarm, every 5 min
```

- **One `World` object** holds stops, routes, trips, users, tickets and messages in SQLite (`src/world/schema.ts`). A Durable Object handles one request at a time, so ticket purchases (and, later, trades) are atomic without locks.
- **The world clock** is a Durable Object alarm. It is set when a trip starts and runs `World.tick()` every `WORLD_INTERVAL_MINUTES` while any trip is active.
- **Auth:** passwords are hashed with PBKDF2-SHA256 (WebCrypto). Sessions are HS256 JWTs signed with `JWT_KEY`, sent as an `HttpOnly; Secure; SameSite=Lax` cookie for the web app, or as `Authorization: Bearer` for scripts.
- **Scaling:** one object is plenty for now. When it isn't, split by region (one World per network of connected lines) and give each player their own object for inventory and messages.

## Development

```sh
npm install                      # npm 11 recommended (npx npm@11 install)
cp .dev.vars.example .dev.vars   # set JWT_KEY and ADMIN_SECRET
npm run dev                      # builds the web app, then serves app + API on http://localhost:8787
npm run dev:web                  # in a second terminal: hot-reloading app on :5173, proxying /api to :8787
npm test                         # API tests run inside the Workers runtime (workerd)
npm run typecheck                # Worker and web app
npm run build                    # what Workers Builds runs: build the app, typecheck, test
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

The Durable Object and its migrations are created by `wrangler deploy` from `wrangler.jsonc`, so no other setup is needed. Pushes to other branches upload a preview version without changing production, if non-production branch builds are turned on (they are by default).

To deploy by hand instead: `npx wrangler secret put JWT_KEY`, `npx wrangler secret put ADMIN_SECRET`, `npm run deploy`.

## API

All paths below are under `/api` (for example `POST /api/user/login`). Every response is `{ success, data }` or `{ success: false, error }`. All routes except `/`, signup, login, logout, `GET /stop`, `GET /interest` and bootstrap need the session cookie or `Authorization: Bearer <token>`.

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| GET | `/` | anyone | |
| POST | `/user/signup` | anyone | `{ user: { username, email, password, age, currentStop, interests?, image?, profileMode? } }` |
| POST | `/user/login` | anyone | `{ user: { email, password } }` (sets the session cookie) |
| POST | `/user/logout` | anyone | clears the session cookie |
| GET | `/user/me` | player | |
| GET | `/user/:id` | player | (email etc. only for yourself or admin) |
| GET | `/user/fellow-users` | player | |
| POST | `/user` | admin | same as signup |
| GET | `/stop` | anyone | all stops |
| GET | `/stop/:id` | player | |
| GET | `/stop/:id/incoming-vehicles?limit=5` | player | |
| POST | `/stop` | admin | `{ stop: { name, country, coordinates: { lat, lng }, dwellMinutes? } }` |
| GET | `/route/:id` | player | |
| POST | `/route` | admin | `{ route: { name, stops: [stopId, …] } }` |
| POST | `/route/autogenerate` | admin | `{ config: { count?, minLength?, maxLength? } }` |
| GET | `/vehicle/:id` | player | |
| POST | `/vehicle` | admin | `{ vehicle: { name } }` |
| GET | `/trip/:id` | player | |
| POST | `/trip` | admin | `{ trip: { route, vehicle?, speedKmh?, active? } }` |
| POST | `/trip/:id/start` | admin | |
| POST | `/ticket/buy` | player | `{ ticket: { trip, from, to } }` |
| DELETE | `/ticket` | player | cancel your ticket before boarding |
| GET | `/ticket/:id` | admin | |
| GET | `/interest` | anyone | |
| POST | `/interest` | admin | `{ interest: { name, description?, image? } }` |
| POST | `/conversation` | player | `{ conversation: { members: [userId, …] } }` |
| GET | `/conversation/:id/messages` | member | |
| POST | `/conversation/:id/messages` | member | `{ message: { title?, body } }` |
| POST | `/admin/bootstrap` | `X-Admin-Secret` | same as signup, `currentStop` optional |
| POST | `/admin/tick` | admin | |
