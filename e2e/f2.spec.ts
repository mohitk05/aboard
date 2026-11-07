import { ensureWorld, expect, signUp, test } from "./fixtures";

test.beforeAll(async ({ request }) => {
  await ensureWorld(request);
});

test("F2: buy a ticket from the departures board, then cancel it", async ({ page }) => {
  await signUp(page, "Paris, France");

  const board = page.getByRole("region", { name: "Departures" });
  const lisbonTrain = board.getByRole("button", { name: /Vladivostok.*Lisbon – Vladivostok/ });
  await expect(lisbonTrain).toBeVisible();
  await expect(lisbonTrain).toHaveAttribute("aria-expanded", "false");
  await lisbonTrain.click();
  await expect(lisbonTrain).toHaveAttribute("aria-expanded", "true");

  // Destinations after Paris, each with a fare.
  await expect(board.getByRole("heading", { name: "Where to?" })).toBeVisible();
  await expect(board.getByText("Lisbon", { exact: true })).toHaveCount(0);
  await board.getByRole("button", { name: /Buy a ticket to Berlin/ }).click();

  // Now waiting on the platform with a ticket.
  await expect(page.getByText("Paris → Berlin")).toBeVisible();
  await expect(page.getByText(/Your train arrives in/)).toBeVisible();
  const ticket = page.getByRole("region", { name: "Ticket details" });
  await expect(ticket.getByText("Lisbon – Vladivostok · The Long Way")).toBeVisible();

  // Survives a reload.
  await page.reload();
  await expect(page.getByText("Paris → Berlin")).toBeVisible();

  // Cancel, with a confirmation step.
  await page.getByRole("button", { name: "Cancel ticket" }).click();
  await page.getByRole("button", { name: "Yes, cancel my ticket" }).click();
  await expect(page.getByRole("region", { name: "Departures" })).toBeVisible();
  await expect(page.getByText("At the station")).toBeVisible();
});

test("F2: the end of the line has no departures", async ({ page }) => {
  await signUp(page, "Vladivostok, Russia");
  await expect(page.getByText(/No trains are due here right now/)).toBeVisible();
});
