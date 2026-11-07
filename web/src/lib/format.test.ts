import { describe, expect, it } from "vitest";
import { formatIn, formatKm } from "./format";

describe("formatIn", () => {
  it("rounds to minutes, hours and days", () => {
    expect(formatIn(30_000)).toBe("now");
    expect(formatIn(4 * 60_000)).toBe("in 4 min");
    expect(formatIn((3 * 60 + 20) * 60_000)).toBe("in 3 h 20 min");
    expect(formatIn((2 * 1440 + 5 * 60) * 60_000)).toBe("in 2 d 5 h");
  });
});

describe("formatKm", () => {
  it("drops decimals", () => {
    expect(formatKm(13927.6)).toMatch(/^13.?928 km$/);
  });
});
