import { reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { choosePage, plain } from "../src/lib/photo";
import { api, buildWorld } from "./helpers";

let admin: string;
let stops: { id: string; name: string }[];
let route: { id: string };

beforeEach(async () => {
  await reset();
  ({ admin, stops, route } = await buildWorld());
});

describe("station board", () => {
  it("is public, and lists a train waiting at the first station as a departure only", async () => {
    await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active: true } } });
    const first = (await api("GET", `/stop/${stops[0]!.id}/board`)).data;
    expect(first.stop.name).toBe(stops[0]!.name);
    expect(first.arrivals).toEqual([]);
    expect(first.departures).toHaveLength(1);
    expect(first.departures[0]).toMatchObject({ boarding: true, to: stops.at(-1)!.name, next: stops[1]!.name });
    expect(first.departures[0].departureTime).toBeGreaterThan(Date.now() - 1000);
  });

  it("shows the train as arriving down the line, and ending at the terminus", async () => {
    await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active: true } } });
    const mid = (await api("GET", `/stop/${stops[2]!.id}/board`)).data;
    expect(mid.arrivals).toHaveLength(1);
    expect(mid.arrivals[0]).toMatchObject({ arrived: false, terminates: false, from: stops[0]!.name, previous: stops[1]!.name });
    expect(mid.departures[0].departureTime).toBeGreaterThan(mid.arrivals[0].arrivalTime);

    const end = (await api("GET", `/stop/${stops.at(-1)!.id}/board`)).data;
    expect(end.arrivals[0].terminates).toBe(true);
    expect(end.departures).toEqual([]);
  });

  it("404s for an unknown station", async () => {
    expect((await api("GET", "/stop/nope/board")).status).toBe(404);
    expect((await api("GET", "/stop/nope/photo")).status).toBe(404);
  });
});

describe("station photo", () => {
  const at = { lat: 52.525, lng: 13.369 }; // Berlin Hauptbahnhof
  const photo = (title: string, index: number, file: string, lat: number, lon: number) => ({
    title,
    index,
    pageimage: file,
    thumbnail: { source: `https://upload.wikimedia.org/${file}`, width: 1920, height: 1280 },
    coordinates: [{ lat, lon }],
  });

  it("picks the best-ranked nearby photo, skipping maps, logos and faraway namesakes", () => {
    const pages = [
      photo("Hauptbahnhof (Vienna)", 1, "Wien.jpg", 48.18, 16.37), // far away
      photo("Berlin S-Bahn", 2, "S-Bahn_logo.svg", 52.52, 13.4), // a logo
      { title: "No picture", index: 3 },
      photo("Berlin Hauptbahnhof", 4, "Berlin_Hbf.jpg", 52.525, 13.369),
      photo("Spree", 5, "Spree.jpg", 52.52, 13.37),
    ];
    expect(choosePage(pages, at, 60)?.title).toBe("Berlin Hauptbahnhof");
    expect(choosePage(pages.slice(0, 3), at, 60)).toBeNull();
  });

  it("turns Commons credit HTML into plain text", () => {
    expect(plain('<a href="//commons.wikimedia.org/wiki/User:X">Jane &amp; Co</a>')).toBe("Jane & Co");
    expect(plain("")).toBeNull();
  });
});
