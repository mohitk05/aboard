import { describe, expect, it } from "vitest";
import type { Journey } from "../api";
import { kmLeft } from "./Journey";

const j = (over: Partial<Journey["trip"]> = {}) =>
  ({
    kmToDestination: 500,
    tripKm: 800,
    trip: { state: "MOVING", speedKmh: 60, progress: 50, asOf: 0, segment: { km: 600 }, position: { lat: 0, lng: 0 }, ...over },
  }) as unknown as Journey;

describe("kmLeft", () => {
  it("counts down at the train's speed between ticks", () => {
    expect(kmLeft(j(), 0)).toBe(500);
    expect(kmLeft(j(), 3_600_000)).toBeCloseTo(440, 6);
  });
  it("doesn't move while the train waits at a station", () => {
    expect(kmLeft(j({ state: "STATIONARY" }), 3_600_000)).toBe(500);
  });
});
