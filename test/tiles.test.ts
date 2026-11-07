import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE } from "./helpers";

// The tile proxy only serves the two imagery layers, at valid tile coordinates, zoom 0–8.
describe("satellite tile proxy", () => {
  it.each([
    "/tiles/day/9/0/0.jpg", // too deep
    "/tiles/day/2/4/0.jpg", // x out of range at z=2
    "/tiles/sneaky/2/1/1.jpg", // not a layer we serve
    "/tiles/day/2/1/1.gif",
    "/tiles/../../etc/passwd",
  ])("refuses %s", async (path) => {
    expect((await SELF.fetch(`${BASE}${path}`)).status).toBe(404);
  });

  it("leaves the API alone", async () => {
    expect(((await (await SELF.fetch(`${BASE}/api`)).json()) as any).data).toBe("hello");
  });
});
