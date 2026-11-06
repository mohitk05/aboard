# aboard

A slow, real-time train travel world. Trains run real routes at real-world pace (Lisbon to Vladivostok takes about 10 days). Players buy tickets, board, meet fellow travellers and get off somewhere new. See [docs/CarrierGame.md](docs/CarrierGame.md) for where the game is heading.

## Architecture

It runs on **Cloudflare Workers** and **Durable Objects**:

```
client ──HTTP──▶ Worker (src/index.ts)           routing, JWT auth, input validation
                   │  RPC
                   ▼
                 World Durable Object             all world state in its SQLite storage
                 (src/world/world.ts)             world clock = Durable Object alarm, every 5 min
```

- **One `World` object** holds stops, routes, trips, users, tickets and messages in SQLite (`src/world/schema.ts`). A Durable Object handles one request at a time, so ticket purchases (and, later, trades) are atomic without locks.
- **The world clock** is a Durable Object alarm. It is set when a trip starts and runs `World.tick()` every `WORLD_INTERVAL_MINUTES` while any trip is active.
- **Auth:** passwords are hashed with PBKDF2-SHA256 (WebCrypto), and sessions are HS256 JWTs signed with `JWT_KEY`.
- **Scaling:** one object is plenty for now. When it isn't, split by region (one World per network of connected lines) and give each player their own object for inventory and messages.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # set JWT_KEY and ADMIN_SECRET
npm run dev                      # http://localhost:8787
npm test                         # tests run inside the Workers runtime (workerd)
npm run typecheck
```

After changing `wrangler.jsonc`, run `npm run cf-typegen` to regenerate `worker-configuration.d.ts`.

### First admin

There are no admins at first. Create one with the bootstrap endpoint. It only works while no admin exists:

```sh
curl -X POST localhost:8787/admin/bootstrap \
  -H 'X-Admin-Secret: <ADMIN_SECRET>' -H 'Content-Type: application/json' \
  -d '{"user":{"username":"admin","email":"admin@example.com","password":"...","age":30}}'
```

Admins don't need a `currentStop`. Then create stops, routes and trips with the admin token.

`POST /admin/tick` (admin only) advances the world one tick immediately, which helps when testing by hand.

### Deploy

```sh
npx wrangler secret put JWT_KEY
npx wrangler secret put ADMIN_SECRET
npm run deploy
```

## API

Every response is `{ success, data }` or `{ success: false, error }`. All routes except `/`, signup, login, `GET /interest` and bootstrap need `Authorization: Bearer <token>`.

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| GET | `/` | anyone | |
| POST | `/user/signup` | anyone | `{ user: { username, email, password, age, currentStop, interests?, image?, profileMode? } }` |
| POST | `/user/login` | anyone | `{ user: { email, password } }` |
| GET | `/user/me` | player | |
| GET | `/user/:id` | player | (email etc. only for yourself or admin) |
| GET | `/user/fellow-users` | player | |
| POST | `/user` | admin | same as signup |
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
