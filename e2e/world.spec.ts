import { ensureWorld, expect, signUp, test } from "./fixtures";
import type { Locator } from "@playwright/test";

/** Where a label is once the camera has stopped moving (same spot twice, half a second apart). */
async function settled(label: Locator) {
  let last = await label.boundingBox();
  for (let i = 0; i < 40; i++) {
    await label.page().waitForTimeout(500);
    const now = await label.boundingBox();
    if (now && last && Math.abs(now.x - last.x) < 1 && Math.abs(now.y - last.y) < 1) return now;
    last = now;
  }
  throw new Error("The camera never settled");
}

test.beforeAll(async ({ request }) => {
  await ensureWorld(request);
});

test("the world loads the Earth imagery", async ({ page }) => {
  const day = page.waitForResponse((r) => r.url().endsWith("/textures/earth-blue-marble.jpg") && r.ok());
  const night = page.waitForResponse((r) => r.url().endsWith("/textures/earth-night.jpg") && r.ok());
  await page.goto("/");
  await Promise.all([day, night]);
  await expect(page.getByRole("img", { name: "Trains running right now" }).locator("canvas")).toBeVisible();
});

test("train and line details open from the departures board, and close", async ({ page }) => {
  await signUp(page, "Paris, France");
  const board = page.getByRole("region", { name: "Departures" });
  await board.getByRole("button", { name: /The Long Way/ }).first().click();
  await board.getByRole("button", { name: "Train details" }).click();

  const panel = page.getByRole("region", { name: /The Long Way/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Lisbon – Vladivostok", { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading")).toBeFocused();

  await panel.getByRole("button", { name: "See the whole line" }).click();
  const line = page.getByRole("region", { name: "Lisbon – Vladivostok" });
  await expect(line.getByText(/11 stations/)).toBeVisible();
  await expect(line.locator(".timeline li")).toHaveCount(11);

  await page.keyboard.press("Escape");
  await expect(line).toHaveCount(0);

  await board.getByRole("button", { name: "Line details" }).click();
  await expect(page.getByRole("region", { name: "Lisbon – Vladivostok" })).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("region", { name: "Lisbon – Vladivostok" })).toHaveCount(0);
});

test("click a station on the globe for its photo, arrivals and departures", async ({ page }) => {
  // Wikipedia isn't reachable from the test server, so stand in for the photo lookup.
  await page.route("**/api/stop/*/photo", (r) =>
    r.fulfill({
      json: {
        success: true,
        data: {
          url: "/icons/icon-512.png",
          width: 512,
          height: 512,
          title: "Berlin",
          page: "https://en.wikipedia.org/wiki/Berlin",
          source: "https://commons.wikimedia.org/wiki/File:Berlin.jpg",
          credit: "A. Photographer",
          license: "CC BY-SA 4.0",
        },
      },
    }),
  );
  await signUp(page, "Paris, France");

  // Your home base and your own station are named on the globe; the rest are dots.
  const home = page.locator(".world-label.is-home");
  const paris = page.locator(".world-label", { hasText: /^Paris$/ });
  const madrid = page.locator(".world-label", { hasText: /^Madrid$/ });
  await expect(home).toContainText("Home base", { timeout: 20_000 });
  await expect(home).toContainText("Berlin");
  await expect(paris).toBeVisible();
  await expect(madrid).toBeHidden();

  // Selecting a line names its stations; closing it hides them again.
  const board = page.getByRole("region", { name: "Departures" });
  await board.getByRole("button", { name: /The Long Way/ }).first().click();
  await board.getByRole("button", { name: "Line details" }).click();
  await expect(madrid).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(madrid).toBeHidden();
  // Fold the departure away again, so its buttons aren't over the globe.
  await board.getByRole("button", { name: /The Long Way/ }).first().click();
  await expect(board.getByRole("button", { name: "Line details" })).toHaveCount(0);

  // Click Berlin's dot. (A name's box is centred on its station; the text is drawn just above.)
  const box = await settled(home);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const panel = page.getByRole("region", { name: "Berlin" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Berlin" })).toBeFocused();
  await expect(panel.getByRole("img", { name: /Berlin/ })).toBeVisible();
  await expect(panel.getByRole("link", { name: /A. Photographer, CC BY-SA 4.0/ })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Arrivals" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Departures" })).toBeVisible();
  // The Long Way calls at Berlin on its way to Vladivostok.
  await expect(panel.getByRole("button", { name: "From Lisbon" }).first()).toBeVisible();
  await expect(panel.getByRole("button", { name: "To Vladivostok" }).first()).toBeVisible();

  // A train on the board opens the train's details.
  // (Other tests add unnamed trains, so this may be any train on the line.)
  await panel.getByRole("button", { name: "To Vladivostok" }).first().click();
  await expect(page.getByRole("region", { name: /to Vladivostok/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // The same panel opens from the keyboard, for your own station.
  await page.getByRole("button", { name: "Station details" }).click();
  await expect(page.getByRole("region", { name: "Paris" })).toBeVisible();
});

test("hovering a station's dot names it (mouse)", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  await signUp(page, "Paris, France");
  const moscow = page.locator(".world-label", { hasText: /^Moscow$/ });

  // Find Moscow's dot: open the line (which names its stations), note where Moscow is, close it.
  const board = page.getByRole("region", { name: "Departures" });
  await board.getByRole("button", { name: /The Long Way/ }).first().click();
  await board.getByRole("button", { name: "Line details" }).click();
  await expect(moscow).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // let the camera settle
  const home = page.locator(".world-label.is-home"); // always named: a reference point
  const box = (await moscow.boundingBox())!;
  const before = (await home.boundingBox())!;
  await page.getByRole("button", { name: "Close details" }).click();
  await board.getByRole("button", { name: /The Long Way/ }).first().click(); // fold the departure away
  await expect(moscow).toBeHidden();
  await page.waitForTimeout(2500);
  // Closing the panel re-centres the view (a sideways shift of everything); follow it.
  const after = (await home.boundingBox())!;
  const [dx, dy] = [after.x - before.x, after.y - before.y];

  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await expect(moscow).toBeVisible();
  await page.mouse.move(5, 400); // away again
  await expect(moscow).toBeHidden();
  await ctx.close();
});
