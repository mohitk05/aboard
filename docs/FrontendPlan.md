# Frontend plan

Status: F0–F1 done (2026-11-07). This replaces the Expo and three.js plan in `Features.md`.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Platform | Web app first, installable on phones and desktops, with web push notifications | Fastest to ship. At real-world pace, the notification ("your train is at Novosibirsk") is how most visits start, and web push now works on iOS 16.4+ for installed apps. Native apps can come later on the same API. |
| Map | 2D, real geography, custom style (MapLibre GL) | Accurate positions, good on phones. Window moments and the telegraph can sit on top of it later. |
| Scope of first release | The travel loop the backend already supports, plus an admin console | Trading screens wait for the economy backend (steps 2–7 in `CarrierGame.md`). |

## Stack

- **Vite + React + TypeScript**, in `web/` inside this repo.
- **TanStack Query** for server data, caching and refetching. Refetch times are based on the next world tick, not a fixed interval.
- **React Router** for screens.
- **MapLibre GL** via `react-map-gl/maplibre`. Base map tiles come from **OpenFreeMap** to start (free, no API key). Later, self-host a Protomaps file on R2 to get full control of the style.
- **Plain CSS with design tokens** (CSS variables), with light and dark themes. No component library: the look should feel like a departure board and a travel journal, not a dashboard.
- **vite-plugin-pwa** for the install manifest, the service worker and offline caching of the app itself.
- **Testing:** Vitest + React Testing Library for components and hooks. Playwright for end-to-end runs against `wrangler dev`.

## Hosting: one Worker serves the app and the API

The app is built to `web/dist` and served as static assets by the same Worker:

