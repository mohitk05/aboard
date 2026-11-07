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
