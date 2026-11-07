import { describe, expect, it } from "vitest";
import { subsolarPoint, toLatLng, toVec3 } from "./geo";

describe("globe coordinates", () => {
  it("puts the poles on the y axis and 0°,0° on +z", () => {
    expect(toVec3({ lat: 90, lng: 0 })[1]).toBeCloseTo(1);
    const [x, y, z] = toVec3({ lat: 0, lng: 0 });
    expect([x, y, z].map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it("round-trips lat/lng", () => {
    for (const p of [{ lat: 38.72, lng: -9.14 }, { lat: -33.87, lng: 151.2 }, { lat: 55.75, lng: 179.9 }]) {
      const back = toLatLng(toVec3(p, 1.3));
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lng).toBeCloseTo(p.lng, 6);
    }
  });
});

describe("subsolarPoint", () => {
  it("is over the Greenwich meridian at noon UTC and near the equator at the equinox", () => {
    const p = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)));
    expect(p.lng).toBeCloseTo(0, 5);
    expect(Math.abs(p.lat)).toBeLessThan(1);
  });
  it("is north in June, south in December, and moves west through the day", () => {
    expect(subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12))).lat).toBeGreaterThan(23);
    expect(subsolarPoint(new Date(Date.UTC(2026, 11, 21, 12))).lat).toBeLessThan(-23);
    expect(subsolarPoint(new Date(Date.UTC(2026, 5, 21, 18))).lng).toBeCloseTo(-90, 5);
  });
});
