import { ensureWorld, expect, placeAt, signUp, test } from "./fixtures";

test("buy materials abroad, bring them home to Berlin, and see what they're for", async ({ page, request }) => {
  test.setTimeout(90_000);
  const { adminToken } = await ensureWorld(request);
  // A market station: Amsterdam sells milk powder (for the chocolate factory).
  const made = await request.post("/api/stop", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { stop: { name: "Amsterdam Centraal", country: "Netherlands", coordinates: { lat: 52.38, lng: 4.9 } } },
  });
  expect([201, 409, 400]).toContain(made.status());

  await signUp(page);
  await placeAt(page, "Amsterdam Centraal, Netherlands");
  const market = page.getByRole("region", { name: "Market" });
  await expect(market.getByText("Milk powder")).toBeVisible();
  await market.getByLabel("How many Milk powder").fill("6");
  await market.getByRole("button", { name: /^Buy · \d+ cr$/ }).click();
  await expect(market.getByText(/carrying 6\/60/)).toBeVisible();

  // Home again: unload into the warehouse, where the chocolate factory counts it.
  await placeAt(page, "Berlin, Germany");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Business" }).click();
  const goods = page.getByRole("region", { name: "Goods" });
  await expect(goods.getByText("6 sacks of milk powder")).toBeVisible();
  await goods.getByRole("button", { name: "Unload into the warehouse" }).click();
  await expect(goods.getByText("With you · 0/60")).toBeVisible();
  const chocolate = page.getByRole("region", { name: "Chocolate factory" });
  await expect(chocolate.getByText("4/4")).toBeVisible(); // 4 sacks of milk needed to build: done
  await expect(chocolate.getByRole("button", { name: "Build the chocolate factory" })).toBeDisabled(); // still need cocoa etc.

  // You're in the standings: down this week (materials cost money), with no factories yet.
  const standings = page.getByRole("region", { name: "Standings" });
  await expect(standings.locator("li.is-you")).toContainText("No factories yet");
  await expect(standings.locator("li.is-you")).toContainText("−");
  await standings.getByRole("button", { name: "Net worth" }).click();
  await expect(standings.getByRole("button", { name: "Net worth" })).toHaveAttribute("aria-pressed", "true");

  // The ledger shows what it cost.
  await expect(page.getByRole("region", { name: "Ledger" })).toContainText("6 × Milk powder at Amsterdam Centraal");
});
