import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** ADMIN_SECRET from .dev.vars, which `wrangler dev` also reads. */
export function devVar(name: string): string {
  const line = readFileSync(".dev.vars", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .dev.vars`);
  return line.slice(name.length + 1).trim();
}

let n = 0;
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${++n}`;

export const ADMIN = { email: "admin@e2e.test", password: "admin-password" };

/** Create the admin once per run (later calls get 409, which is fine) and seed the demo line. */
export async function ensureWorld(request: APIRequestContext) {
  const boot = await request.post("/api/admin/bootstrap", {
    headers: { "X-Admin-Secret": devVar("ADMIN_SECRET") },
    data: { user: { username: "admin", email: ADMIN.email, password: ADMIN.password, age: 30 } },
  });
  expect([201, 409]).toContain(boot.status());
  const login = await request.post("/api/user/login", { data: { user: ADMIN } });
  const token = (await login.json()).data.authToken as string;
  const seed = await request.post("/api/admin/seed", { headers: { Authorization: `Bearer ${token}` } });
  expect(seed.status()).toBe(201);
  return { adminToken: token, seed: (await seed.json()).data as { trip: string; route: string } };
}

/** Advance the world n ticks as admin. */
export async function tick(request: APIRequestContext, adminToken: string, n = 1) {
  for (let i = 0; i < n; i++) {
    const r = await request.post("/api/admin/tick", { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(r.status()).toBe(200);
  }
}

/** Sign up through the UI, starting at `station`. */
export async function signUp(page: Page, station: string, interests: string[] = []) {
  const username = unique("t");
  await page.goto("/signup");
  await page.getByLabel("Where are you starting?").selectOption({ label: station });
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@e2e.test`);
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Age").fill("28");
  for (const i of interests) await page.getByRole("button", { name: i, exact: true }).click();
  await page.getByRole("button", { name: "Start travelling" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  return { username, email: `${username}@e2e.test` };
}

/** Map tiles come from the internet; the tests don't need them (and CI may be offline). */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await use(page);
  },
});

export { expect };
