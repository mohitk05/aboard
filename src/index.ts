import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { ALL_USER_ROLES, MAX_SPEED_KMH, MIN_SPEED_KMH, PROFILE_MODES, USER_ROLES, type UserRole } from "./lib/constants";
import { hashPassword, verifyPassword } from "./lib/password";
import { findStopPhoto } from "./lib/photo";
import type { Result } from "./lib/result";
import type { Viewer, World } from "./world/world";

export { World } from "./world/world";

type AppEnv = { Bindings: Env; Variables: { user: Viewer } };

const TOKEN_TTL_SECONDS = 30 * 24 * 3600;
const SESSION_COOKIE = "aboard_session";

/** The one World object. Every request goes to the same instance. */
const world = (env: Env): DurableObjectStub<World> => env.WORLD.get(env.WORLD.idFromName("world"));

// ---------- responses ----------

const ok = (c: Context, data: unknown, status: 200 | 201 = 200) => c.json({ success: true, data: data ?? {} }, status);
const fail = (c: Context, status: number, error: string) =>
  c.json({ success: false, error }, status as 400 | 401 | 403 | 404 | 409 | 500);
const send = async <T>(c: Context, result: Promise<Result<T>> | Result<T>, status: 200 | 201 = 200) => {
  const r = await result;
  return r.ok ? ok(c, r.data, status) : fail(c, r.status, r.error);
};

/** After an admin changes stations, lines or trains, tell connected clients to refetch. */
const changed = async <T>(env: Env, result: Promise<Result<T>> | Result<T>): Promise<Result<T>> => {
  const r = await result;
  if (r.ok) await world(env).worldChanged();
  return r;
};

// ---------- validation ----------

const id = z.string().uuid();
/** A line, or its return twin (the line's id + "~r"). */
const routeId = z.string().regex(/^[0-9a-f-]{36}(~r)?$/i, "Invalid line id");
const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const schemas = {
  stop: z.object({
    stop: z.object({
      name: z.string().min(1).max(100),
      country: z.string().min(1).max(100),
      coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
      dwellMinutes: z.number().int().min(1).max(24 * 60).optional(),
    }),
  }),
  route: z.object({ route: z.object({ name: z.string().min(1).max(100), stops: z.array(id).min(2).max(100) }) }),
  autogenerate: z.object({
    config: z
      .object({
        count: z.number().int().min(1).max(100).optional(),
        minLength: z.number().int().min(2).max(50).optional(),
        maxLength: z.number().int().min(2).max(50).optional(),
      })
      .default({}),
  }),
  vehicle: z.object({ vehicle: z.object({ name: z.string().min(1).max(100) }) }),
  trip: z.object({
    trip: z.object({
      route: routeId,
      vehicle: id.optional(),
      speedKmh: z.number().min(MIN_SPEED_KMH).max(MAX_SPEED_KMH).optional(),
      active: z.boolean().optional(),
    }),
  }),
  signup: z.object({
    user: z.object({
      username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
      email: z.string().email().max(254),
      password: z.string().min(8).max(256),
      age: z.number().int().min(13).max(120),
      /** Admins creating an account may place it; players always start at home (Berlin). */
      currentStop: id.optional(),
      /** Ignored (players start at home); accepted so older clients don't fail. */
      near: latLng.optional(),
      /** An invite code from an admin. Required to sign up yourself. */
      invite: z.string().trim().min(4).max(64).optional(),
      interests: z.array(id).max(50).optional(),
      image: z.string().url().max(2048).optional(),
      profileMode: z.enum(PROFILE_MODES).optional(),
    }),
  }),
  get bootstrap() {
    return z.object({ user: this.signup.shape.user.partial({ currentStop: true }) });
  },
  login: z.object({ user: z.object({ email: z.string().email(), password: z.string().min(1).max(256) }) }),
  ticket: z.object({ ticket: z.object({ trip: id, from: id, to: id }) }),
  interest: z.object({
    interest: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(1000).optional(),
      image: z.string().url().max(2048).optional(),
    }),
  }),
  profile: z.object({
    user: z.object({
      interests: z.array(id).max(50).optional(),
      image: z.string().url().max(2048).nullable().optional(),
      profileMode: z.enum(PROFILE_MODES).optional(),
      currentStop: id.optional(),
    }),
  }),
  password: z.object({ current: z.string().min(1).max(256), next: z.string().min(8).max(256) }),
  pushSubscription: z.object({
    subscription: z.object({
      endpoint: z.string().url().max(2048).startsWith("https://"),
      keys: z.object({ p256dh: z.string().min(80).max(100), auth: z.string().min(16).max(32) }),
    }),
  }),
  conversation: z.object({ conversation: z.object({ members: z.array(id).min(1).max(50) }) }),
  message: z.object({ message: z.object({ title: z.string().max(200).optional(), body: z.string().min(1).max(5000) }) }),
};

