import { ensureWorld, expect, signUp, test, tick } from "./fixtures";

test("F3: board at Lisbon, ride to Madrid, and get welcomed on arrival", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { adminToken, seed } = await ensureWorld(request);
  // A fresh train waiting at Lisbon, so this test doesn't depend on where other trains are.
  const t = await request.post("/api/trip", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { trip: { route: seed.route, active: true } },
  });
  expect(t.status()).toBe(201);

  await signUp(page, "Lisbon, Portugal");
  const board = page.getByRole("region", { name: "Departures" });
  await board.getByRole("button", { name: /Boarding/ }).first().click();
  await board.getByRole("button", { name: /Buy a ticket to Madrid/ }).click();

  // The train is at the platform, so you're aboard straight away.
  await expect(page.getByText(/On board · Lisbon – Vladivostok/)).toBeVisible();
  await expect(page.getByText("At Lisbon")).toBeVisible();
  const trip = page.getByRole("region", { name: "Your trip" });
  await expect(trip.getByRole("progressbar", { name: "Progress to Madrid" })).toBeVisible();
  await expect(trip.locator(".timeline li", { hasText: "Madrid" }).getByText("Your stop")).toBeVisible();
  await expect(trip.locator(".timeline li", { hasText: "Lisbon" }).getByText("Here now")).toBeVisible();
  await expect(page.getByRole("region", { name: "Map following your train" })).toBeVisible();

  // Leave Lisbon (30 min dwell) and get partway along.
  await tick(request, adminToken, 20);
  await page.reload();
  await expect(page.getByText("Next: Madrid")).toBeVisible();
  await expect(trip.locator(".timeline li", { hasText: "Lisbon" }).getByText("Passed")).toBeVisible();
  const pct = Number(await trip.getByRole("progressbar").getAttribute("aria-valuenow"));
  expect(pct).toBeGreaterThan(5);
  expect(pct).toBeLessThan(50);

  // Ride the rest of the way (~630 km at 5 km a tick).
  await tick(request, adminToken, 125);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "You've arrived in Madrid" })).toBeVisible();
  await expect(page.getByText("Madrid, Spain")).toBeVisible();
  await expect(page.getByRole("region", { name: "Departures" })).toBeVisible();

  // The welcome shows once.
  await page.reload();
  await expect(page.getByText("You've arrived in Madrid")).toHaveCount(0);
});
