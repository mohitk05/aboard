import { SELF, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE, api, buildWorld, signup } from "./helpers";

let stops: { id: string; name: string }[];

beforeEach(async () => {
  await reset();
  ({ stops } = await buildWorld());
});

const cookieFrom = (res: Response) => res.headers.get("Set-Cookie") ?? "";

describe("cookie sessions", () => {
  it("sets a secure HttpOnly session cookie on login that authenticates later requests", async () => {
    const { user } = await signup(stops[0]!.id);
    const login = await SELF.fetch(`${BASE}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: { email: user.email, password: "password123" } }),
    });
    expect(login.status).toBe(200);
    const setCookie = cookieFrom(login);
    expect(setCookie).toMatch(/^aboard_session=ey/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const cookie = setCookie.split(";")[0]!;
    const me = await SELF.fetch(`${BASE}/api/user/me`, { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as any).data.id).toBe(user.id);
  });

  it("clears the cookie on logout", async () => {
    const res = await SELF.fetch(`${BASE}/api/user/logout`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toMatch(/aboard_session=;.*Max-Age=0/i);
  });

  it("rejects a bad cookie", async () => {
    const me = await SELF.fetch(`${BASE}/api/user/me`, { headers: { Cookie: "aboard_session=not-a-jwt" } });
    expect(me.status).toBe(401);
  });
});

describe("public endpoints", () => {
  it("lists stops without signing in, for the signup screen", async () => {
    const r = await api("GET", "/stop");
    expect(r.status).toBe(200);
    expect(r.data.map((s: any) => s.name)).toContain("Irkutsk");
  });

  it("serves the API only under /api", async () => {
    const res = await SELF.fetch(`${BASE}/api/nope`);
    expect(res.status).toBe(404);
  });
});
