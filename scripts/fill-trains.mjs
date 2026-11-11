#!/usr/bin/env node
// Top up the timetable so every station gets busy several times a day, in both directions.
//
// A line and its return twin are one loop: out to the end, a pause while the train turns around,
// and back. For each line this works out how long the loop takes (moving at the line's speed and
// waiting out each station's dwell, in the world's 5-minute ticks, like src/world/world.ts) and
// where each of its trains is in it. Then, leaving the existing trains where they are, it adds a
// train in the middle of the biggest gap until no two trains are more than MAX_GAP_HOURS apart.
// A station then sees a train in each direction at least that often. New trains run at the
// line's speed and are named after its existing trains (Kranich-3, Kranich-4, …).
//
// Usage:
//   ADMIN_TOKEN=eyJ… node scripts/fill-trains.mjs              # live site
//   DRY_RUN=1 ADMIN_TOKEN=eyJ… node scripts/fill-trains.mjs    # print the plan, change nothing
//   MAX_GAP_HOURS=8 ADMIN_TOKEN=eyJ… node scripts/fill-trains.mjs
//   BASE_URL=http://localhost:8787 ADMIN_TOKEN=… node scripts/fill-trains.mjs
// Safe to repeat: it only adds what's missing.

const BASE_URL = (process.env.BASE_URL ?? "https://aboard.karekar-mohit.workers.dev").replace(/\/$/, "");
const TOKEN = process.env.ADMIN_TOKEN;
const DRY = !!process.env.DRY_RUN;
const MAX_GAP_HOURS = Number(process.env.MAX_GAP_HOURS ?? 12);
const TICK_MIN = 5; // WORLD_INTERVAL_MINUTES
const LONG_KM = 15_000;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN (an admin's token from POST /api/user/login).");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error(`${method} ${path}: ${json.error ?? res.status}`);
  return json.data;
}

const routes = await api("GET", "/route");
const trips = await api("GET", "/trip?active=1");
const byId = new Map(routes.map((r) => [r.id, r]));
const lines = routes.filter((r) => !r.returnOf);
const lineOf = (routeId) => routeId.replace(/~r$/, "");

// Train names: "Kranich-2" → family "Kranich", number 2. Track the highest number per family.
const highest = new Map();
for (const t of trips) {
  const m = /^(.*?)-(\d+)$/.exec(t.train ?? "");
  if (m) highest.set(m[1], Math.max(highest.get(m[1]) ?? 0, Number(m[2])));
}
const nextName = (family) => {
  const n = (highest.get(family) ?? 0) + 1;
  highest.set(family, n);
  return `${family}-${n}`;
};

const ticks = (amount, perTick) => Math.ceil(amount / perTick - 1e-9);

/**
 * One trip round the loop, as the world clock runs it: wait at the first station, then for each
 * station move there and wait out its dwell; at the end, turn around onto the return twin and
 * wait again before heading back. Each step: { route, stopIndex, moving, ticks, kmPerTick }.
 */
function loopOf(line, speed) {
  const kmPerTick = (speed * TICK_MIN) / 60;
  const steps = [];
  for (const route of [line, byId.get(`${line.id}~r`)]) {
    route.stops.forEach((s, i) => {
      if (i > 0) steps.push({ route: route.id, stopIndex: i - 1, moving: true, ticks: ticks(s.kmFromPrevious, kmPerTick), kmPerTick });
      steps.push({ route: route.id, stopIndex: i, moving: false, ticks: ticks(s.dwellMinutes, TICK_MIN), kmPerTick });
    });
  }
  return steps;
}

/** Where a running train is in its loop, in ticks from leaving the first station. */
function phaseOf(trip, steps) {
  let at = 0;
  for (const s of steps) {
    if (s.route === trip.route && s.stopIndex === trip.currentStopIndex && s.moving === (trip.state === "MOVING")) {
      const done = s.moving ? Math.floor(trip.progress / s.kmPerTick) : Math.floor(trip.progress / TICK_MIN);
      return at + Math.min(s.ticks - 1, done);
    }
    at += s.ticks;
  }
  return null;
}

/** The place in the loop `phase` ticks in: a route, a station index and km past it. */
function placeAt(phase, steps) {
  for (const s of steps) {
    if (phase < s.ticks) return { route: s.route, stopIndex: s.stopIndex, km: s.moving ? Math.round(phase * s.kmPerTick * 10) / 10 : 0 };
    phase -= s.ticks;
  }
  throw new Error("phase outside the loop");
}

const hours = (t) => (t * TICK_MIN) / 60;
let added = 0;
for (const line of lines.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!byId.get(`${line.id}~r`)) continue;
  const onLine = trips.filter((t) => lineOf(t.route) === line.id);
  // A line's trains share a speed (the most common one), so the gaps between them stay put.
  const counts = new Map();
  for (const t of onLine) counts.set(t.speedKmh, (counts.get(t.speedKmh) ?? 0) + 1);
  const speed = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (line.totalKm > LONG_KM ? 450 : 320);
  const family =
    (onLine.map((t) => /^(.*?)-\d+$/.exec(t.train ?? "")?.[1]).find(Boolean)) ??
    line.name.replace(/^Nexus-\d+:\s*/, "").split(/\s+/).at(-1);

  const steps = loopOf(line, speed);
  const length = steps.reduce((n, s) => n + s.ticks, 0);
  const phases = onLine.map((t) => phaseOf(t, steps)).filter((p) => p !== null);
  const gaps = () => {
    const p = [...phases].sort((a, b) => a - b);
    return p.map((x, i) => ({ from: x, ticks: (i + 1 < p.length ? p[i + 1] : p[0] + length) - x }));
  };
  const widest = () => (phases.length ? gaps().sort((a, b) => b.ticks - a.ticks)[0] : { from: 0, ticks: length });
  const before = hours(widest().ticks);

  const plan = [];
  if (!phases.length) phases.push(0), plan.push(0);
  while (hours(widest().ticks) > MAX_GAP_HOURS) {
    const g = widest();
    const phase = (g.from + Math.floor(g.ticks / 2)) % length;
    phases.push(phase);
    plan.push(phase);
  }
  const label = `${line.name} (${Math.round(hours(length))} h round trip, ${onLine.length} trains)`;
  if (!plan.length) {
    console.log(`  ok    ${label}: longest gap ${before.toFixed(1)} h`);
    continue;
  }
  console.log(`  add   ${label}: ${plan.length} more, longest gap ${before.toFixed(1)} h -> ${hours(widest().ticks).toFixed(1)} h`);
  for (const phase of plan) {
    const at = placeAt(phase, steps);
    const route = byId.get(at.route);
    const name = nextName(family);
    const where = at.km ? `${route.stops[at.stopIndex].name} -> ${route.stops[at.stopIndex + 1].name}, ${Math.round(at.km)} km out` : `at ${route.stops[at.stopIndex].name}`;
    console.log(`          ${name}${at.route.endsWith("~r") ? " (return)" : ""}: ${where}`);
    added++;
    if (DRY) continue;
    const vehicle = await api("POST", "/vehicle", { vehicle: { name } });
    const trip = await api("POST", "/trip", { trip: { route: at.route, vehicle: vehicle.id, speedKmh: speed, active: true } });
    if (at.stopIndex > 0 || at.km > 0) await api("POST", `/trip/${trip.id}/position`, { stopIndex: at.stopIndex, km: at.km });
  }
}
console.log(DRY ? `Dry run: would add ${added} trains.` : `Added ${added} trains to ${BASE_URL}.`);
