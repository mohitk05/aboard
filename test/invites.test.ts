import { reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, buildWorld, unique } from "./helpers";

let admin: string;
beforeEach(async () => {
  await reset();
  ({ admin } = await buildWorld());
});

const join = (invite?: string) => {
  const username = unique("i");
  return api("POST", "/user/signup", {
    body: { user: { username, email: `${username}@aboard.test`, password: "password123", age: 30, ...(invite ? { invite } : {}) } },
  });
};

describe("invite-only signup", () => {
  it("refuses to sign anyone up without an invite", async () => {
    const r = await join();
    expect(r.status).toBe(403);
    expect(r.error).toMatch(/invite-only/);
    expect((await join("NOTAREALCODE")).status).toBe(400);
  });

  it("lets one person in per invite, and shows the admin who used it", async () => {
    const made = await api("POST", "/admin/invites", { token: admin, body: { invite: { note: "For Ada", days: 7 } } });
    expect(made.status).toBe(201);
    const { code } = made.data;
    expect(code).toMatch(/^[0-9A-Z]{12}$/);
    expect(made.data).toMatchObject({ note: "For Ada", status: "open", usedBy: null });
    expect(made.data.expiresAt - made.data.createdAt).toBe(7 * 86_400_000);

    // Anyone can check a code (the signup page does), and it's case-insensitive.
    expect((await api("GET", `/invite/${code.toLowerCase()}`)).data).toEqual({ valid: true, note: "For Ada" });

    const ada = await join(code);
    expect(ada.status).toBe(201);
    expect((await join(code)).error).toMatch(/already been used/);
    expect((await api("GET", `/invite/${code}`)).error).toMatch(/already been used/);

    const list = (await api("GET", "/admin/invites", { token: admin })).data;
    expect(list[0]).toMatchObject({ code, status: "used", usedBy: { id: ada.data.user.id, username: ada.data.user.username } });
  });

  it("lets an admin withdraw an unused invite", async () => {
    const { code } = (await api("POST", "/admin/invites", { token: admin, body: {} })).data;
    expect((await api("DELETE", `/admin/invites/${code}`, { token: admin })).data.status).toBe("revoked");
    expect((await join(code)).error).toMatch(/withdrawn/);
  });

  it("keeps invites to admins", async () => {
    const { code } = (await api("POST", "/admin/invites", { token: admin, body: {} })).data;
    const player = (await join(code)).data.authToken;
    // (Like every admin route, a player's token is refused as unauthorised.)
    expect((await api("POST", "/admin/invites", { token: player, body: {} })).status).toBe(401);
    expect((await api("GET", "/admin/invites", { token: player })).status).toBe(401);
    expect((await api("GET", "/admin/invites")).status).toBe(401);
  });
});
