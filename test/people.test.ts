import { reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, buildWorld, signup } from "./helpers";

let stops: { id: string }[];
let admin: string;

beforeEach(async () => {
  await reset();
  ({ stops, admin } = await buildWorld());
});

describe("inbox", () => {
  it("lists my conversations, newest activity first, and reuses one-to-one threads", async () => {
    const a = await signup(stops[0]!.id);
    const b = await signup(stops[0]!.id);
    const c = await signup(stops[0]!.id);
    const ab = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [b.user.id] } } })).data;
    const ac = (await api("POST", "/conversation", { token: a.token, body: { conversation: { members: [c.user.id] } } })).data;
    // Same pair again (from either side) → same thread.
    const ba = (await api("POST", "/conversation", { token: b.token, body: { conversation: { members: [a.user.id] } } })).data;
    expect(ba.id).toBe(ab.id);

    await api("POST", `/conversation/${ab.id}/messages`, { token: b.token, body: { message: { body: "Tea in the dining car?" } } });
    const inbox = (await api("GET", "/conversation", { token: a.token })).data;
    expect(inbox.map((x: any) => x.id)).toEqual([ab.id, ac.id]);
    expect(inbox[0].with[0].username).toBe(b.user.username);
    expect(inbox[0].lastMessage.body).toBe("Tea in the dining car?");
    expect(inbox[1].lastMessage).toBeNull();
    expect((await api("GET", "/conversation", { token: c.token })).data).toHaveLength(1);
  });
});

describe("profile", () => {
  it("updates interests and privacy", async () => {
    const tea = (await api("POST", "/interest", { token: admin, body: { interest: { name: "Tea" } } })).data.id;
    const a = await signup(stops[0]!.id);
    const r = await api("PATCH", "/user/me", { token: a.token, body: { user: { interests: [tea], profileMode: "PRIVATE" } } });
    expect(r.status).toBe(200);
    expect(r.data.interests.map((i: any) => i.name)).toEqual(["Tea"]);
    expect(r.data.profileMode).toBe("PRIVATE");
  });

  it("changes the password only with the current one", async () => {
    const a = await signup(stops[0]!.id);
    expect((await api("POST", "/user/password", { token: a.token, body: { current: "nope", next: "new-password-1" } })).status).toBe(403);
    expect((await api("POST", "/user/password", { token: a.token, body: { current: "password123", next: "new-password-1" } })).status).toBe(200);
    expect((await api("POST", "/user/login", { body: { user: { email: a.user.email, password: "password123" } } })).status).toBe(401);
    expect((await api("POST", "/user/login", { body: { user: { email: a.user.email, password: "new-password-1" } } })).status).toBe(200);
  });
});
