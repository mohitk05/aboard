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
  /* 9: bots */ `
  -- Players the World runs itself (src/game/bot.ts). bot_next_at: when a bot next looks at what
  -- to do (null: on the next tick). bot_note: what it's up to, for admins.
  ALTER TABLE users ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN bot_next_at INTEGER;
  ALTER TABLE users ADD COLUMN bot_note TEXT;
  `,
  /* 10: hidden prices, the telegraph, and contracts */ `
  -- What each player last saw at each market (prices elsewhere are hidden: you see them live only
  -- where you are, and at home). price = the next unit's price when seen.
  CREATE TABLE price_seen (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    good TEXT NOT NULL,
    price REAL NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, stop_id, good)
  );

  -- The telegraph: public, vague news of big price moves ("cocoa getting dearer at Dakar").
  -- One row per station, good and direction; a newer move just updates its time.
  CREATE TABLE market_news (
    stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    good TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
    at INTEGER NOT NULL,
    PRIMARY KEY (stop_id, good, direction)
  );
  CREATE INDEX market_news_by_time ON market_news(at);

  -- The contracts board (src/game/contracts.ts, src/machines/contract.ts): a station wants qty of
  -- a good by expires_at, at price credits each, from whoever delivers it all first.
  CREATE TABLE contracts (
    id TEXT PRIMARY KEY,
    tier TEXT NOT NULL,
    stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    good TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    delivered_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    delivered_at INTEGER
  );
  CREATE INDEX contracts_open ON contracts(delivered_at, expires_at);
  `,
  /* 11: orders between players */ `
  -- A player's order on the contracts board (src/machines/order.ts): side 'buy' holds the credits
  -- for what's left (remaining × price), 'sell' holds the goods. Others fill it a part at a time,
  -- between Berlin warehouses. returned_at: when what wasn't filled went back (cancel or expiry).
  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    good TEXT NOT NULL,
    qty INTEGER NOT NULL,
    remaining INTEGER NOT NULL CHECK (remaining >= 0),
    price REAL NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    cancelled_at INTEGER,
    returned_at INTEGER
  );
  CREATE INDEX orders_by_user ON orders(user_id, created_at);
  CREATE INDEX orders_open ON orders(returned_at, expires_at);
  `,
  /* 12: travel records, for badges */ `
  -- Places you've been to (stood at: started, got off, or bought a ticket from; not passed through),
  -- the lines you've ridden (a line and its return twin are one line), and how far you've ridden.
  CREATE TABLE visits (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    first_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, stop_id)
  );
  CREATE TABLE rides (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    line_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    first_at INTEGER NOT NULL,
    times INTEGER NOT NULL,
    PRIMARY KEY (user_id, line_id)
  );
  ALTER TABLE users ADD COLUMN km_travelled REAL NOT NULL DEFAULT 0;

  -- History, from the tickets kept so far. A ticket was ridden if the next place its player was
  -- seen (their next ticket's start, or where they are now if they no longer hold it) isn't where
  -- it started: a cancelled ticket or a missed train leaves them where they were. The fare is
  -- 0.01 credits a km, so the km ridden is the fare × 100.
  CREATE TABLE _journeys AS
    SELECT t.user_id, t.from_stop_id, t.created_at, t.price, COALESCE(r.return_of, r.id) AS line_id,
           COALESCE(LEAD(t.from_stop_id) OVER (PARTITION BY t.user_id ORDER BY t.created_at, t.id),
                    CASE WHEN u.ticket_id IS NULL OR u.ticket_id != t.id THEN u.current_stop_id END) AS got_to
    FROM tickets t
    JOIN users u ON u.id = t.user_id
    JOIN trips tr ON tr.id = t.trip_id
    JOIN routes r ON r.id = tr.route_id;
  DELETE FROM _journeys WHERE got_to IS NULL OR got_to = from_stop_id;

  INSERT INTO rides (user_id, line_id, first_at, times)
    SELECT user_id, line_id, MIN(created_at), COUNT(*) FROM _journeys GROUP BY user_id, line_id;
  UPDATE users SET km_travelled = COALESCE((SELECT ROUND(SUM(price) * 100) FROM _journeys j WHERE j.user_id = users.id), 0);
  INSERT INTO visits (user_id, stop_id, first_at)
    SELECT user_id, stop_id, MIN(at) FROM (
      SELECT user_id, from_stop_id AS stop_id, created_at AS at FROM tickets
      UNION ALL SELECT user_id, got_to, created_at FROM _journeys
      UNION ALL SELECT id, current_stop_id, created_at FROM users WHERE current_stop_id IS NOT NULL AND ticket_id IS NULL
    ) WHERE stop_id IN (SELECT id FROM stops) GROUP BY user_id, stop_id;
  DROP TABLE _journeys;
  `,
  /* 13: trains' progress is worked out, not written every tick */ `
  -- Writing every running train's progress on every tick was ~90% of all rows written. Now a
  -- train's progress is stored as of a tick (progress_tick), and only rewritten when it arrives,
  -- departs, turns round or is moved; in between, trips_now works it out from how many ticks have
  -- passed (world_meta tick_count): each tick a moving train covers speed × 5 minutes of track, and
  -- a standing one waits 5 more minutes. Read trains from trips_now; write to trips.
  ALTER TABLE trips ADD COLUMN progress_tick INTEGER NOT NULL DEFAULT 0;
  INSERT INTO world_meta (key, value) VALUES ('tick_count', '0') ON CONFLICT (key) DO NOTHING;
  CREATE VIEW trips_now AS
    SELECT id, vehicle_id, route_id, state, active, speed_kmh, stop_index,
           progress + MAX(0, (SELECT CAST(value AS INTEGER) FROM world_meta WHERE key = 'tick_count') - progress_tick)
             * (CASE state WHEN 'MOVING' THEN speed_kmh * 5.0 / 60 WHEN 'STATIONARY' THEN 5.0 ELSE 0 END) AS progress,
           stop_at, created_at, progress_tick
    FROM trips;
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
