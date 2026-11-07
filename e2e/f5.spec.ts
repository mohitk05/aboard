import { ensureWorld, expect, signUp, test } from "./fixtures";

test.beforeAll(async ({ request }) => {
  await ensureWorld(request);
});

test("F5: installable app with a manifest and an offline shell", async ({ page, context, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Aboard", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /slow journey/i })).toBeVisible();
  // The service worker installs and takes control.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Offline: the app still opens and says it can't reach the server.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Can't reach Aboard/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: /slow journey/i })).toBeVisible();
});

test("F5: turn notifications on and off", async ({ page, context }) => {
  // Headless Chromium has no push service, so stand in for the browser's PushManager.
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    // Headless Chromium reports notifications as denied whatever the permission says.
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    let sub: unknown = null;
    const endpoint = `https://push.example.test/e2e/${Math.random().toString(36).slice(2)}`;
    const fake = {
      endpoint,
      toJSON: () => ({
        endpoint,
        keys: { p256dh: "B".padEnd(87, "A"), auth: "A".padEnd(22, "A") },
      }),
      unsubscribe: async () => ((sub = null), true),
    };
    PushManager.prototype.subscribe = async function () {
      sub = fake;
      return fake as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      return sub as PushSubscription | null;
    };
  });

  await signUp(page, "Berlin, Germany");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  const card = page.getByRole("region", { name: "Notifications" });
  await card.getByRole("button", { name: "Turn on notifications" }).click();
  await expect(card.getByText("Notifications are on for this device.")).toBeVisible();
  expect((await (await page.request.get("/api/push/subscription")).json()).data.count).toBe(1);

  await card.getByRole("button", { name: "Turn off" }).click();
  await expect(card.getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  expect((await (await page.request.get("/api/push/subscription")).json()).data.count).toBe(0);
});
