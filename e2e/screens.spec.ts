import { ensureWorld, signUp, test, tick } from "./fixtures";

// Screenshots of the main screens for a visual check. Skipped unless SHOTS is set:
//   SHOTS=/some/dir npm run e2e -- screens
const dir = process.env.SHOTS;
test.skip(!dir, "set SHOTS=<dir> to capture screenshots");

test("capture screens", async ({ page, request }) => {
  const { adminToken, seed } = await ensureWorld(request);
  await tick(request, adminToken, 8); // leave Lisbon so a train is moving

  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/landing.png`, fullPage: true });

  await signUp(page, "Moscow, Russia", ["Trains", "Books"]);
  await page.getByRole("button", { name: /Vladivostok/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/station.png`, fullPage: true });

  await page.getByRole("button", { name: /Buy a ticket to Irkutsk/ }).click();
  await page.getByText("Moscow → Irkutsk").waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/waiting.png`, fullPage: true });

  // Ride a while: past Moscow is far, so board a fresh train at Lisbon instead.
  await request.post("/api/trip", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { trip: { route: seed.route, active: true } },
  });
  await page.getByRole("button", { name: "Log out" }).click();
  await signUp(page, "Lisbon, Portugal");
  const board = page.getByRole("region", { name: "Departures" });
  await board.getByRole("button", { name: /Boarding/ }).first().click();
  await board.getByRole("button", { name: /Buy a ticket to Berlin/ }).click();
  await tick(request, adminToken, 60);
  await page.reload();
  await page.getByText(/On board/).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/journey.png`, fullPage: true });
});
