import { reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, buildWorld } from "./helpers";

// Cloudflare bills the World's SQLite by rows read, and the free plan stops at 5M a day. These
// pin the cheap paths: a station's board reads its own lines' trains, not every train in the
// world, and the network kept in memory still sees new stations and lines.

let admin: string;
let stops: { id: string; name: string }[];
let route: { id: string };

/** Rows read by `run`, from the World's own counter (GET /admin/sql-stats). */
async function rowsRead(run: () => Promise<unknown>) {
  const read = async () => (await api("GET", "/admin/sql-stats?limit=1", { token: admin })).data.rowsRead as number;
  const before = await read();
  await run();
  return (await read()) - before;
}

beforeEach(async () => {
  await reset();
  ({ admin, stops, route } = await buildWorld());
});

describe("rows read", () => {
  it("is admin only", async () => {
    expect((await api("GET", "/admin/sql-stats")).status).toBe(401);
    const report = (await api("GET", "/admin/sql-stats", { token: admin })).data;
    expect(report.rowsRead).toBeGreaterThan(0);
    expect(report.top[0]).toMatchObject({ sql: expect.any(String), calls: expect.any(Number) });
  });

  it("a station's board doesn't grow with trains on other lines", async () => {
    // A busy line elsewhere: Lisbon–Paris, with lots of trains. Vladivostok isn't on it.
    const other = (await api("POST", "/route", { token: admin, body: { route: { name: "Atlantic", stops: [stops[0]!.id, stops[1]!.id, stops[2]!.id] } } })).data;
    await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active: true } } });
    const end = stops.at(-1)!.id;
    const board = () => api("GET", `/stop/${end}/board`);
    await board(); // the network into memory
    const quiet = await rowsRead(board);

    for (let i = 0; i < 30; i++) await api("POST", "/trip", { token: admin, body: { trip: { route: other.id, active: true } } });
    expect(await rowsRead(board)).toBe(quiet);
    expect(await rowsRead(() => api("GET", `/stop/${end}/departures`))).toBeLessThan(20);
  });

  it("the catalog reads each station once, not once per station per station", async () => {
    await api("GET", "/game/catalog");
    expect(await rowsRead(() => api("GET", "/game/catalog"))).toBeLessThan(stops.length * 3);
  });

  it("the network in memory sees new stations and lines", async () => {
    const tokyo = (await api("POST", "/stop", { token: admin, body: { stop: { name: "Tokyo", country: "Japan", coordinates: { lat: 35.68, lng: 139.77 } } } })).data;
    const vlad = stops.at(-1)!;
    expect((await api("GET", `/stop/${tokyo.id}/board`)).data.departures).toEqual([]); // read once, before the line exists
    const farEast = (await api("POST", "/route", { token: admin, body: { route: { name: "Far East", stops: [vlad.id, tokyo.id] } } })).data;
    await api("POST", "/trip", { token: admin, body: { trip: { route: farEast.id, active: true } } });
    const board = (await api("GET", `/stop/${vlad.id}/board`)).data;
    expect(board.departures.map((d: { to: string }) => d.to)).toContain("Tokyo");
  });
});
