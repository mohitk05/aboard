import { ensureWorld, expect, signUp, test } from "./fixtures";

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

  // Berlin is up and to the right of Paris, clear of the panels on a phone too.
  // The station's dot sits just under its label (labels are lifted 14px and let clicks through).
  const label = page.locator(".world-label", { hasText: /^Berlin$/ });
  await expect(label).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // let the camera settle
  const box = (await label.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 14);

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
