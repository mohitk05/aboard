import { DurableObject } from "cloudflare:workers";
import {
  COST_PER_KM,
  DEFAULT_DWELL_MINUTES,
  DEFAULT_SPEED_KMH,
  USER_ROLES,
  WORLD_INTERVAL_MINUTES,
  WORLD_INTERVAL_MS,
  type ProfileMode,
  type TripState,
  type UserRole,
  type UserState,
} from "../lib/constants";
import { railKm } from "../lib/geo";
import { badRequest, conflict, forbidden, guard, notFound, type Result } from "../lib/result";
import { migrate } from "./schema";
import { SEED_INTERESTS, SEED_LINE_NAME, SEED_STOPS } from "./seed";

// ---------- row types (as stored) ----------

type StopRow = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  dwell_minutes: number;
  created_at: number;
};
type RouteStopRow = StopRow & { position: number; km: number };
type TripRow = {
  id: string;
  vehicle_id: string | null;
  route_id: string;
  state: TripState;
  active: number;
  speed_kmh: number;
  stop_index: number;
  progress: number;
  stop_at: number | null;
  created_at: number;
};
type UserRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  state: UserState;
  current_stop_id: string | null;
  ticket_id: string | null;
  age: number;
  image: string | null;
  profile_mode: ProfileMode;
  created_at: number;
};
type TicketRow = {
  id: string;
  user_id: string;
  trip_id: string;
  from_stop_id: string;
  to_stop_id: string;
  desired_to_stop_id: string | null;
  price: number;
  created_at: number;
};

// ---------- inputs ----------

export interface StopInput {
  name: string;
  country: string;
  coordinates: { lat: number; lng: number };
  dwellMinutes?: number;
}
export interface RouteInput {
  name: string;
  stops: string[];
}
export interface AutogenerateInput {
  count?: number;
  minLength?: number;
  maxLength?: number;
}
export interface TripInput {
  route: string;
  vehicle?: string;
  speedKmh?: number;
  active?: boolean;
}
export interface NewUserInput {
  username: string;
  email: string;
  passwordHash: string;
  age: number;
  /** Required for players. Admins don't need to be anywhere. */
  currentStop?: string;
  interests?: string[];
  role?: UserRole;
  image?: string;
  profileMode?: ProfileMode;
}
export interface TicketInput {
  trip: string;
  from: string;
  to: string;
}
export interface Viewer {
  id: string;
  role: UserRole;
}

// ---------- output shapes ----------

const stopOut = (s: StopRow) => ({
  id: s.id,
  name: s.name,
  country: s.country,
  coordinates: { lat: s.lat, lng: s.lng },
  dwellMinutes: s.dwell_minutes,
});
export type Stop = ReturnType<typeof stopOut>;

const ticketOut = (t: TicketRow) => ({
  id: t.id,
  user: t.user_id,
  trip: t.trip_id,
  from: t.from_stop_id,
  to: t.to_stop_id,
  desiredTo: t.desired_to_stop_id,
  price: t.price,
  createdAt: t.created_at,
});
export type Ticket = ReturnType<typeof ticketOut>;

export interface TickSummary {
  tripsAdvanced: number;
  arrivals: number;
  departures: number;
  boarded: number;
  alighted: number;
  missed: number;
}

const newId = () => crypto.randomUUID();

/**
 * The whole world lives in one SQLite-backed Durable Object. A Durable Object handles
 * one request at a time, so every method below is atomic: no two players can buy the
 * last seat (or, later, the last crate) at once.
 */
