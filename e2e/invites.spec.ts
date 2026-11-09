import { ADMIN, ensureWorld, expect, test, unique } from "./fixtures";

test.beforeAll(async ({ request }) => {
  await ensureWorld(request);
});

test("signup is invite-only", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Aboard is invite-only" })).toBeVisible();
  await page.getByLabel("Invite code").fill("NOTAREALCODE");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That invite code isn't valid.")).toBeVisible();
});

test("an admin makes an invite link, and a friend joins with it", async ({ page, browser }) => {
  test.setTimeout(90_000);
  // The admin logs in and makes an invite in the control room.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" }).click();
  const invites = page.getByRole("region", { name: "Invites" });
  const note = unique("For Ada ");
  await invites.getByLabel("Who's it for?").fill(note);
  await invites.getByRole("button", { name: "Create invite link" }).click();
  const link = (await invites.locator(".invite-link").textContent())!;
  expect(link).toMatch(/\/signup\?invite=[0-9A-Z]{12}$/);
  await expect(invites.locator(".invite-list li", { hasText: note })).toContainText("open");

  // The friend opens the link in their own browser and signs up.
  const friendCtx = await browser.newContext(test.info().project.use);
  const friend = await friendCtx.newPage();
  await friend.goto(link);
  // (A fresh browser renders the 3D world in software first, which is slow in tests.)
  await expect(friend.getByText(`You're invited: ${note}.`)).toBeVisible({ timeout: 20_000 });
  const username = unique("ada");
  await friend.getByLabel("Username", { exact: true }).fill(username);
  await friend.getByLabel("Email", { exact: true }).fill(`${username}@e2e.test`);
  await friend.getByLabel("Password", { exact: true }).fill("password123");
  await friend.getByLabel("Age", { exact: true }).fill("30");
  await friend.getByRole("button", { name: "Start travelling" }).click();
  await expect(friend.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 15_000 });

  // The link is spent: it can't be used again, and the admin sees who used it.
  const code = new URL(link).searchParams.get("invite")!;
  const spent = await page.request.get(`/api/invite/${code}`);
  expect(spent.status()).toBe(409);
  expect((await spent.json()).error).toBe("That invite has already been used.");
  await page.reload();
  await expect(page.getByRole("region", { name: "Invites" }).locator(".invite-list li", { hasText: note })).toContainText(`used by ${username}`, {
    timeout: 20_000,
  });
  await friendCtx.close();
});
