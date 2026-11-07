import { ensureWorld, signUp, test, tick } from "./fixtures";

// Screenshots of the main screens for a visual check. Skipped unless SHOTS is set:
//   SHOTS=/some/dir npm run e2e -- screens
const dir = process.env.SHOTS;
test.skip(!dir, "set SHOTS=<dir> to capture screenshots");

test("capture screens", async ({ page, request }) => {
  const { adminToken } = await ensureWorld(request);
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
});
