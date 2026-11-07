import { checkTag, ensureWorld, expect, signUp, test } from "./fixtures";

test.beforeAll(async ({ request }) => {
  await ensureWorld(request);
});

test("F4: meet someone at the station and talk", async ({ browser }) => {
  test.setTimeout(120_000);
  const opts = test.info().project.use;
  const aCtx = await browser.newContext(opts);
  const bCtx = await browser.newContext(opts);
  for (const ctx of [aCtx, bCtx]) await ctx.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const a = await aCtx.newPage();
  const b = await bCtx.newPage();

  const alice = await signUp(a, "Warsaw, Poland", ["Chess", "Tea"]);
  const bob = await signUp(b, "Warsaw, Poland", ["Tea", "History"]);

  // Alice finds Bob through a shared interest.
  await a.getByRole("link", { name: "People" }).click();
  await expect(a.getByRole("heading", { name: "At your station" })).toBeVisible();
  const card = a.locator(".people li", { hasText: bob.username });
  await expect(card).toBeVisible();
  await expect(card.getByText("50% in common")).toBeVisible();
  await card.getByRole("button", { name: "Say hello" }).click();

  await expect(a).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await a.getByLabel("Message").fill("Hello from the Warsaw platform!");
  await a.getByRole("button", { name: "Send" }).click();
  await expect(a.locator(".messages .mine", { hasText: "Hello from the Warsaw platform!" })).toBeVisible();

  // Bob sees it in his inbox and replies.
  await b.getByRole("link", { name: "Messages" }).click();
  const row = b.getByRole("link", { name: new RegExp(alice.username) });
  await expect(row).toContainText("Hello from the Warsaw platform!");
  await row.click();
  await expect(b.locator(".messages .theirs", { hasText: "Hello from the Warsaw platform!" })).toBeVisible();
  await b.getByLabel("Message").fill("Tea before the train?");
  await b.getByLabel("Message").press("Enter");
  await expect(b.locator(".messages .mine", { hasText: "Tea before the train?" })).toBeVisible();

  // Alice gets the reply (the thread refreshes every few seconds).
  await expect(a.locator(".messages .theirs", { hasText: "Tea before the train?" })).toBeVisible({ timeout: 15_000 });

  // Saying hello again reopens the same conversation.
  await a.getByRole("link", { name: "People" }).click();
  await a.locator(".people li", { hasText: bob.username }).getByRole("button", { name: "Say hello" }).click();
  await expect(a.locator(".messages li")).toHaveCount(2);

  await aCtx.close();
  await bCtx.close();
});

test("F4: edit your profile and change your password", async ({ page }) => {
  const me = await signUp(page, "Warsaw, Poland", ["Chess"]);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("checkbox", { name: "Chess" })).toBeChecked();
  await checkTag(page, "Music");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Music" })).toBeChecked();

  await page.getByLabel("Current password").fill("wrong-one");
  await page.getByLabel("New password").fill("a-new-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert")).toHaveText(/current password is wrong/);
  await page.getByLabel("Current password").fill("password123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: /slow journey/i })).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email").fill(me.email);
  await page.getByLabel("Password").fill("a-new-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});
