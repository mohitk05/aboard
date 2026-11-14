/**
 * SQLite schema for the World Durable Object.
 * Append new migrations to the end of the list. Never edit one that has shipped.
 * The applied version is stored in the _schema table.
 */
export const MIGRATIONS: string[] = [
  /* 1: initial port from MongoDB */ `
  CREATE TABLE stops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    dwell_minutes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Ordered stops on a route. km = track distance from the previous stop (0 for the first).
  CREATE TABLE route_stops (
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    stop_id TEXT NOT NULL REFERENCES stops(id),
    km REAL NOT NULL,
    PRIMARY KEY (route_id, position)
  );
  CREATE INDEX route_stops_by_stop ON route_stops(stop_id);

  CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT REFERENCES vehicles(id),
    route_id TEXT NOT NULL REFERENCES routes(id),
    state TEXT NOT NULL,                 -- MOVING | STATIONARY | IDLE
    active INTEGER NOT NULL,
    speed_kmh REAL NOT NULL,
    stop_index INTEGER NOT NULL,         -- last stop reached
    progress REAL NOT NULL,              -- km since stop_index while MOVING; minutes waited while STATIONARY
    stop_at INTEGER,                     -- ms timestamp of arrival at / departure from stop_index
    created_at INTEGER NOT NULL
  );
  CREATE INDEX trips_active ON trips(active);

  CREATE TABLE interests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role INTEGER NOT NULL,
    state TEXT NOT NULL,                 -- ATSTATION | READYTOGO | ONBOARD
    current_stop_id TEXT REFERENCES stops(id),
    ticket_id TEXT,
    age INTEGER,
    image TEXT,
    profile_mode TEXT NOT NULL DEFAULT 'PUBLIC',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX users_by_stop ON users(current_stop_id, state);
  CREATE INDEX users_with_ticket ON users(ticket_id) WHERE ticket_id IS NOT NULL;

  CREATE TABLE user_interests (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interest_id TEXT NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, interest_id)
  );

  CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    trip_id TEXT NOT NULL REFERENCES trips(id),
    from_stop_id TEXT NOT NULL REFERENCES stops(id),
    to_stop_id TEXT NOT NULL REFERENCES stops(id),
    desired_to_stop_id TEXT REFERENCES stops(id),
    price REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX tickets_by_trip ON tickets(trip_id);

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE conversation_members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE INDEX conversation_members_by_user ON conversation_members(user_id);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_by_conversation ON messages(conversation_id, created_at);
  `,

  /* 2: world clock bookkeeping */ `
  CREATE TABLE world_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  /* 3: web push */ `
  CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX push_subscriptions_by_user ON push_subscriptions(user_id);

  -- Notifications that must only go out once (e.g. "your train is near").
  CREATE TABLE push_log (
    key TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  `,

  /* 4: lines run both ways, and the industry game */ `
  -- Every line has a return twin: the same stations in reverse. Trains turn around at the end
  -- of the line onto the twin, so they shuttle back and forth for ever. The twin's id is the
  -- line's id + '~r'; return_of points back at the line.
  ALTER TABLE routes ADD COLUMN return_of TEXT REFERENCES routes(id) ON DELETE CASCADE;
  INSERT INTO routes (id, name, created_at, return_of) SELECT id || '~r', name, created_at, id FROM routes;
  -- Reversed stops: position q is the original position n-1-q, and its km (from the previous
  -- station) is the original km of the station after it.
  INSERT INTO route_stops (route_id, position, stop_id, km)
    SELECT rs.route_id || '~r', c.n - 1 - rs.position, rs.stop_id,
           COALESCE((SELECT nx.km FROM route_stops nx WHERE nx.route_id = rs.route_id AND nx.position = rs.position + 1), 0)
    FROM route_stops rs
    JOIN (SELECT route_id, COUNT(*) AS n FROM route_stops GROUP BY route_id) c ON c.route_id = rs.route_id;
  -- Trains that already reached the end of their line turn around and run again.
  UPDATE trips SET route_id = route_id || '~r', stop_index = 0, progress = 0, state = 'STATIONARY', active = 1,
                   stop_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE state = 'IDLE' AND active = 0 AND stop_index > 0;

  -- Money (credits). Everyone starts with some; fares and goods cost credits.
  ALTER TABLE users ADD COLUMN balance REAL NOT NULL DEFAULT 5000;

  -- Goods you own: carried with you ('cargo') or stored in your warehouse at home ('base').
  CREATE TABLE holdings (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place TEXT NOT NULL CHECK (place IN ('cargo', 'base')),
    good TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty >= 0),
    PRIMARY KEY (user_id, place, good)
  );

  -- Your factories at home: one per industry. A batch runs from batch_started_at to batch_ready_at.
  CREATE TABLE factories (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    industry TEXT NOT NULL,
    built_at INTEGER NOT NULL,
    batch_started_at INTEGER,
    batch_ready_at INTEGER,
    batches INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, industry)
  );

  -- What happened to your money and goods, newest first.
  CREATE TABLE ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT NOT NULL
  );
  CREATE INDEX ledger_by_user ON ledger(user_id, at);
  `,

  /* 5: invite-only signup */ `
  -- Signup needs an invite. An admin makes one (optionally noting who it's for); it works once,
  -- until it expires or is revoked.
  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    note TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_at INTEGER,
    revoked_at INTEGER
  );
  `,
  /* 6: indexes for reading less (Cloudflare bills a Durable Object's SQLite by rows read) */ `
  -- A station's boards find its lines first (route_stops_by_stop), then each line's trains.
  CREATE INDEX trips_by_route ON trips(route_id, active);
  CREATE INDEX trips_by_vehicle ON trips(vehicle_id, active);
  `,
  /* 7: retire interests */ `
  -- An inactive interest isn't offered any more (GET /interest leaves it out), but travellers who
  -- already picked it keep it. Admins switch it with PATCH /interest/:id.
  ALTER TABLE interests ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
  `,
  /* 8: markets that react, and the leaderboard */ `
  -- How much of a good has recently been traded at a station's market: buying raises the price,
  -- selling lowers it. The load fades by half every MARKET_HALF_LIFE_HOURS (src/game/catalog.ts),
  -- worked out when it's read, so the tick doesn't have to touch it. at = when load was stored.
  CREATE TABLE market_load (
    stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    good TEXT NOT NULL,
    load REAL NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (stop_id, good)
  );
  -- The weekly leaderboard sums everyone's trading since Monday.
  CREATE INDEX ledger_by_time ON ledger(at);
  `,
];

export function migrate(storage: DurableObjectStorage): void {
  const sql = storage.sql;
  sql.exec("CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)");
  const row = sql.exec<{ version: number }>("SELECT version FROM _schema").toArray()[0];
  const current = row?.version ?? 0;
  if (!row) sql.exec("INSERT INTO _schema (version) VALUES (0)");
  for (let v = current; v < MIGRATIONS.length; v++) {
    storage.transactionSync(() => {
      sql.exec(MIGRATIONS[v]!);
      sql.exec("UPDATE _schema SET version = ?", v + 1);
    });
  }
}
