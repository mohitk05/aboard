import { describe, expect, it } from "vitest";
import { arc, greatCircle, kmAlong, trainPosition, type TripMotion } from "./motion";

const lisbon = { lat: 38.72, lng: -9.14 };
const madrid = { lat: 40.42, lng: -3.7 };

const moving = (over: Partial<TripMotion> = {}): TripMotion => ({
  state: "MOVING",
  speedKmh: 60,
  progress: 100,
  asOf: 1_000_000,
  position: lisbon,
  segment: { from: lisbon, to: madrid, km: 600 },
  ...over,
});

describe("greatCircle", () => {
  it("returns the endpoints at 0 and 1", () => {
    expect(greatCircle(lisbon, madrid, 0).lat).toBeCloseTo(lisbon.lat, 6);
    expect(greatCircle(lisbon, madrid, 1).lng).toBeCloseTo(madrid.lng, 6);
  });
  it("stays between the endpoints halfway", () => {
    const mid = greatCircle(lisbon, madrid, 0.5);
    expect(mid.lng).toBeGreaterThan(lisbon.lng);
    expect(mid.lng).toBeLessThan(madrid.lng);
  });
});

describe("arc", () => {
  it("keeps longitudes continuous across the antimeridian", () => {
    const pts = arc({ lat: 60, lng: 170 }, { lat: 60, lng: -170 }, 8);
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i]![0] - pts[i - 1]![0])).toBeLessThan(10);
    expect(pts.at(-1)![0]).toBeCloseTo(190, 4);
  });
});

describe("train motion", () => {
  it("extrapolates distance from the last tick at the train's speed", () => {
    expect(kmAlong(moving(), 1_000_000)).toBe(100);
    expect(kmAlong(moving(), 1_000_000 + 30 * 60_000)).toBeCloseTo(130, 6); // 30 min at 60 km/h
  });
  it("never runs past the next stop", () => {
    expect(kmAlong(moving(), 1_000_000 + 24 * 3_600_000)).toBe(600);
  });
  it("ignores clock skew where now is before asOf", () => {
    expect(kmAlong(moving(), 0)).toBe(100);
  });
  it("leaves a stationary train where it is", () => {
    const t = moving({ state: "STATIONARY", position: madrid });
    expect(trainPosition(t, 9_999_999_999)).toEqual(madrid);
  });
});
