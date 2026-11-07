import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { World } from "../src/world/world";
import { api, buildWorld, signup, worldStub } from "./helpers";
import { fakeBrowser } from "./push-helpers";

let admin: string;
let stops: { id: string; name: string }[];
let route: { id: string };

beforeEach(async () => {
  await reset();
  ({ admin, stops, route } = await buildWorld());
});

type Sent = { endpoint: string; body: Uint8Array };

/** Swap the World's push transport for one that records requests and answers `status`. */
async function capturePushes(status = 201): Promise<Sent[]> {
  const sent: Sent[] = [];
  await runInDurableObject(worldStub(), (w: World) => {
    w.pushFetch = (async (url: string, init: RequestInit) => {
      sent.push({ endpoint: String(url), body: init.body as Uint8Array });
      return new Response(null, { status });
    }) as unknown as typeof fetch;
  });
  return sent;
}

async function subscribe(token: string) {
  const browser = await fakeBrowser();
  const r = await api("POST", "/push/subscription", {
    token,
    body: { subscription: { endpoint: browser.sub.endpoint, keys: { p256dh: browser.sub.p256dh, auth: browser.sub.auth } } },
  });
  expect(r.status).toBe(201);
  return browser;
}

const titles = async (browser: Awaited<ReturnType<typeof fakeBrowser>>, sent: Sent[]) =>
  Promise.all(sent.map(async (s) => JSON.parse(await browser.decrypt(s.body)).title as string));

describe("push subscriptions", () => {
  it("publishes the VAPID key and stores subscriptions per user", async () => {
    const key = await api("GET", "/push/key");
    expect(key.data.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    const { token } = await signup(stops[0]!.id);
    expect((await api("GET", "/push/subscription", { token })).data.count).toBe(0);
    const b = await subscribe(token);
    expect((await api("GET", "/push/subscription", { token })).data.count).toBe(1);
    await api("DELETE", "/push/subscription", { token, body: { subscription: { endpoint: b.sub.endpoint } } });
    expect((await api("GET", "/push/subscription", { token })).data.count).toBe(0);
  });

  it("only accepts https endpoints", async () => {
    const { token } = await signup(stops[0]!.id);
    const r = await api("POST", "/push/subscription", {
      token,
      body: { subscription: { endpoint: "http://evil.test/x", keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) } } },
    });
    expect(r.status).toBe(400);
  });
});

describe("journey notifications", () => {
  it("tells you when your train is near, when you board, and when you arrive", async () => {
    const trip = (await api("POST", "/trip", { token: admin, body: { trip: { route: route.id, active: true } } })).data;
    const { token } = await signup(stops[1]!.id); // Madrid
    const browser = await subscribe(token);
    await api("POST", "/ticket/buy", { token, body: { ticket: { trip: trip.id, from: stops[1]!.id, to: stops[2]!.id } } });
    const sent = await capturePushes();

    // Ride Madrid → Paris, ticking inside the World (fast) and sending after each tick.
    const me = (await api("GET", "/user/me", { token })).data.id;
    await runInDurableObject(worldStub(), async (w: World, state) => {
      const t0 = Date.now();
      for (let i = 1; i < 1000; i++) {
        w.tick(t0 + i * 5 * 60_000);
        await w.flushNotifications();
        const st = state.storage.sql.exec<{ state: string }>("SELECT state FROM users WHERE id = ?", me).one().state;
        if (st === "ATSTATION") break;
      }
    });
    const got = await titles(browser, sent);
    expect(got[0]).toMatch(/^Your train is \d+ min from Madrid$/);
    expect(got).toContain("You're on board");
    expect(got.find((t) => /^Paris in about \d+ min$/.test(t))).toBeTruthy();
    expect(got.at(-1)).toBe("Welcome to Paris");
    // "Near" goes out once per stop, not on every tick.
    expect(got.filter((t) => t.includes("from Madrid"))).toHaveLength(1);
  });

  it("forgets subscriptions the push service says are gone", async () => {
    const a = await signup(stops[0]!.id);
    const b = await signup(stops[0]!.id);
    await subscribe(b.token);
    await capturePushes(410);
    const conv = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [b.user.id] } } })).data;
    await api("POST", `/conversation/${conv.id}/messages`, { token: a.token, body: { message: { body: "hi" } } });
    expect((await api("GET", "/push/subscription", { token: b.token })).data.count).toBe(0);
  });
});

describe("message notifications", () => {
  it("notifies the other people in the conversation, not the sender", async () => {
    const a = await signup(stops[0]!.id);
    const b = await signup(stops[0]!.id);
    const aBrowser = await subscribe(a.token);
    const bBrowser = await subscribe(b.token);
    const sent = await capturePushes();
    const conv = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [b.user.id] } } })).data;
    await api("POST", `/conversation/${conv.id}/messages`, { token: a.token, body: { message: { body: "Tea at Irkutsk?" } } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toBe(bBrowser.sub.endpoint);
    const msg = JSON.parse(await bBrowser.decrypt(sent[0]!.body));
    expect(msg).toMatchObject({ title: a.user.username, body: "Tea at Irkutsk?", url: `/messages/${conv.id}` });
    expect(aBrowser.sub.endpoint).not.toBe(bBrowser.sub.endpoint);
  });
});
