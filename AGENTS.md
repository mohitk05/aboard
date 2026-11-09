# Working on Aboard

A real-time industry game on a world-wide railway: Cloudflare Worker + one `World` Durable Object (SQLite) in `src/`, a React + three.js web app in `web/`. The README covers architecture, setup, deploys and the API; `docs/Industry.md` covers the game's rules.

## State machines

Anything that moves through states is an explicit state machine in `src/machines/`, shared by the server and the web app. See `docs/StateMachines.md` for every machine, its diagram, and the exact refusal messages.

- Don't compare or assign raw state strings (`state = 'ONBOARD'`, `if (u.state !== "ATSTATION")`). Ask the machine: `traveller.expect(u.state, "board")` returns the next state or throws the refusal (a `GameError` with the right HTTP status and wording). Use `machine.can(...)` to ask without throwing.
- Where a train is relative to a station (approaching, at the platform, departed): `stationStatus` / `positionStatus` / `dueAt` in `src/machines/train.ts`. A trip's `progress` means km while MOVING and minutes while STATIONARY: read it with `kmIntoSegment` / `minutesWaited`.
- Factory and invite states are derived from their rows: `factoryState(row, now)`, `inviteState(row, now)`.
- Changing a rule: edit the machine, run `npm run machines` (regenerates `docs/StateMachines.md`), then `npm test` (it fails if the doc is out of date).

## Checks before pushing

`npm run typecheck`, `npm test` (API, in workerd), `cd web && npx vitest run`, and `npm run e2e` (Playwright against `wrangler dev`; slow, uses software WebGL). Pushing to `master` deploys (Workers Builds runs the typecheck and API tests). Push only when everything passes.
