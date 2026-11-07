import { ADMIN, ensureWorld, expect, signUp, test } from "./fixtures";

test.beforeAll(async ({ request }) => {
  await ensureWorld(request);
});

test("F0: sign up, stay signed in, log out, log back in", async ({ page, context }) => {
  const { username, email } = await signUp(page, "Paris, France", ["Trains", "Tea"]);
  await expect(page.getByText("Paris, France")).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === "aboard_session");
  expect(cookie?.httpOnly).toBe(true);

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: /slow journey/i })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Wrong email or password/);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(username).first()).toBeVisible();
});

test("F1: the landing page shows the live network on a map", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/1 train running now/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Trains running right now" }).locator("canvas")).toBeVisible();
});

test("F1: admins build the world from the control room", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Admin" }).click();

  await expect(page.getByText(/11 stations · 1 lines · 1 trains running/)).toBeVisible();

  // Seeding again changes nothing.
  await page.getByRole("button", { name: /Seed Lisbon/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "11 stations" })).toBeVisible();
  await expect(page.getByText(/11 stations · 1 lines · 1 trains running/)).toBeVisible();

  // Add a station and a line through it.
  await page.getByLabel("Name", { exact: true }).first().fill("Porto");
  await page.getByLabel("Country").fill("Portugal");
  await page.getByLabel("Latitude").fill("41.15");
  await page.getByLabel("Longitude").fill("-8.61");
  await page.getByRole("button", { name: "Add station" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Porto" })).toBeVisible();
  await expect(page.getByText(/12 stations/)).toBeVisible();

  const line = page.locator("form", { has: page.getByRole("heading", { name: "New line" }) });
  await line.getByLabel("Name").fill("Atlantic coast");
  const picker = line.getByRole("combobox");
  await picker.selectOption({ label: "Porto, Portugal" });
  await line.getByRole("button", { name: "Add", exact: true }).click();
  await picker.selectOption({ label: "Lisbon, Portugal" });
  await line.getByRole("button", { name: "Add", exact: true }).click();
  await line.getByRole("button", { name: "Create line" }).click();
  await expect(page.locator("li strong", { hasText: "Atlantic coast" })).toBeVisible();

  // Run a train on it.
  const run = page.locator("form", { has: page.getByRole("heading", { name: "Run a train" }) });
  await run.getByLabel("Line").selectOption({ label: "Atlantic coast" });
  await run.getByRole("button", { name: "Start from the first station" }).click();
  await expect(page.getByText(/2 trains running/)).toBeVisible();

  // Tick button works.
  await page.getByRole("button", { name: /Advance one tick/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tick done" })).toBeVisible();
});

test("F1: players can't open the control room", async ({ page }) => {
  await signUp(page, "Berlin, Germany");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
});
