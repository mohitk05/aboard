#!/usr/bin/env node
// Top up the timetable: make sure every line has trains running both ways, spread out along it,
// so busy stations always have departures in each direction.
//
// For every line and each direction (the line, and its return twin), it adds trains until there
// are PER_DIRECTION of them (LONG_PER_DIRECTION on lines longer than LONG_KM). New trains go where
// the gaps between existing trains are largest, run at the line's usual speed, and are named
// after the line's existing trains (Kranich-3, Kranich-4, …).
//
// Usage:
//   ADMIN_TOKEN=eyJ… node scripts/fill-trains.mjs              # live site
//   DRY_RUN=1 ADMIN_TOKEN=eyJ… node scripts/fill-trains.mjs    # print the plan, change nothing
//   BASE_URL=http://localhost:8787 ADMIN_TOKEN=… node scripts/fill-trains.mjs
// Safe to repeat: it only adds what's missing.

const BASE_URL = (process.env.BASE_URL ?? "https://aboard.karekar-mohit.workers.dev").replace(/\/$/, "");
const TOKEN = process.env.ADMIN_TOKEN;
const DRY = !!process.env.DRY_RUN;
const PER_DIRECTION = Number(process.env.PER_DIRECTION ?? 2);
const LONG_PER_DIRECTION = Number(process.env.LONG_PER_DIRECTION ?? 3);
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

let added = 0;
for (const line of lines.sort((a, b) => a.name.localeCompare(b.name))) {
  const onLine = trips.filter((t) => lineOf(t.route) === line.id);
  const speeds = onLine.map((t) => t.speedKmh);
  const speed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length / 10) * 10 : line.totalKm > LONG_KM ? 450 : 320;
  const family =
    (onLine.map((t) => /^(.*?)-\d+$/.exec(t.train ?? "")?.[1]).find(Boolean)) ??
    line.name.replace(/^Nexus-\d+:\s*/, "").split(/\s+/).at(-1);
  const target = line.totalKm > LONG_KM ? LONG_PER_DIRECTION : PER_DIRECTION;

  for (const routeId of [line.id, `${line.id}~r`]) {
    const route = byId.get(routeId);
    if (!route) continue;
    const cum = [];
    let km = 0;
    for (const s of route.stops) cum.push((km += s.kmFromPrevious));
    const total = cum.at(-1);
    // Where the trains already running this way are, in km from the start of this direction.
    const at = trips
      .filter((t) => t.route === routeId)
      .map((t) => cum[t.currentStopIndex] + (t.state === "MOVING" ? t.progress : 0));
    const label = `${line.name}${routeId.endsWith("~r") ? " (return)" : ""}`;
    if (at.length >= target) {
      console.log(`  ok    ${label}: ${at.length} trains`);
      continue;
    }
    while (at.length < target) {
      // The spot (from the start up to just before the last station) furthest from every train.
      let best = 0;
      let bestGap = -1;
      for (let f = 0; f <= 0.9; f += 0.01) {
        const p = f * total;
        const gap = at.length ? Math.min(...at.map((e) => Math.abs(e - p))) : f === 0 ? Infinity : 0;
        if (gap > bestGap) [best, bestGap] = [p, gap];
      }
      at.push(best);
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1] <= best) i++;
      const kmPast = Math.round((best - cum[i]) * 10) / 10;
      const name = nextName(family);
      const where = kmPast ? `${route.stops[i].name} → ${route.stops[i + 1].name}, ${Math.round(kmPast)} km out` : `waiting at ${route.stops[i].name}`;
      console.log(`  add   ${label}: ${name} at ${speed} km/h, ${where}`);
      added++;
      if (DRY) continue;
      const vehicle = await api("POST", "/vehicle", { vehicle: { name } });
      const trip = await api("POST", "/trip", { trip: { route: routeId, vehicle: vehicle.id, speedKmh: speed, active: true } });
      if (i > 0 || kmPast > 0) await api("POST", `/trip/${trip.id}/position`, { stopIndex: i, km: kmPast });
    }
  }
}
console.log(DRY ? `Dry run: would add ${added} trains.` : `Added ${added} trains to ${BASE_URL}.`);