```jsonc
// wrangler.jsonc
"assets": {
  "directory": "./web/dist",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

- One origin means no CORS, and auth can use a secure cookie instead of a token in JavaScript.
- One push to `master` deploys both. The Workers Builds command becomes `npm run build` at the root, which builds `web/` and then typechecks and tests everything.
- **API routes move under `/api`** (`/api/stop/:id`, …) so they don't collide with app routes like `/stop/:id`. This is the first backend change.

## What the backend needs first

The frontend can't be built on the current API alone. These changes come before or alongside the screens that need them:

| Need | Change | Needed for |
| --- | --- | --- |
| Route prefix | Mount the API under `/api` | F0 |
| Safer sessions | Set the JWT in an `HttpOnly; Secure; SameSite=Lax` cookie on login and signup, and add `POST /api/user/logout`. Keep Bearer tokens working for scripts. | F0 |
| The world on a map | `GET /api/stop` (all stops), `GET /api/route` (all routes with stops), `GET /api/trip?active=1` (all running trains) | F1 |
| Smooth train movement | Add `asOf` (time of the last tick) to trip responses, so the client can move trains between ticks (see below) | F1, F3 |
| The ticket window | `GET /api/stop/:id/departures`: trips that will still call here, each with the stops after this one, price and ETA | F2 |
| Your journey | `GET /api/user/me` includes the current ticket and trip (route, ETA to your destination) | F2, F3 |
| Inbox | `GET /api/conversation`: my conversations, with members and the last message | F4 |
| Profile | `PATCH /api/user/me` for interests, image and privacy, and `POST /api/user/password` | F4 |
| Notifications | Store push subscriptions, and send web push (VAPID) from the tick for: train arriving at your stop, boarded, arrived, new message | F5 |
| Realtime | WebSocket on the World Durable Object (hibernation API): pushes tick results and messages to connected clients | F6 |

### Moving trains between ticks

The server moves trains every 5 minutes. At 60 km/h that's a 5 km jump, which looks broken on a zoomed-in map. The client fills in the gaps instead, estimating each train's position from what it knows:

```
km along segment = progress + speedKmh × (now − asOf) / 3,600,000ms, capped at the segment length
```

It then places the train that far along the great-circle arc between the two stops. The next fetch corrects any drift. A stationary train stays still. Animate it with `requestAnimationFrame`, but only when the train is on screen.

## Screens

The screen you land on depends on your state (`ATSTATION`, `READYTOGO`, `ONBOARD`), matching `Features.md`.

**Signed out**
- **Landing:** what Aboard is, plus a live map of trains that are running right now.
- **Sign up:** choose a starting stop (we suggest the nearest one using the browser's location, if you allow it), choose interests, username, age, and public or private profile.
- **Log in.**

**At a station** (`ATSTATION`)
- **Station:** stop name and local time, a departures board (incoming trains with live countdowns), and fellow travellers here.
- **Ticket window:** where you can go from here, shown on the map and as a list of destinations, then the trains that go there, with price and arrival time. Then buy.

**Waiting** (`READYTOGO`)
- **Your ticket:** destination, train, a countdown to the train's arrival, and a cancel button. Fellow travellers stay visible, with a prompt to invite someone onto your train.

**On board** (`ONBOARD`)
- **Journey:** the map follows your train. A timeline of stops with an ETA for each, and how far is left to your destination.
- **Carriage:** the other passengers, sorted by shared interests, with a way to start a chat.

**Everywhere**
- **Messages:** inbox and conversation. The original notes call anonymity crucial, so show usernames and interests only, never emails or ages.
- **Profile:** interests, image, privacy, password, log out.
- **Admin console** (admins only):
  - stops: click the map to place one, set its dwell time
  - routes: pick stops on the map in order and see the length, or autogenerate
  - vehicles and trips: create, start
  - a "tick now" button and a world overview

### Look and feel

- **Departure-board type** for times and stop names. Quiet, warm colours, and very little else on screen.
- **Light follows the train:** the map tints toward night or day depending on the local time where your train actually is.
- **Few notifications, all about the journey:** the train is near, you're aboard, you've arrived, someone wrote to you. No streaks or nagging.

## Milestones

Each milestone ends with something you can deploy and use. Backend changes ship in the same milestone as the screens that need them.

**F0 Foundation (done)**
- `web/` app scaffold, design tokens, light and dark themes.
- Served from the Worker. API under `/api`. Cookie sessions.
- Root `npm run build` builds the web app and runs all tests.
- Login, signup and logout screens.
- *Done when:* you can sign up on the deployed site and see an empty, signed-in home screen.

**F1 World map + admin console (done)**
- List endpoints and `asOf`.
- A map of stops, routes and moving trains, with trains moving smoothly between ticks.
- Admin console for stops, routes and trips. A seed button for the Lisbon → Vladivostok line.
- *Done when:* an admin builds the line in the browser, starts a train, and everyone sees it move across Europe.

**F2 Stations and tickets**
- Departures endpoint and ticket info on `/user/me`.
- Station screen, ticket window, your-ticket screen, cancel.
- *Done when:* a player buys a ticket in Paris and watches the countdown to the train.

**F3 On board**
- Journey screen, stop timeline with ETAs, arrival handling (you're put back at a station).
- *Done when:* a player rides Paris → Berlin from start to finish without touching the API.

**F4 People**
- Fellow travellers at the station and in the carriage. Inbox and chat (polling at first). Profile editing.
- *Done when:* two players at the same stop find each other by interests and talk.

**F5 Install and notifications**
- PWA manifest and service worker.
- Push subscriptions and sending (VAPID keys as Worker secrets).
- Notifications: train approaching your stop (one tick ahead), boarded, arrived, new message.
- *Done when:* a player installs the app on a phone, closes it, and is woken by "Your train reaches Berlin in 10 minutes".

**F6 Realtime**
- WebSockets on the World Durable Object for ticks and messages. Polling remains as a fallback.

**Then:** carrier-game screens follow the backend build order in `CarrierGame.md`:
- market at the station, cargo hold
- arrival orders
- telegraph inbox
- window moments on the journey map and a journal
- compartment upgrades
- shared projects

## Testing

- **Unit:** the train-position estimate, ETA formatting, the state → screen mapping.
- **Component:** departures board, ticket window, journey timeline, run against recorded API responses.
- **End-to-end (Playwright, against `wrangler dev`):** for each milestone, script its "done when" sentence. Use `POST /api/admin/tick` to move time forward instead of waiting.
- **Check on a real phone** before calling F5 done. Web push on iOS only works once the app is installed to the home screen.

## Open questions

- **Account recovery:** password reset needs email, which means choosing an email provider. Until then, an admin resets passwords by hand.
- **Map tiles:** OpenFreeMap's terms and uptime are fine for a hobby project. Move to self-hosted Protomaps if traffic grows or the style needs more control.
- **Ages:** the backend separates under-18s for matching. Is asking for an age at signup enough, or does that need more care?
- **Real names:** usernames only, or optional display names?
