import { ADMIN, ensureWorld, signUp, test, tick, logOut } from "./fixtures";

// Screenshots of the main screens for a visual check. Skipped unless SHOTS is set:
//   SHOTS=/some/dir npm run e2e -- screens
const dir = process.env.SHOTS;
test.skip(!dir, "set SHOTS=<dir> to capture screenshots");
test.setTimeout(180_000);

test("capture desktop", async ({ browser, request }) => {
  await ensureWorld(request);
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${dir}/desktop-${scheme}.png` });
    if (scheme === "light") {
      // A line selected (it lights up as on hover) with its details open.
      await page.goto("/login");
      await page.getByLabel("Email").fill(ADMIN.email);
      await page.getByLabel("Password").fill(ADMIN.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.getByRole("link", { name: "Admin" }).click();
      await page.getByRole("button", { name: "Lisbon – Vladivostok" }).click();
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${dir}/desktop-line.png` });
    }
    await ctx.close();
  }
});

test("capture screens", async ({ page, request }) => {
  const { adminToken, seed } = await ensureWorld(request);
  await tick(request, adminToken, 8); // leave Lisbon so a train is moving

  await page.goto("/");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/landing.png` });

  await signUp(page, "Moscow, Russia", ["Trains", "Books"]);
  await page.getByRole("button", { name: /Vladivostok/ }).first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/station.png` });

  await page.getByRole("button", { name: /Buy a ticket to Irkutsk/ }).click();
  await page.getByText("Moscow → Irkutsk").waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/waiting.png`, fullPage: true });

  // Ride a while: past Moscow is far, so board a fresh train at Lisbon instead.
  await request.post("/api/trip", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { trip: { route: seed.route, active: true } },
  });
  await logOut(page);
  await signUp(page, "Lisbon, Portugal");
  const board = page.getByRole("region", { name: "Departures" });
  await board.getByRole("button", { name: /Boarding/ }).first().click();
  await board.getByRole("button", { name: /Buy a ticket to Berlin/ }).click();
  await tick(request, adminToken, 60);
  await page.reload();
  await page.getByText(/On board/).waitFor();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/journey.png` });

  // Zoom right in on the train (wheel over the globe area at the top of the screen).
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height * 0.2);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(7500); // let the camera drift back onto the train
  await page.screenshot({ path: `${dir}/train-close.png` });

  await page.getByRole("link", { name: "People" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/people.png` });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/profile.png` });
});
