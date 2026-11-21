import { describe, expect, it } from "vitest";
import type { Stop } from "./api";
import { distanceKm, formatHoursLeft, supplyRadiusKm, tutorialPlan } from "./onboarding";

const stop = (id: string, lat: number, lng: number): Stop => ({ id, name: id, country: "X", coordinates: { lat, lng }, dwellMinutes: 0 });
const world = [stop("berlin", 52.52, 13.4), stop("warsaw", 52.23, 21.01), stop("paris", 48.86, 2.35), stop("moscow", 55.76, 37.62)];

describe("tutorialPlan", () => {
  it("sends the first train to the nearest station, and the bread to the next nearest", () => {
    const plan = tutorialPlan(world, "berlin", 2)!;
    expect(plan.market.id).toBe("warsaw");
    expect(plan.towns.map((t) => t.stop.id)).toEqual(["paris", "moscow"]);
    expect(plan.towns[0]).toMatchObject({ people: 4000, hoursLeft: 38 });
    expect(plan.towns[1]).toMatchObject({ people: 2200, hoursLeft: 72 });
  });
  it("never lists home, and is null when home is unknown", () => {
    const plan = tutorialPlan(world, "berlin", 9)!;
    expect([plan.market, ...plan.towns.map((t) => t.stop)].some((s) => s.id === "berlin")).toBe(false);
    expect(tutorialPlan(world, "nowhere")).toBeNull();
  });
  it("uses the one other station for both jobs in a world of two", () => {
    const plan = tutorialPlan([world[0]!, world[1]!], "berlin")!;
    expect(plan.market.id).toBe("warsaw");
    expect(plan.towns.map((t) => t.stop.id)).toEqual(["warsaw"]);
  });
  it("is null in a world of one station", () => {
    expect(tutorialPlan([world[0]!], "berlin")).toBeNull();
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
    expect(supplyRadiusKm(tutorialPlan(world, "berlin", 2)!.towns)).toBe(1700);
  });
});
