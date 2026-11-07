import { SELF, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE, api, buildWorld, signup, worldStub } from "./helpers";

let admin: string;
let stops: { id: string }[];

beforeEach(async () => {
  await reset();
  ({ admin, stops } = await buildWorld());
});

/** Open /api/live and collect the events it sends. */
async function connect(token?: string) {
  const res = await SELF.fetch(`${BASE}/api/live`, {
    headers: { Upgrade: "websocket", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const events: any[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener("message", (e) => {
    events.push(e.data === "pong" ? "pong" : JSON.parse(e.data as string));
    waiters.splice(0).forEach((w) => w());
  });
  ws.accept();
  /** Wait until an event matching `pred` has arrived. */
  const next = async (pred: (e: any) => boolean, ms = 2000) => {
    const start = Date.now();
    while (!events.some(pred)) {
      if (Date.now() - start > ms) throw new Error(`no matching event; got ${JSON.stringify(events)}`);
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
    return events.find(pred);
  };
  return { ws, events, next };
}

describe("live updates", () => {
  it("refuses plain HTTP", async () => {
    expect((await SELF.fetch(`${BASE}/api/live`)).status).toBe(400);
  });

  it("greets, answers pings, and broadcasts ticks to everyone (signed in or not)", async () => {
    const anon = await connect();
    const { token } = await signup(stops[0]!.id);
    const player = await connect(token);
    await anon.next((e) => e.type === "hello");
    anon.ws.send("ping");
    await anon.next((e) => e === "pong");

    await worldStub().tick(Date.now());
    for (const c of [anon, player]) expect((await c.next((e) => e.type === "tick")).summary).toBeDefined();
  });

  it("tells clients when an admin changes the world", async () => {
    const watcher = await connect();
    await api("POST", "/stop", { token: admin, body: { stop: { name: "Porto", country: "Portugal", coordinates: { lat: 41.15, lng: -8.61 } } } });
    await watcher.next((e) => e.type === "world");
  });

  it("sends message events only to the people in the conversation", async () => {
    const a = await signup(stops[0]!.id);
    const b = await signup(stops[0]!.id);
    const c = await signup(stops[0]!.id);
    const [la, lb, lc] = [await connect(a.token), await connect(b.token), await connect(c.token)];
    const conv = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [b.user.id] } } })).data;
    await api("POST", `/conversation/${conv.id}/messages`, { token: a.token, body: { message: { body: "hi" } } });
    const isMsg = (e: any) => e.type === "message" && e.conversation === conv.id;
    await la.next(isMsg);
    await lb.next(isMsg);
    await new Promise((r) => setTimeout(r, 200));
    expect(lc.events.some(isMsg)).toBe(false);
  });

  it("ignores a forged X-User-Id header", async () => {
    const victim = await signup(stops[0]!.id);
    const a = await signup(stops[0]!.id);
    const conv = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [victim.user.id] } } })).data;
    const res = await SELF.fetch(`${BASE}/api/live`, { headers: { Upgrade: "websocket", "X-User-Id": victim.user.id } });
    const ws = res.webSocket!;
    const got: string[] = [];
    ws.addEventListener("message", (e) => got.push(e.data as string));
    ws.accept();
    await api("POST", `/conversation/${conv.id}/messages`, { token: a.token, body: { message: { body: "secret" } } });
    await new Promise((r) => setTimeout(r, 200));
    expect(got.some((d) => d.includes('"message"'))).toBe(false);
  });
});