async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be JSON." });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) });
  return parsed.data;
}

/**
 * Where is this person? The browser's own coordinates if it sent them (precise, but needs the
 * user's permission), otherwise Cloudflare's approximate location for the request's IP address.
 */
function whereIs(c: Context, browser?: { lat: number; lng: number }): { at: { lat: number; lng: number } | null; source: "browser" | "network" | "none" } {
  if (browser) return { at: browser, source: "browser" };
  const cf = c.req.raw.cf as { latitude?: string; longitude?: string } | undefined;
  const lat = Number(cf?.latitude);
  const lng = Number(cf?.longitude);
  if (cf?.latitude && cf?.longitude && Number.isFinite(lat) && Number.isFinite(lng)) return { at: { lat, lng }, source: "network" };
  return { at: null, source: "none" };
}

const param = (c: Context, name: string, schema: z.ZodType<string> = id) => {
  const v = c.req.param(name);
  if (!v || !schema.safeParse(v).success) throw new HTTPException(404, { message: "Not found." });
  return v;
};

// ---------- auth ----------

const auth =
  (roles: UserRole[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    // Scripts send a Bearer token; the web app relies on the HttpOnly session cookie.
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, SESSION_COOKIE);
    if (!token) return fail(c, 401, "Unauthorized.");
    try {
      const payload = await verify(token, c.env.JWT_KEY, "HS256");
      const role = payload.role as UserRole;
      if (typeof payload.sub !== "string" || !roles.includes(role)) return fail(c, 401, "Unauthorized.");
      c.set("user", { id: payload.sub, role });
    } catch {
      return fail(c, 401, "Unauthorized.");
    }
    await next();
  };
const anyone = auth(ALL_USER_ROLES);
const admin = auth([USER_ROLES.ADMIN]);

