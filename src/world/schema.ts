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
