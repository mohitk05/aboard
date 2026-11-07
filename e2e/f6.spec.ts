import { ensureWorld, expect, signUp, test } from "./fixtures";

// Polling would pick these changes up in 10–60 s; live updates should within a couple of seconds.
const FAST = { timeout: 3000 };

test("F6: messages arrive live", async ({ browser, request }) => {
  await ensureWorld(request);
  const opts = test.info().project.use;
  const [aCtx, bCtx] = [await browser.newContext(opts), await browser.newContext(opts)];
  for (const ctx of [aCtx, bCtx]) await ctx.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const a = await aCtx.newPage();
  const b = await bCtx.newPage();
  await signUp(a, "Yekaterinburg, Russia", ["Languages"]);
  const bob = await signUp(b, "Yekaterinburg, Russia", ["Languages"]);

  await a.getByRole("link", { name: "People" }).click();
  await a.locator(".people li", { hasText: bob.username }).getByRole("button", { name: "Say hello" }).click();
  await a.getByLabel("Message").fill("First message");
  await a.getByRole("button", { name: "Send" }).click();

  await b.getByRole("link", { name: "Messages" }).click();
  await b.getByRole("link", { name: /First message/ }).click();
  await expect(b.locator(".messages .theirs")).toHaveCount(1);
  // Give both pages' live connections a moment, then send again: it should show up fast.
  await a.waitForTimeout(500);
  await a.getByLabel("Message").fill("Are you on the 14:05?");
  await a.getByRole("button", { name: "Send" }).click();
  await expect(b.locator(".messages .theirs", { hasText: "Are you on the 14:05?" })).toBeVisible(FAST);

  await aCtx.close();
  await bCtx.close();
});

test("F6: new trains appear on the map without reloading", async ({ page, request }) => {
  const { adminToken, seed } = await ensureWorld(request);
  await page.goto("/");
  const label = page.getByText(/trains? running now/i);
  await expect(label).toBeVisible();
  const before = Number((await label.textContent())!.match(/\d+/)![0]);
  await page.waitForTimeout(500);
  await request.post("/api/trip", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { trip: { route: seed.route, active: true } },
  });
  await expect(page.getByText(`${before + 1} trains running now`)).toBeVisible(FAST);
});