/** Sign a JWT, set it as the session cookie, and return it (for API clients that use Bearer). */
async function startSession(c: Context, u: { id: string; username: string; role: UserRole }): Promise<string> {
  const token = await sign(
    { sub: u.id, username: u.username, role: u.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS },
    c.env.JWT_KEY,
    "HS256",
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
  return token;
}

// ---------- routes ----------

// Everything lives under /api; other paths are the web app (static assets, see wrangler.jsonc).
const app = new Hono<AppEnv>({ strict: false }).basePath("/api");

// General
app.get("/", (c) => ok(c, "hello"));

// Trip
// The world itself (stops, lines, trains) is public, so the landing page can show it.
app.get("/trip", (c) => world(c.env).listTrips(c.req.query("active") === "1").then((list) => ok(c, list)));
app.get("/trip/:id", anyone, (c) => send(c, world(c.env).getTrip(param(c, "id"))));
app.post("/trip", admin, async (c) => send(c, changed(c.env, world(c.env).createTrip((await body(c, schemas.trip)).trip)), 201));
app.post("/trip/:id/position", admin, async (c) => {
  const input = await body(c, z.object({ stopIndex: z.number().int().min(0), km: z.number().min(0).max(20_000).default(0) }));
  return send(c, changed(c.env, world(c.env).setTripPosition(param(c, "id"), input)));
});
app.patch("/trip/:id", admin, async (c) => {
  const { trip } = await body(c, z.object({ trip: z.object({ speedKmh: z.number().min(MIN_SPEED_KMH).max(MAX_SPEED_KMH) }) }));
  return send(c, changed(c.env, world(c.env).setTripSpeed(param(c, "id"), trip.speedKmh)));
});
app.post("/trip/:id/start", admin, (c) => send(c, changed(c.env, world(c.env).startTrip(param(c, "id")))));

// Vehicle
app.get("/vehicle", admin, (c) => world(c.env).listVehicles().then((list) => ok(c, list)));
app.get("/vehicle/:id", anyone, (c) => send(c, world(c.env).getVehicle(param(c, "id"))));
app.post("/vehicle", admin, async (c) => send(c, world(c.env).createVehicle((await body(c, schemas.vehicle)).vehicle), 201));

// Stop
app.get("/stop", (c) => world(c.env).listStops().then((list) => ok(c, list))); // public: signup picks a stop
/** The station nearest to you: ?lat=&lng= from the browser, or your approximate network location. */
app.get("/stop/nearest", async (c) => {
  const q = latLng.safeParse({ lat: Number(c.req.query("lat")), lng: Number(c.req.query("lng")) });
  const { at, source } = whereIs(c, q.success ? q.data : undefined);
  const stop = await world(c.env).nearestStop(at);
  return stop ? ok(c, { stop, source }) : fail(c, 404, "There are no stations yet.");
});
app.get("/stop/:id", anyone, (c) => send(c, world(c.env).getStop(param(c, "id"))));
app.post("/stop", admin, async (c) => send(c, changed(c.env, world(c.env).createStop((await body(c, schemas.stop)).stop)), 201));
/** Public: a station's arrivals and departures. */
app.get("/stop/:id/board", (c) => send(c, world(c.env).getStationBoard(param(c, "id"))));
/** Public: a photo of the place, from Wikipedia, cached at the edge for a week. */
app.get("/stop/:id/photo", async (c) => {
  const found = await world(c.env).getStop(param(c, "id"));
  if (!found.ok) return fail(c, 404, "Stop not found");
  const stop = found.data;
  const key = new Request(`https://photo.aboard/${stop.id}?${new URLSearchParams({ name: stop.name, v: "1" })}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return hit;
  let photo = null;
  try {
    photo = await findStopPhoto(stop);
  } catch {
    return fail(c, 502, "Couldn't reach Wikipedia for a photo.");
  }
  const res = photo ? Response.json({ success: true, data: photo }) : Response.json({ success: false, error: "No photo of this place." }, { status: 404 });
  res.headers.set("Cache-Control", `public, max-age=${photo ? 604800 : 86400}`);
  c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
});
app.get("/stop/:id/departures", anyone, (c) => send(c, world(c.env).getDepartures(param(c, "id"))));
app.get("/stop/:id/incoming-vehicles", anyone, (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 5) || 5, 1), 50);
  return send(c, world(c.env).getIncomingVehicles(param(c, "id"), limit));
});

// Route
app.get("/route", (c) => world(c.env).listRoutes().then((list) => ok(c, list)));
app.get("/route/:id", anyone, (c) => send(c, world(c.env).getRoute(param(c, "id", routeId))));
app.post("/route", admin, async (c) => send(c, changed(c.env, world(c.env).createRoute((await body(c, schemas.route)).route)), 201));
app.post("/route/autogenerate", admin, async (c) =>
  send(c, changed(c.env, world(c.env).autogenerateRoutes((await body(c, schemas.autogenerate)).config)), 201),
);

// User
app.post("/user/signup", async (c) => {
  const { user } = await body(c, schemas.signup);
  // Aboard is invite-only: signing up needs an invite code from an admin.
  if (!user.invite) return fail(c, 403, "Aboard is invite-only. Ask an admin for an invite.");
  // Everyone starts at home (Berlin): where they ask to start, or where they are, doesn't matter.
  const { password, near: _near, currentStop: _stop, ...rest } = user;
  const res = await world(c.env).createUser({ ...rest, passwordHash: await hashPassword(password) });
  if (!res.ok) return fail(c, res.status, res.error);
  return ok(c, { authToken: await startSession(c, { ...res.data, role: USER_ROLES.PLAYER }), user: res.data }, 201);
});
app.post("/user/login", async (c) => {
  const { user } = await body(c, schemas.login);
  const creds = await world(c.env).getCredentials(user.email);
  // Hash even when the email is unknown, so response time doesn't reveal which emails exist.
  const valid = creds
    ? await verifyPassword(user.password, creds.passwordHash)
    : (await hashPassword(user.password), false);
  if (!creds || !valid) return fail(c, 401, "Wrong email or password.");
  return ok(c, { authToken: await startSession(c, creds), user: creds.user });
});
app.post("/user/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return ok(c, { loggedOut: true });
});
app.post("/user", admin, async (c) => {
  const { user } = await body(c, schemas.signup);
  const { password, near: _near, ...rest } = user;
  return send(c, world(c.env).createUser({ ...rest, passwordHash: await hashPassword(password) }), 201);
});
app.get("/user/me", anyone, (c) => send(c, world(c.env).getUser(c.var.user.id, c.var.user)));
app.patch("/user/me", anyone, async (c) => send(c, world(c.env).updateProfile(c.var.user.id, (await body(c, schemas.profile)).user)));
/** Put me at the station nearest to where I am (only if I'm not at one yet, or I'm an admin). */
app.post("/user/me/locate", anyone, async (c) => {
  const { near } = await body(c, z.object({ near: latLng.optional() }).default({}));
  return send(c, world(c.env).placeNearest(c.var.user.id, whereIs(c, near).at));
});
/** Admin: put a player at a station (for testing and support). */
app.post("/user/:id/place", admin, async (c) => {
  const { stop } = await body(c, z.object({ stop: z.string().min(1) }));
  return send(c, world(c.env).placeUser(param(c, "id"), stop));
});
/** Admin: give a player credits (negative takes them away). */
app.post("/user/:id/grant", admin, async (c) => {
  const { credits } = await body(c, z.object({ credits: z.number().min(-1_000_000).max(1_000_000) }));
  return send(c, world(c.env).grant(param(c, "id"), credits));
});

// ---------- the industry game ----------
const qty = z.number().int().min(1).max(1000);
/** Public: goods, industries and every market with today's prices. */
app.get("/game/catalog", (c) => world(c.env).catalog().then((data) => ok(c, data)));
app.get("/game", anyone, (c) => send(c, world(c.env).getGame(c.var.user.id)));
app.post("/game/buy", anyone, async (c) => {
  const i = await body(c, z.object({ good: z.string(), qty }));
  return send(c, world(c.env).buy(c.var.user.id, i.good, i.qty));
});
app.post("/game/sell", anyone, async (c) => {
  const i = await body(c, z.object({ good: z.string(), qty }));
  return send(c, world(c.env).sell(c.var.user.id, i.good, i.qty));
});
app.post("/game/unload", anyone, (c) => send(c, world(c.env).unload(c.var.user.id)));
app.post("/game/load", anyone, async (c) => {
  const i = await body(c, z.object({ good: z.string(), qty }));
  return send(c, world(c.env).load(c.var.user.id, i.good, i.qty));
});
app.post("/game/build", anyone, async (c) => {
  const i = await body(c, z.object({ industry: z.string() }));
  return send(c, world(c.env).build(c.var.user.id, i.industry));
});
app.post("/game/produce", anyone, async (c) => {
  const i = await body(c, z.object({ industry: z.string() }));
  return send(c, world(c.env).produce(c.var.user.id, i.industry));
});

app.post("/user/password", anyone, async (c) => {
  const { current, next } = await body(c, schemas.password);
  const w = world(c.env);
  const stored = await w.getPasswordHash(c.var.user.id);
  if (!stored || !(await verifyPassword(current, stored))) return fail(c, 403, "Your current password is wrong.");
  await w.setPasswordHash(c.var.user.id, await hashPassword(next));
  return ok(c, { changed: true });
});
app.get("/user/fellow-users", anyone, (c) => send(c, world(c.env).getFellowUsers(c.var.user.id)));
app.get("/user/:id", anyone, (c) => send(c, world(c.env).getUser(param(c, "id"), c.var.user)));

// Ticket
app.post("/ticket/buy", anyone, async (c) =>
  send(c, world(c.env).buyTicket(c.var.user.id, (await body(c, schemas.ticket)).ticket), 201),
);
app.delete("/ticket", anyone, (c) => send(c, world(c.env).cancelTicket(c.var.user.id)));
app.get("/ticket/:id", admin, (c) => send(c, world(c.env).getTicket(param(c, "id"))));

// Interest
app.get("/interest", (c) => world(c.env).listInterests().then((list) => ok(c, list)));
app.post("/interest", admin, async (c) =>
  send(c, world(c.env).createInterest((await body(c, schemas.interest)).interest), 201),
);

// Messaging
app.get("/conversation", anyone, (c) => world(c.env).listConversations(c.var.user.id).then((list) => ok(c, list)));
app.post("/conversation", anyone, async (c) =>
  send(c, world(c.env).createConversation(c.var.user.id, (await body(c, schemas.conversation)).conversation.members), 201),
);
app.get("/conversation/:id/messages", anyone, (c) =>
  send(c, world(c.env).listMessages(c.var.user.id, param(c, "id"))),
);
app.post("/conversation/:id/messages", anyone, async (c) =>
  send(c, world(c.env).postMessage(c.var.user.id, param(c, "id"), (await body(c, schemas.message)).message), 201),
);

// Push notifications
app.get("/push/key", async (c) => {
  const key = await world(c.env).pushPublicKey();
  return key ? ok(c, { publicKey: key }) : fail(c, 404, "Notifications aren't set up on this server.");
});
app.get("/push/subscription", anyone, async (c) => ok(c, { count: await world(c.env).countPushSubscriptions(c.var.user.id) }));
app.post("/push/subscription", anyone, async (c) => {
  const { subscription: s } = await body(c, schemas.pushSubscription);
  return send(c, world(c.env).savePushSubscription(c.var.user.id, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }), 201);
});
app.delete("/push/subscription", anyone, async (c) => {
  const { subscription: s } = await body(c, z.object({ subscription: z.object({ endpoint: z.string().url() }) }));
  return ok(c, await world(c.env).deletePushSubscription(c.var.user.id, s.endpoint));
});

// Admin
/** Create the first admin. Needs the ADMIN_SECRET header, and only works while there are no admins. */
app.post("/admin/bootstrap", async (c) => {
  const secret = c.env.ADMIN_SECRET;
  const given = c.req.header("X-Admin-Secret") ?? "";
  const enc = new TextEncoder();
  const match =
    !!secret && given.length === secret.length && crypto.subtle.timingSafeEqual(enc.encode(given), enc.encode(secret));
  if (!match) return fail(c, 401, "Unauthorized.");
  if ((await world(c.env).countAdmins()) > 0) return fail(c, 409, "An admin already exists.");
  const { user } = await body(c, schemas.bootstrap);
  const { password, near: _near, ...rest } = user;
  const res = await world(c.env).createUser({ ...rest, role: USER_ROLES.ADMIN, passwordHash: await hashPassword(password) });
  if (!res.ok) return fail(c, res.status, res.error);
  return ok(c, { authToken: await startSession(c, { ...res.data, role: USER_ROLES.ADMIN }), user: res.data }, 201);
});
/** Advance the world one tick right now, without waiting for the alarm. Useful in development. */
app.post("/admin/tick", admin, async (c) => {
  const w = world(c.env);
  const summary = await w.tick(Date.now());
  await w.flushNotifications();
  return ok(c, summary);
});
/** Which SQL statements read the most rows (Cloudflare bills by rows read), since the world last woke. */
app.get("/admin/sql-stats", admin, async (c) => ok(c, await world(c.env).sqlReport(Number(c.req.query("limit")) || 25)));
/** Build the demo Lisbon → Vladivostok line and start a train on it. Safe to repeat. */
// Invites: signing up needs one.
/** Public: is this invite code usable? */
app.get("/invite/:code", (c) => send(c, world(c.env).checkInvite(c.req.param("code"))));
app.get("/admin/invites", admin, (c) => world(c.env).listInvites().then((list) => ok(c, list)));
app.post("/admin/invites", admin, async (c) => {
  const { invite } = await body(
    c,
    z.object({ invite: z.object({ note: z.string().max(120).optional(), days: z.number().int().min(1).max(365).optional() }).default({}) }).default({ invite: {} }),
  );
  return send(c, world(c.env).createInvite(c.var.user.id, invite), 201);
});
app.delete("/admin/invites/:code", admin, (c) => send(c, world(c.env).revokeInvite(c.req.param("code"))));
app.post("/admin/seed", admin, (c) => send(c, changed(c.env, world(c.env).seedDemo()), 201));

/**
 * Live updates over a WebSocket: world ticks, world changes, and new messages for you.
 * Signed-in or not (the landing page map uses it too); the World only needs to know who you are.
 */
app.get("/live", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") return fail(c, 400, "Expected a WebSocket upgrade.");
  let userId: string | null = null;
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, SESSION_COOKIE);
  if (token) {
    try {
      const payload = await verify(token, c.env.JWT_KEY, "HS256");
      if (typeof payload.sub === "string") userId = payload.sub;
    } catch {
      /* treat as signed out */
    }
  }
  const headers = new Headers(c.req.raw.headers);
  headers.delete("X-User-Id");
  if (userId) headers.set("X-User-Id", userId);
  return world(c.env).fetch(new Request(c.req.raw.url, { headers }));
});

app.notFound((c) => fail(c, 404, "Not found."));
app.onError((err, c) => {
  if (err instanceof HTTPException) return fail(c, err.status, err.message);
  console.error(err);
  return fail(c, 500, "Something went wrong 😟");
});

// ---------- satellite tiles ----------

/**
 * NASA GIBS imagery for the globe, via our own origin: GIBS sends `no-store`, so we cache tiles at
 * Cloudflare's edge and hand them out as cacheable. Only these two layers, zoom 0–8, so this
 * isn't an open proxy. Imagery: NASA EOSDIS GIBS (public domain).
 */
const TILE_LAYERS = {
  day: { path: "BlueMarble_NextGeneration/default", ext: "jpeg", type: "image/jpeg" },
  night: { path: "VIIRS_Black_Marble/default/2016-01-01", ext: "png", type: "image/png" },
} as const;

async function serveTile(request: Request, ctx: ExecutionContext): Promise<Response | null> {
  const m = new URL(request.url).pathname.match(/^\/tiles\/(day|night)\/(\d)\/(\d{1,3})\/(\d{1,3})\.(jpg|png)$/);
  if (!m) return null;
  const layer = TILE_LAYERS[m[1] as keyof typeof TILE_LAYERS];
  const [z, x, y] = [Number(m[2]), Number(m[3]), Number(m[4])];
  if (z > 8 || x >= 2 ** z || y >= 2 ** z) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const key = new Request(new URL(request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.path}/GoogleMapsCompatible_Level8/${z}/${y}/${x}.${layer.ext}`,
      { cf: { cacheTtl: 2592000, cacheEverything: true } },
    );
  } catch {
    return new Response("Tile unavailable", { status: 502 }); // the globe falls back to its own texture
  }
  if (!upstream.ok) return new Response("Tile unavailable", { status: upstream.status === 404 ? 404 : 502 });
  const res = new Response(upstream.body, {
    headers: {
      "Content-Type": layer.type,
      // The imagery is fixed (Blue Marble 2004, Black Marble 2016), so cache it for a long time.
      "Cache-Control": "public, max-age=2592000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/tiles/")) {
      return (await serveTile(request, ctx)) ?? new Response("Not found", { status: 404 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
