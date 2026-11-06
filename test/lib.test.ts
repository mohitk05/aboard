import { describe, expect, it } from "vitest";
import { haversineKm, railKm } from "../src/lib/geo";
import { hashPassword, verifyPassword } from "../src/lib/password";

describe("geo", () => {
  it("measures great-circle distance in km", () => {
    const paris = { lat: 48.86, lng: 2.35 };
    const berlin = { lat: 52.52, lng: 13.4 };
    expect(haversineKm(paris, berlin)).toBeGreaterThan(870);
    expect(haversineKm(paris, berlin)).toBeLessThan(890);
  });

  it("crosses the antimeridian the short way", () => {
    const a = { lat: 65, lng: 179 };
    const b = { lat: 65, lng: -179 };
    expect(haversineKm(a, b)).toBeLessThan(100);
  });

  it("adds a detour factor for track distance", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 1 };
    expect(railKm(a, b)).toBeCloseTo(haversineKm(a, b) * 1.25, 0);
  });
});

describe("password", () => {
  it("hashes with a salt and verifies", async () => {
    const h1 = await hashPassword("hunter22");
    const h2 = await hashPassword("hunter22");
    expect(h1).toMatch(/^pbkdf2\$100000\$/);
    expect(h1).not.toEqual(h2);
    expect(await verifyPassword("hunter22", h1)).toBe(true);
    expect(await verifyPassword("hunter23", h1)).toBe(false);
    expect(await verifyPassword("hunter22", "garbage")).toBe(false);
  });
});
