# Tech Decisions to Remember

## Platform: Cloudflare Workers + one Durable Object

The app was originally Express + MongoDB with a node-cron world clock. It now runs as a Worker in front of a single SQLite-backed `World` Durable Object.

- **Why one object:** the world is small, and nearly every action reads and writes shared state (a train, its passengers, a city's market). A single Durable Object handles one request at a time, so those changes are atomic without locks or transactions spread across services.
- **World clock:** a Durable Object alarm, which replaces cron. The tick is `World.tick(now)`, and it takes the time as a parameter so tests can simulate days in milliseconds.
- **Errors across RPC:** World methods return a `Result` (`src/lib/result.ts`) instead of throwing, because custom error classes don't survive Durable Object RPC. The Worker turns a `Result` into an HTTP response.
- **Passwords** are hashed in the Worker, because WebCrypto is async. The World only stores and returns hashes, which keeps its methods synchronous and therefore atomic.
- **Schema changes:** add a new entry to the end of `MIGRATIONS` in `src/world/schema.ts`. Never edit one that has shipped.

## Response shapes

The World returns ready-to-send objects: camelCase, with related records nested where the client needs them (for example, a trip includes its route and stops). This replaces the old `populate` flag.
