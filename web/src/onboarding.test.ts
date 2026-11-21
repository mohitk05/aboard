import { describe, expect, it } from "vitest";
import type { Stop } from "./api";
import { distanceKm, formatHoursLeft, nearestTowns, supplyRadiusKm } from "./onboarding";

const stop = (id: string, lat: number, lng: number): Stop => ({ id, name: id, country: "X", coordinates: { lat, lng }, dwellMinutes: 0 });
const world = [stop("berlin", 52.52, 13.4), stop("warsaw", 52.23, 21.01), stop("paris", 48.86, 2.35), stop("moscow", 55.76, 37.62)];

describe("nearestTowns", () => {
  it("lists the stations nearest to home, nearest first, with the tutorial's figures", () => {
    const towns = nearestTowns(world, "berlin", 2);
    expect(towns.map((t) => t.stop.id)).toEqual(["warsaw", "paris"]);
    expect(towns[0]).toMatchObject({ people: 4000, hoursLeft: 38 });
    expect(towns[1]).toMatchObject({ people: 2200, hoursLeft: 72 });
  });
  it("never lists home, and is empty when home is unknown", () => {
    expect(nearestTowns(world, "berlin", 9).some((t) => t.stop.id === "berlin")).toBe(false);
    expect(nearestTowns(world, "nowhere")).toEqual([]);
  });
  it("copes with a world of one station", () => {
    expect(nearestTowns([world[0]!], "berlin")).toEqual([]);
  });
});

describe("distanceKm", () => {
  it("is about 520 km from Berlin to Warsaw", () => {
    expect(distanceKm(world[0]!.coordinates, world[1]!.coordinates)).toBeGreaterThan(500);
    expect(distanceKm(world[0]!.coordinates, world[1]!.coordinates)).toBeLessThan(540);
  });
});

describe("formatHoursLeft / supplyRadiusKm", () => {
  it("switches to days for long waits", () => {
    expect(formatHoursLeft(38)).toBe("38 h");
    expect(formatHoursLeft(120)).toBe("5 days");
  });
  it("rounds the radius up to the next 100 km", () => {
    expect(supplyRadiusKm(nearestTowns(world, "berlin", 2))).toBe(900);
  });
});
