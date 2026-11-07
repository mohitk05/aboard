import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { ALL_USER_ROLES, PROFILE_MODES, USER_ROLES, type UserRole } from "./lib/constants";
import { hashPassword, verifyPassword } from "./lib/password";
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

// ---------- validation ----------

const id = z.string().uuid();
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
      route: id,
      vehicle: id.optional(),
      speedKmh: z.number().positive().max(400).optional(),
      active: z.boolean().optional(),
    }),
  }),
  signup: z.object({
    user: z.object({
      username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
      email: z.string().email().max(254),
      password: z.string().min(8).max(256),
      age: z.number().int().min(13).max(120),
      currentStop: id,
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

const param = (c: Context, name: string) => {
  const v = c.req.param(name);
  if (!v || !id.safeParse(v).success) throw new HTTPException(404, { message: "Not found." });
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
app.post("/trip", admin, async (c) => send(c, world(c.env).createTrip((await body(c, schemas.trip)).trip), 201));
app.post("/trip/:id/start", admin, (c) => send(c, world(c.env).startTrip(param(c, "id"))));

// Vehicle
app.get("/vehicle", admin, (c) => world(c.env).listVehicles().then((list) => ok(c, list)));
app.get("/vehicle/:id", anyone, (c) => send(c, world(c.env).getVehicle(param(c, "id"))));
app.post("/vehicle", admin, async (c) => send(c, world(c.env).createVehicle((await body(c, schemas.vehicle)).vehicle), 201));

// Stop
app.get("/stop", (c) => world(c.env).listStops().then((list) => ok(c, list))); // public: signup picks a stop
app.get("/stop/:id", anyone, (c) => send(c, world(c.env).getStop(param(c, "id"))));
app.post("/stop", admin, async (c) => send(c, world(c.env).createStop((await body(c, schemas.stop)).stop), 201));
app.get("/stop/:id/departures", anyone, (c) => send(c, world(c.env).getDepartures(param(c, "id"))));
app.get("/stop/:id/incoming-vehicles", anyone, (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 5) || 5, 1), 50);
  return send(c, world(c.env).getIncomingVehicles(param(c, "id"), limit));
});

// Route
app.get("/route", (c) => world(c.env).listRoutes().then((list) => ok(c, list)));
app.get("/route/:id", anyone, (c) => send(c, world(c.env).getRoute(param(c, "id"))));
app.post("/route", admin, async (c) => send(c, world(c.env).createRoute((await body(c, schemas.route)).route), 201));
app.post("/route/autogenerate", admin, async (c) =>
  send(c, world(c.env).autogenerateRoutes((await body(c, schemas.autogenerate)).config), 201),
);

// User
app.post("/user/signup", async (c) => {
  const { user } = await body(c, schemas.signup);
  const { password, ...rest } = user;
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
  const { password, ...rest } = user;
  return send(c, world(c.env).createUser({ ...rest, passwordHash: await hashPassword(password) }), 201);
});
app.get("/user/me", anyone, (c) => send(c, world(c.env).getUser(c.var.user.id, c.var.user)));
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
app.post("/conversation", anyone, async (c) =>
  send(c, world(c.env).createConversation(c.var.user.id, (await body(c, schemas.conversation)).conversation.members), 201),
);
app.get("/conversation/:id/messages", anyone, (c) =>
  send(c, world(c.env).listMessages(c.var.user.id, param(c, "id"))),
);
app.post("/conversation/:id/messages", anyone, async (c) =>
  send(c, world(c.env).postMessage(c.var.user.id, param(c, "id"), (await body(c, schemas.message)).message), 201),
);

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
  const { password, ...rest } = user;
  const res = await world(c.env).createUser({ ...rest, role: USER_ROLES.ADMIN, passwordHash: await hashPassword(password) });
  if (!res.ok) return fail(c, res.status, res.error);
  return ok(c, { authToken: await startSession(c, { ...res.data, role: USER_ROLES.ADMIN }), user: res.data }, 201);
});
/** Advance the world one tick right now, without waiting for the alarm. Useful in development. */
app.post("/admin/tick", admin, async (c) => ok(c, await world(c.env).tick(Date.now())));
/** Build the demo Lisbon → Vladivostok line and start a train on it. Safe to repeat. */
app.post("/admin/seed", admin, (c) => send(c, world(c.env).seedDemo(), 201));

app.notFound((c) => fail(c, 404, "Not found."));
app.onError((err, c) => {
  if (err instanceof HTTPException) return fail(c, err.status, err.message);
  console.error(err);
  return fail(c, 500, "Something went wrong 😟");
});

export default app satisfies ExportedHandler<Env>;