export class World extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => migrate(ctx.storage));
  }

  // ======================= world clock =======================

  override async alarm(): Promise<void> {
    try {
      this.tick(Date.now());
    } finally {
      await this.scheduleNextTick();
    }
  }

  private async scheduleNextTick(): Promise<void> {
    const active = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM trips WHERE active = 1").one().n;
    if (active > 0) await this.ctx.storage.setAlarm(Date.now() + WORLD_INTERVAL_MS);
  }

  private async ensureClockRunning(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.scheduleNextTick();
  }

  /**
   * Advance the world by one WORLD_INTERVAL. Passengers are handled first, against where
   * the trains are now, so anyone at a stop during a train's dwell gets to board before
   * the train moves on.
   */
  tick(now: number): TickSummary {
    const summary: TickSummary = { tripsAdvanced: 0, arrivals: 0, departures: 0, boarded: 0, alighted: 0, missed: 0 };
    this.ctx.storage.transactionSync(() => {
      this.tickPassengers(summary);
      this.tickTrips(now, summary);
      this.sql.exec(
        "INSERT INTO world_meta (key, value) VALUES ('last_tick_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        String(now),
      );
    });
    return summary;
  }

  /** When the world last advanced (ms), or null if it never has. */
  private lastTickAt(): number | null {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM world_meta WHERE key = 'last_tick_at'").toArray()[0];
    return row ? Number(row.value) : null;
  }

  /** The moment a trip's stored progress describes: its last tick, or its last arrival/departure if later. */
  private tripAsOf(t: TripRow): number {
    return Math.max(this.lastTickAt() ?? 0, t.stop_at ?? 0) || Date.now();
  }

  private tickPassengers(summary: TickSummary): void {
    const rows = this.sql
      .exec<UserRow & { t_trip: string; t_from: string; t_dest: string }>(
        `SELECT u.*, t.trip_id AS t_trip, t.from_stop_id AS t_from,
                COALESCE(t.desired_to_stop_id, t.to_stop_id) AS t_dest
         FROM users u JOIN tickets t ON t.id = u.ticket_id`,
      )
      .toArray();

    const tripCache = new Map<string, { trip: TripRow; stops: string[] }>();
    const load = (tripId: string) => {
      let v = tripCache.get(tripId);
      if (!v) {
        const trip = this.tripRow(tripId);
        v = { trip, stops: this.routeStops(trip.route_id).map((s) => s.id) };
        tripCache.set(tripId, v);
      }
      return v;
    };

    for (const u of rows) {
      const { trip, stops } = load(u.t_trip);
      const fromIdx = stops.indexOf(u.t_from);
      const destIdx = stops.indexOf(u.t_dest);
      const here = stops[trip.stop_index]!;

      if (u.state === "READYTOGO") {
        if (trip.active && trip.state === "STATIONARY" && trip.stop_index === fromIdx) {
          this.sql.exec("UPDATE users SET state = 'ONBOARD', current_stop_id = ? WHERE id = ?", here, u.id);
          summary.boarded++;
        } else if (trip.stop_index > fromIdx || (trip.stop_index === fromIdx && trip.state === "MOVING")) {
          // The train left without them.
          this.sql.exec("UPDATE users SET state = 'ATSTATION', ticket_id = NULL WHERE id = ?", u.id);
          summary.missed++;
        }
      } else if (u.state === "ONBOARD") {
        const arrived = trip.state === "STATIONARY" && trip.stop_index === destIdx;
        const lineEnded = trip.state === "IDLE";
        if (arrived || lineEnded) {
          this.sql.exec(
            "UPDATE users SET state = 'ATSTATION', ticket_id = NULL, current_stop_id = ? WHERE id = ?",
            here,
            u.id,
          );
          summary.alighted++;
        } else {
          this.sql.exec("UPDATE users SET current_stop_id = ? WHERE id = ?", here, u.id);
        }
      }
    }
  }

  private tickTrips(now: number, summary: TickSummary): void {
    const trips = this.sql.exec<TripRow>("SELECT * FROM trips WHERE active = 1").toArray();
    for (const trip of trips) {
      const stops = this.routeStops(trip.route_id);
      const last = stops.length - 1;
      summary.tripsAdvanced++;

      if (trip.state === "MOVING") {
        const segmentKm = stops[trip.stop_index + 1]!.km;
        const progress = trip.progress + (trip.speed_kmh * WORLD_INTERVAL_MINUTES) / 60;
        if (progress >= segmentKm) {
          this.sql.exec(
            "UPDATE trips SET state = 'STATIONARY', stop_index = stop_index + 1, progress = 0, stop_at = ? WHERE id = ?",
            now,
            trip.id,
          );
          summary.arrivals++;
        } else {
          this.sql.exec("UPDATE trips SET progress = ? WHERE id = ?", progress, trip.id);
        }
      } else if (trip.state === "STATIONARY") {
        const waited = trip.progress + WORLD_INTERVAL_MINUTES;
        if (waited < stops[trip.stop_index]!.dwell_minutes) {
          this.sql.exec("UPDATE trips SET progress = ? WHERE id = ?", waited, trip.id);
        } else if (trip.stop_index < last) {
          this.sql.exec("UPDATE trips SET state = 'MOVING', progress = 0, stop_at = ? WHERE id = ?", now, trip.id);
          summary.departures++;
        } else {
          // End of the line. The trip keeps stop_index so late passengers can be put down here.
          this.sql.exec("UPDATE trips SET state = 'IDLE', active = 0, progress = 0 WHERE id = ?", trip.id);
        }
      }
    }
  }

  // ======================= stops =======================

  createStop(input: StopInput): Result<Stop> {
    return guard(() => {
      const row: StopRow = {
        id: newId(),
        name: input.name,
        country: input.country,
        lat: input.coordinates.lat,
        lng: input.coordinates.lng,
        dwell_minutes: input.dwellMinutes ?? DEFAULT_DWELL_MINUTES,
        created_at: Date.now(),
      };
      this.sql.exec(
        "INSERT INTO stops (id, name, country, lat, lng, dwell_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ...Object.values(row),
      );
      return stopOut(row);
    });
  }

  listStops(): Stop[] {
    return this.sql.exec<StopRow>("SELECT * FROM stops ORDER BY name").toArray().map(stopOut);
  }

  getStop(id: string): Result<Stop> {
    return guard(() => stopOut(this.stopRow(id)));
  }

  /** Trains still due at this stop, soonest first, with distance (km) and arrival time (ms). */
  /**
   * The departures board: running trains that will still call here, soonest first, each with
   * the stations you could ride to, their arrival times and fares.
   */
  getDepartures(stopId: string, limit = 10) {
    return guard(() => {
      this.stopRow(stopId);
      const candidates = this.sql
        .exec<TripRow & { pos: number; route_name: string; vehicle_name: string | null }>(
          `SELECT t.*, rs.position AS pos, r.name AS route_name, v.name AS vehicle_name
           FROM trips t
           JOIN route_stops rs ON rs.route_id = t.route_id AND rs.stop_id = ?
           JOIN routes r ON r.id = t.route_id
           LEFT JOIN vehicles v ON v.id = t.vehicle_id
           WHERE t.active = 1`,
          stopId,
        )
        .toArray();

      const out = [];
      for (const trip of candidates) {
        const due = trip.stop_index < trip.pos || (trip.stop_index === trip.pos && trip.state === "STATIONARY");
        const stops = this.routeStops(trip.route_id);
        if (!due || trip.pos === stops.length - 1) continue; // gone, or this is the end of the line
        const asOf = this.tripAsOf(trip);
        const here = this.remainingTo(trip, stops, trip.pos);
        let km = 0;
        const destinations = [];
        for (let j = trip.pos + 1; j < stops.length; j++) {
          km += stops[j]!.km;
          destinations.push({
            stop: stopOut(stops[j]!),
            km: Math.round(km * 10) / 10,
            price: Math.round(km * COST_PER_KM * 100) / 100,
            arrivalTime: asOf + this.remainingTo(trip, stops, j).ms,
          });
        }
        out.push({
          trip: this.tripOut(trip),
          line: trip.route_name,
          train: trip.vehicle_name,
          boardingNow: trip.stop_index === trip.pos,
          arrivalTime: Math.max(Date.now(), asOf + here.ms),
          /** When it leaves this station (arrival plus the wait here). */
          departureTime: Math.max(
            Date.now(),
            (trip.stop_index === trip.pos ? (trip.stop_at ?? asOf) : asOf + here.ms) + stops[trip.pos]!.dwell_minutes * 60_000,
          ),
          terminus: stopOut(stops[stops.length - 1]!),
          destinations,
        });
      }
      out.sort((a, b) => a.arrivalTime - b.arrivalTime);
      return out.slice(0, limit);
    });
  }

  getIncomingVehicles(stopId: string, limit = 5) {
    return guard(() => {
      this.stopRow(stopId);
      const now = Date.now();
      const candidates = this.sql
        .exec<TripRow & { pos: number }>(
          `SELECT t.*, rs.position AS pos FROM trips t
           JOIN route_stops rs ON rs.route_id = t.route_id AND rs.stop_id = ?
           WHERE t.active = 1`,
          stopId,
        )
        .toArray();

      const incoming = [];
      for (const trip of candidates) {
        const due =
          trip.stop_index < trip.pos || (trip.stop_index === trip.pos && trip.state === "STATIONARY");
        if (!due) continue;
        const { km, ms } = this.remainingTo(trip, this.routeStops(trip.route_id), trip.pos);
        incoming.push({ trip: this.tripOut(trip), distanceKm: km, arrivalTime: Math.max(now, this.tripAsOf(trip) + ms) });
      }
      incoming.sort((a, b) => a.arrivalTime - b.arrivalTime);
      return incoming.slice(0, limit);
    });
  }

  // ======================= routes =======================

  createRoute(input: RouteInput) {
    return guard(() => {
      if (input.stops.length < 2) throw badRequest("A route needs at least two stops.");
      if (new Set(input.stops).size !== input.stops.length) throw badRequest("A route can't visit a stop twice.");
      const stops = input.stops.map((id) => this.stopRow(id));
      const routeId = newId();
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("INSERT INTO routes (id, name, created_at) VALUES (?, ?, ?)", routeId, input.name, Date.now());
        stops.forEach((s, i) => {
          const km = i === 0 ? 0 : railKm(stops[i - 1]!, s);
          this.sql.exec(
            "INSERT INTO route_stops (route_id, position, stop_id, km) VALUES (?, ?, ?, ?)",
            routeId,
            i,
            s.id,
            km,
          );
        });
      });
      return this.routeOut(routeId);
    });
  }

  listRoutes() {
    return this.sql
      .exec<{ id: string }>("SELECT id FROM routes ORDER BY name")
      .toArray()
      .map((r) => this.routeOut(r.id));
  }

  getRoute(id: string) {
    return guard(() => this.routeOut(id));
  }

  /**
   * Generate routes that run roughly west → east through stops sorted by longitude.
   * Ported from the original algorithm, without the old sort bug (it compared lat to lng).
   */
  autogenerateRoutes(config: AutogenerateInput = {}) {
    return guard(() => {
      const stops = this.sql.exec<StopRow>("SELECT * FROM stops ORDER BY lng").toArray();
      if (stops.length < 2) throw badRequest("Need at least two stops.");
      const count = config.count ?? stops.length;
      const maxLength = Math.min(config.maxLength ?? 10, stops.length);
      const minLength = Math.min(config.minLength ?? 5, maxLength);
      const minOffset = 1;
      const window = 10;
      const usage = new Map<string, number>(stops.map((s) => [s.id, 0]));

      const created = [];
      for (let attempt = 0; created.length < count && attempt < count * 10; attempt++) {
        let idx = Math.floor(Math.random() * stops.length);
        const route: StopRow[] = [stops[idx]!];
        for (let tries = 0; route.length < maxLength && tries < 100; tries++) {
          if (route.length >= minLength && Math.random() < 0.5) break;
          const options = [];
          for (let i = 0; i < window; i++) options.push(stops[(idx + minOffset + i) % stops.length]!);
          const pick = options[Math.floor(Math.random() * options.length)]!;
          if (!route.includes(pick) && usage.get(pick.id)! < 5) {
            route.push(pick);
            usage.set(pick.id, usage.get(pick.id)! + 1);
            idx = stops.indexOf(pick);
          } else {
            idx = (idx + 1) % stops.length;
          }
        }
        if (route.length < minLength) continue;
        const res = this.createRoute({ name: `Route ${created.length + 1}`, stops: route.map((s) => s.id) });
        if (res.ok) created.push(res.data);
      }
      return created;
    });
  }

  // ======================= vehicles =======================

  createVehicle(input: { name: string }) {
    return guard(() => {
      const id = newId();
      this.sql.exec("INSERT INTO vehicles (id, name, created_at) VALUES (?, ?, ?)", id, input.name, Date.now());
      return this.vehicleOut(id);
    });
  }

  listVehicles() {
    return this.sql
      .exec<{ id: string }>("SELECT id FROM vehicles ORDER BY name")
      .toArray()
      .map((v) => this.vehicleOut(v.id));
  }

  getVehicle(id: string) {
    return guard(() => this.vehicleOut(id));
  }

  // ======================= trips =======================

  async createTrip(input: TripInput) {
    const res = guard(() => {
      this.routeRow(input.route);
      if (input.vehicle) this.vehicleRow(input.vehicle);
      const id = newId();
      const active = input.active ? 1 : 0;
      this.sql.exec(
        `INSERT INTO trips (id, vehicle_id, route_id, state, active, speed_kmh, stop_index, progress, stop_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        id,
        input.vehicle ?? null,
        input.route,
        active ? "STATIONARY" : "IDLE",
        active,
        input.speedKmh ?? DEFAULT_SPEED_KMH,
        active ? Date.now() : null,
        Date.now(),
      );
      return this.tripOut(this.tripRow(id));
    });
    if (res.ok && input.active) await this.ensureClockRunning();
    return res;
  }

  listTrips(activeOnly: boolean) {
    return this.sql
      .exec<TripRow>(`SELECT * FROM trips ${activeOnly ? "WHERE active = 1" : ""} ORDER BY created_at`)
      .toArray()
      .map((t) => this.tripOut(t));
  }

  getTrip(id: string) {
    return guard(() => {
      const trip = this.tripRow(id);
      return { ...this.tripOut(trip), route: this.routeOut(trip.route_id), vehicle: trip.vehicle_id ? this.vehicleOut(trip.vehicle_id) : null };
    });
  }

  /** (Re)start a trip from the first stop of its route. */
  async startTrip(id: string) {
    const res = guard(() => {
      const trip = this.tripRow(id);
      if (trip.active) throw conflict("Trip is already running.");
      this.sql.exec(
        "UPDATE trips SET active = 1, state = 'STATIONARY', stop_index = 0, progress = 0, stop_at = ? WHERE id = ?",
        Date.now(),
        id,
      );
      return this.tripOut(this.tripRow(id));
    });
    if (res.ok) await this.ensureClockRunning();
    return res;
  }

  // ======================= tickets =======================

  buyTicket(userId: string, input: TicketInput): Result<Ticket> {
    return guard(() => {
      const user = this.userRow(userId);
      if (user.ticket_id) throw conflict("You already have a ticket.");
      if (user.state !== "ATSTATION") throw conflict("You can only buy a ticket at a station.");
      if (input.from !== user.current_stop_id) throw badRequest("Tickets must start where you are.");

      const trip = this.tripRow(input.trip);
      const stops = this.routeStops(trip.route_id);
      const fromIdx = stops.findIndex((s) => s.id === input.from);
      const toIdx = stops.findIndex((s) => s.id === input.to);
      if (fromIdx === -1 || toIdx === -1) throw badRequest("This trip doesn't call at those stops.");
      if (toIdx <= fromIdx) throw badRequest("Incorrect order of stops.");
      if (trip.active && (trip.stop_index > fromIdx || (trip.stop_index === fromIdx && trip.state === "MOVING")))
        throw conflict("This train has already left your stop.");

      const km = stops.slice(fromIdx + 1, toIdx + 1).reduce((sum, s) => sum + s.km, 0);
      const ticket: TicketRow = {
        id: newId(),
        user_id: userId,
        trip_id: trip.id,
        from_stop_id: input.from,
        to_stop_id: input.to,
        desired_to_stop_id: null,
        price: Math.round(km * COST_PER_KM * 100) / 100,
        created_at: Date.now(),
      };
      // Already standing at the platform while the train waits? Board straight away.
      const boardNow = trip.active === 1 && trip.state === "STATIONARY" && trip.stop_index === fromIdx;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(
          `INSERT INTO tickets (id, user_id, trip_id, from_stop_id, to_stop_id, desired_to_stop_id, price, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ...Object.values(ticket),
        );
        this.sql.exec(
          "UPDATE users SET ticket_id = ?, state = ? WHERE id = ?",
          ticket.id,
          boardNow ? "ONBOARD" : "READYTOGO",
          userId,
        );
      });
      return ticketOut(ticket);
    });
  }

  /** Give up a ticket before boarding. */
  cancelTicket(userId: string): Result<{ cancelled: string }> {
    return guard(() => {
      const user = this.userRow(userId);
      if (!user.ticket_id) throw notFound("Ticket");
      if (user.state !== "READYTOGO") throw conflict("You can only cancel before boarding.");
      this.sql.exec("UPDATE users SET ticket_id = NULL, state = 'ATSTATION' WHERE id = ?", userId);
      return { cancelled: user.ticket_id };
    });
  }

  getTicket(id: string): Result<Ticket> {
    return guard(() => {
      const t = this.sql.exec<TicketRow>("SELECT * FROM tickets WHERE id = ?", id).toArray()[0];
      if (!t) throw notFound("Ticket");
      return ticketOut(t);
    });
  }

  // ======================= demo world =======================

  /**
   * Build the Lisbon → Vladivostok line, its interests, a train and a running trip.
   * Safe to run more than once: it reuses stops, the route and the vehicle if they exist,
   * and only starts a new trip if none is running on the line.
   */
  async seedDemo() {
    const res = guard(() => {
      const stopIds = SEED_STOPS.map((s) => {
        const existing = this.sql
          .exec<{ id: string }>("SELECT id FROM stops WHERE name = ? AND country = ?", s.name, s.country)
          .toArray()[0];
        if (existing) return existing.id;
        const created = this.createStop(s);
        if (!created.ok) throw badRequest(created.error);
        return created.data.id;
      });

      for (const name of SEED_INTERESTS) {
        const exists = this.sql.exec("SELECT 1 FROM interests WHERE name = ?", name).toArray().length;
        if (!exists) this.createInterest({ name });
      }

      let routeId = this.sql.exec<{ id: string }>("SELECT id FROM routes WHERE name = ?", SEED_LINE_NAME).toArray()[0]?.id;
      if (!routeId) {
        const r = this.createRoute({ name: SEED_LINE_NAME, stops: stopIds });
        if (!r.ok) throw badRequest(r.error);
        routeId = r.data.id;
      }

      let vehicleId = this.sql.exec<{ id: string }>("SELECT id FROM vehicles WHERE name = ?", "The Long Way").toArray()[0]?.id;
      if (!vehicleId) {
        const v = this.createVehicle({ name: "The Long Way" });
        if (!v.ok) throw badRequest(v.error);
        vehicleId = v.data.id;
      }

      const running = this.sql
        .exec<{ id: string }>("SELECT id FROM trips WHERE route_id = ? AND active = 1", routeId)
        .toArray()[0];
      return { routeId, vehicleId, runningTrip: running?.id ?? null, stops: stopIds.length };
    });
    if (!res.ok) return res;
    let tripId = res.data.runningTrip;
    if (!tripId) {
      const t = await this.createTrip({ route: res.data.routeId, vehicle: res.data.vehicleId, active: true });
      if (!t.ok) return t;
      tripId = t.data.id;
    }
    return { ok: true as const, data: { route: res.data.routeId, vehicle: res.data.vehicleId, trip: tripId, stops: res.data.stops } };
  }

  // ======================= users =======================

  createUser(input: NewUserInput) {
    return guard(() => {
      if (input.currentStop) this.stopRow(input.currentStop);
      else if ((input.role ?? USER_ROLES.PLAYER) !== USER_ROLES.ADMIN) throw badRequest("Players need a current stop.");
      const interests = input.interests ?? [];
      for (const i of interests) this.interestRow(i);
      const taken = this.sql
        .exec("SELECT 1 FROM users WHERE username = ? OR email = ?", input.username, input.email)
        .toArray().length;
      if (taken) throw conflict("Username or email is already registered.");

      const id = newId();
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(
          `INSERT INTO users (id, username, email, password_hash, role, state, current_stop_id, ticket_id, age, image, profile_mode, created_at)
           VALUES (?, ?, ?, ?, ?, 'ATSTATION', ?, NULL, ?, ?, ?, ?)`,
          id,
          input.username,
          input.email,
          input.passwordHash,
          input.role ?? USER_ROLES.PLAYER,
          input.currentStop ?? null,
          input.age,
          input.image ?? null,
          input.profileMode ?? "PUBLIC",
          Date.now(),
        );
        for (const i of new Set(interests))
          this.sql.exec("INSERT INTO user_interests (user_id, interest_id) VALUES (?, ?)", id, i);
      });
      return this.privateUserOut(this.userRow(id));
    });
  }

  /** For login only. The password hash leaves the Durable Object so the Worker can check it. */
  getCredentials(email: string) {
    const u = this.sql.exec<UserRow>("SELECT * FROM users WHERE email = ?", email).toArray()[0];
    return u ? { id: u.id, username: u.username, role: u.role, passwordHash: u.password_hash, user: this.privateUserOut(u) } : null;
  }

  countAdmins(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = ?", USER_ROLES.ADMIN).one().n;
  }

  /** Full record for yourself or an admin; a public profile for anyone else. */
  getUser(id: string, viewer: Viewer) {
    return guard(() => {
      const u = this.userRow(id);
      if (viewer.id === id || viewer.role === USER_ROLES.ADMIN) return this.privateUserOut(u);
      return this.publicUserOut(u);
    });
  }

  /**
   * People you might want to travel with: on your train if you're aboard, otherwise at your
   * stop. Ages are kept apart (under 18 only meets under 18). You need at least one interest
   * in common, and the score is the percentage overlap. Private profiles aren't listed.
   */
  getFellowUsers(userId: string) {
    return guard(() => {
      const me = this.userRow(userId);
      let candidates: UserRow[];
      if (me.state === "ONBOARD") {
        const tripId = this.sql.exec<{ trip_id: string }>("SELECT trip_id FROM tickets WHERE id = ?", me.ticket_id).one().trip_id;
        candidates = this.sql
          .exec<UserRow>(
            `SELECT u.* FROM users u JOIN tickets t ON t.id = u.ticket_id
             WHERE u.state = 'ONBOARD' AND t.trip_id = ? AND u.id != ? AND u.profile_mode = 'PUBLIC'`,
            tripId,
            userId,
          )
          .toArray();
      } else {
        candidates = this.sql
          .exec<UserRow>(
            `SELECT * FROM users WHERE current_stop_id = ? AND state IN ('ATSTATION', 'READYTOGO')
             AND id != ? AND profile_mode = 'PUBLIC'`,
            me.current_stop_id,
            userId,
          )
          .toArray();
      }

      const mine = new Set(this.interestIds(userId));
      const matches = [];
      for (const other of candidates) {
        if (me.age < 18 !== other.age < 18) continue;
        const theirs = this.interestIds(other.id);
        const shared = theirs.filter((i) => mine.has(i)).length;
        if (shared === 0) continue;
        matches.push({ user: this.publicUserOut(other), score: (shared * 200) / (mine.size + theirs.length) });
      }
      return matches.sort((a, b) => b.score - a.score);
    });
  }

  // ======================= interests =======================

  createInterest(input: { name: string; description?: string; image?: string }) {
    return guard(() => {
      const id = newId();
      this.sql.exec(
        "INSERT INTO interests (id, name, description, image, created_at) VALUES (?, ?, ?, ?, ?)",
        id,
        input.name,
        input.description ?? null,
        input.image ?? null,
        Date.now(),
      );
      return { id, name: input.name, description: input.description ?? null, image: input.image ?? null };
    });
  }

  listInterests() {
    return this.sql.exec("SELECT id, name, description, image FROM interests ORDER BY name").toArray();
  }

  // ======================= messaging =======================

  createConversation(userId: string, members: string[]) {
    return guard(() => {
      const all = [...new Set([userId, ...members])];
      if (all.length < 2) throw badRequest("A conversation needs someone else in it.");
      for (const m of all) this.userRow(m);
      const id = newId();
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("INSERT INTO conversations (id, created_at) VALUES (?, ?)", id, Date.now());
        for (const m of all) this.sql.exec("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", id, m);
      });
      return { id, members: all };
    });
  }

  postMessage(userId: string, conversationId: string, content: { title?: string; body: string }) {
    return guard(() => {
      this.assertMember(userId, conversationId);
      const msg = {
        id: newId(),
        conversation: conversationId,
        from: userId,
        content: { title: content.title ?? null, body: content.body },
        createdAt: Date.now(),
      };
      this.sql.exec(
        "INSERT INTO messages (id, conversation_id, from_user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        msg.id,
        conversationId,
        userId,
        msg.content.title,
        msg.content.body,
        msg.createdAt,
      );
      return msg;
    });
  }

  listMessages(userId: string, conversationId: string, limit = 50) {
    return guard(() => {
      this.assertMember(userId, conversationId);
      return this.sql
        .exec<{ id: string; from_user_id: string; title: string | null; body: string; created_at: number }>(
          "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
          conversationId,
          limit,
        )
        .toArray()
        .map((m) => ({ id: m.id, from: m.from_user_id, content: { title: m.title, body: m.body }, createdAt: m.created_at }));
    });
  }

  // ======================= internals =======================

  private one<T extends Record<string, SqlStorageValue>>(query: string, id: string, what: string): T {
    const row = this.sql.exec<T>(query, id).toArray()[0];
    if (!row) throw notFound(what);
    return row;
  }
  private stopRow = (id: string) => this.one<StopRow>("SELECT * FROM stops WHERE id = ?", id, "Stop");
  private routeRow = (id: string) => this.one<{ id: string; name: string }>("SELECT * FROM routes WHERE id = ?", id, "Route");
  private vehicleRow = (id: string) => this.one<{ id: string; name: string }>("SELECT * FROM vehicles WHERE id = ?", id, "Vehicle");
  private tripRow = (id: string) => this.one<TripRow>("SELECT * FROM trips WHERE id = ?", id, "Trip");
  private userRow = (id: string) => this.one<UserRow>("SELECT * FROM users WHERE id = ?", id, "User");
  private interestRow = (id: string) => this.one<{ id: string }>("SELECT id FROM interests WHERE id = ?", id, "Interest");

  private routeStops(routeId: string): RouteStopRow[] {
    return this.sql
      .exec<RouteStopRow>(
        `SELECT s.*, rs.position, rs.km FROM route_stops rs JOIN stops s ON s.id = rs.stop_id
         WHERE rs.route_id = ? ORDER BY rs.position`,
        routeId,
      )
      .toArray();
  }

  private interestIds(userId: string): string[] {
    return this.sql
      .exec<{ interest_id: string }>("SELECT interest_id FROM user_interests WHERE user_id = ?", userId)
      .toArray()
      .map((r) => r.interest_id);
  }

  private assertMember(userId: string, conversationId: string) {
    this.one("SELECT id FROM conversations WHERE id = ?", conversationId, "Conversation");
    const member = this.sql
      .exec("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, userId)
      .toArray().length;
    if (!member) throw forbidden("You're not in this conversation.");
  }

  /** Track km and time (ms) until `trip` reaches route position `pos`. */
  private remainingTo(trip: TripRow, stops: RouteStopRow[], pos: number): { km: number; ms: number } {
    let km = 0;
    let minutes = 0;
    if (trip.state === "STATIONARY") {
      if (trip.stop_index === pos) return { km: 0, ms: 0 };
      minutes += Math.max(0, stops[trip.stop_index]!.dwell_minutes - trip.progress);
    }
    for (let i = trip.stop_index + 1; i <= pos; i++) {
      const segment = stops[i]!.km - (i === trip.stop_index + 1 && trip.state === "MOVING" ? trip.progress : 0);
      km += segment;
      minutes += (segment / trip.speed_kmh) * 60;
      if (i < pos) minutes += stops[i]!.dwell_minutes;
    }
    return { km: Math.round(km * 10) / 10, ms: Math.round(minutes * 60_000) };
  }

  private routeOut(id: string) {
    const route = this.routeRow(id);
    const stops = this.routeStops(id);
    return {
      id: route.id,
      name: route.name,
      stops: stops.map((s) => ({ ...stopOut(s), kmFromPrevious: s.km })),
      totalKm: Math.round(stops.reduce((sum, s) => sum + s.km, 0) * 10) / 10,
    };
  }

  private vehicleOut(id: string) {
    const v = this.vehicleRow(id);
    const trips = this.sql
      .exec<{ id: string }>("SELECT id FROM trips WHERE vehicle_id = ? AND active = 1", id)
      .toArray()
      .map((t) => t.id);
    return { id: v.id, name: v.name, activeTrips: trips };
  }

  private tripOut(t: TripRow) {
    const stops = this.routeStops(t.route_id);
    const here = stops[t.stop_index]!;
    const next = stops[t.stop_index + 1];
    let position = { lat: here.lat, lng: here.lng };
    if (t.state === "MOVING" && next) {
      const f = Math.min(1, t.progress / next.km);
      let dLng = next.lng - here.lng;
      if (Math.abs(dLng) > 180) dLng -= Math.sign(dLng) * 360; // cross the antimeridian the short way
      let lng = here.lng + dLng * f;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      position = { lat: here.lat + (next.lat - here.lat) * f, lng };
    }
    const asOf = this.tripAsOf(t);
    return {
      id: t.id,
      route: t.route_id,
      vehicle: t.vehicle_id,
      state: t.state,
      active: t.active === 1,
      speedKmh: t.speed_kmh,
      currentStopIndex: t.stop_index,
      currentStop: here.id,
      nextStop: t.active && next ? next.id : null,
      nextStopArrival: t.active && next ? asOf + this.remainingTo(t, stops, t.stop_index + 1).ms : null,
      progress: t.progress,
      currentStopTimestamp: t.stop_at,
      /** The time `progress` and `position` describe. Clients extrapolate from here between ticks. */
      asOf,
      /** The stretch of track the train is on (or about to take), so clients can draw it moving. */
      segment: next
        ? { from: { lat: here.lat, lng: here.lng }, to: { lat: next.lat, lng: next.lng }, km: next.km }
        : null,
      position,
    };
  }

  private interestsOf(userId: string) {
    return this.sql
      .exec<{ id: string; name: string }>(
        "SELECT i.id, i.name FROM interests i JOIN user_interests ui ON ui.interest_id = i.id WHERE ui.user_id = ? ORDER BY i.name",
        userId,
      )
      .toArray();
  }

  private publicUserOut(u: UserRow) {
    const visible = u.profile_mode === "PUBLIC";
    return {
      id: u.id,
      username: u.username,
      image: u.image,
      interests: this.interestsOf(u.id),
      state: visible ? u.state : null,
      currentStop: visible ? u.current_stop_id : null,
    };
  }

  /** Your current ticket, its train, and arrival times along the way. */
  private journeyOf(u: UserRow) {
    if (!u.ticket_id) return null;
    const t = this.sql.exec<TicketRow>("SELECT * FROM tickets WHERE id = ?", u.ticket_id).toArray()[0];
    if (!t) return null;
    const trip = this.tripRow(t.trip_id);
    const stops = this.routeStops(trip.route_id);
    const route = this.routeRow(trip.route_id);
    const vehicle = trip.vehicle_id ? this.vehicleRow(trip.vehicle_id) : null;
    const asOf = this.tripAsOf(trip);
    const fromIdx = stops.findIndex((s) => s.id === t.from_stop_id);
    const destId = t.desired_to_stop_id ?? t.to_stop_id;
    const destIdx = stops.findIndex((s) => s.id === destId);

    const etaAt = (i: number) => {
      const passed = i < trip.stop_index || (i === trip.stop_index && trip.state !== "STATIONARY");
      if (passed || !trip.active) return null;
      return asOf + this.remainingTo(trip, stops, i).ms;
    };
    const timeline = stops.map((s, i) => ({
      ...stopOut(s),
      kmFromPrevious: s.km,
      eta: etaAt(i),
      passed: i < trip.stop_index || (i === trip.stop_index && trip.state === "MOVING"),
      current: i === trip.stop_index && trip.state === "STATIONARY",
    }));
    const kmToDest = destIdx > trip.stop_index ? this.remainingTo(trip, stops, destIdx).km : 0;
    const tripKm = Math.round(stops.slice(fromIdx + 1, destIdx + 1).reduce((sum, s) => sum + s.km, 0) * 10) / 10;

    return {
      ticket: ticketOut(t),
      line: route.name,
      train: vehicle?.name ?? null,
      trip: this.tripOut(trip),
      from: stopOut(stops[fromIdx]!),
      to: stopOut(stops[destIdx]!),
      fromIndex: fromIdx,
      toIndex: destIdx,
      boardAt: etaAt(fromIdx),
      arriveAt: etaAt(destIdx),
      /** How far the train still has to go to your destination (from wherever it is now). */
      kmToDestination: kmToDest,
      /** Your ride, boarding station to destination. */
      tripKm,
      stops: timeline,
    };
  }

  private privateUserOut(u: UserRow) {
    return {
      ...this.publicUserOut(u),
      journey: this.journeyOf(u),
      state: u.state,
      currentStop: u.current_stop_id,
      email: u.email,
      age: u.age,
      role: u.role,
      profileMode: u.profile_mode,
      ticket: u.ticket_id,
      createdAt: u.created_at,
    };
  }
}
