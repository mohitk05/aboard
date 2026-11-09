import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Stop } from "../api";
import { formatKm } from "../lib/format";
import { Button, Card, FormError, Notice, SelectField, TextField } from "../ui";
import { DEFAULT_SPEED_KMH, lineId, useWorld, type Route, type Trip, type Vehicle } from "../world";
import { useWorldFocus } from "../world3d/focus";
import { select } from "../world3d/selection";
import { Shell } from "./Shell";

/** Refresh everything world-shaped after an admin change. */
function useWorldMutation<I, O>(fn: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of [["stops"], ["routes"], ["trips"], ["vehicles"], ["interests"]]) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function Admin() {
  const world = useWorld();
  const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>(null);
  useWorldFocus({ label: "Map of the network. Click the globe to place a new station.", onMapClick: setClicked, distance: 3 });

  return (
    <Shell>
      <section className="board" aria-label="Admin">
        <div className="board-label">Control room</div>
        <div className="board-title">
          {world.stops.length} stations · {world.routes.length} lines · {world.trips.length} trains running
        </div>
      </section>

      <Invites />
      <WorldTools />

      <Card>
        <h2>Network</h2>
        <p className="muted small">Click the globe to place a new station there{clicked ? ` (picked ${clicked.lat.toFixed(2)}, ${clicked.lng.toFixed(2)})` : ""}.</p>
      </Card>

      <StopForm at={clicked} />
      <RouteBuilder stops={world.stops} routes={world.routes} />
      <Trains routes={world.routes} />
    </Shell>
  );
}

function WorldTools() {
  const seed = useWorldMutation(() => api<{ trip: string; stops: number }>("POST", "/admin/seed"));
  const tick = useWorldMutation(() => api<Record<string, number>>("POST", "/admin/tick"));
  return (
    <Card className="form-wide">
      <h2>World</h2>
      <div className="row">
        <Button kind="primary" onClick={() => seed.mutate(undefined)} disabled={seed.isPending}>
          {seed.isPending ? "Laying track…" : "Seed Lisbon → Vladivostok"}
        </Button>
        <Button onClick={() => tick.mutate(undefined)} disabled={tick.isPending}>
          Advance one tick (5 min)
        </Button>
      </div>
      {seed.data && <Notice tone="successful">The line has {seed.data.stops} stations and a train is running on it.</Notice>}
      {tick.data && (
        <Notice tone="successful">
          Tick done: {tick.data.arrivals} arrivals, {tick.data.departures} departures, {tick.data.boarded} boarded,{" "}
          {tick.data.alighted} got off.
        </Notice>
      )}
      <FormError message={seed.error?.message ?? tick.error?.message} />
    </Card>
  );
}

function StopForm({ at }: { at: { lat: number; lng: number } | null }) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [dwell, setDwell] = useState("20");
  const [lastAt, setLastAt] = useState(at);
  if (at !== lastAt) {
    setLastAt(at);
    if (at) {
      setLat(at.lat.toFixed(4));
      setLng(at.lng.toFixed(4));
    }
  }
  const create = useWorldMutation((stop: unknown) => api<Stop>("POST", "/stop", { stop }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), country: country.trim(), coordinates: { lat: Number(lat), lng: Number(lng) }, dwellMinutes: Number(dwell) },
      { onSuccess: () => (setName(""), setCountry("")) },
    );
  };

  return (
    <Card>
      <form className="form-wide" onSubmit={submit}>
        <h2>New station</h2>
        <div className="grid-2">
          <TextField label="Name" required value={name} onValue={setName} />
          <TextField label="Country" required value={country} onValue={setCountry} />
          <TextField label="Latitude" type="number" step="any" min={-90} max={90} required value={lat} onValue={setLat} />
          <TextField label="Longitude" type="number" step="any" min={-180} max={180} required value={lng} onValue={setLng} />
          <TextField
            label="Dwell (minutes)"
            hint="How long trains wait here. About 60 for big cities."
            type="number"
            min={1}
            max={1440}
            required
            value={dwell}
            onValue={setDwell}
          />
        </div>
        <FormError message={create.error?.message} />
        {create.isSuccess && <Notice tone="successful">Added {create.data.name}.</Notice>}
        <Button kind="primary" type="submit" disabled={create.isPending}>
          Add station
        </Button>
      </form>
    </Card>
  );
}

function RouteBuilder({ stops, routes }: { stops: Stop[]; routes: Route[] }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [next, setNext] = useState("");
  const create = useWorldMutation((route: unknown) => api<Route>("POST", "/route", { route }));
  const auto = useWorldMutation(() => api<Route[]>("POST", "/route/autogenerate", { config: { count: 3 } }));
  const byId = new globalThis.Map(stops.map((s) => [s.id, s]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ name: name.trim(), stops: picked }, { onSuccess: () => (setName(""), setPicked([])) });
  };

  return (
    <Card>
      <h2>Lines</h2>
      <ul className="list">
        {routes.map((r) => (
          <li key={r.id}>
            <button className="linklike" onClick={() => select({ kind: "route", id: r.id })}>
              <strong>{r.name}</strong>
            </button>
            <span className="muted small">
              {r.stops.length} stations · {formatKm(r.totalKm)}
            </span>
          </li>
        ))}
        {!routes.length && <li className="muted">No lines yet.</li>}
      </ul>

      <form className="form-wide" onSubmit={submit}>
        <h3>New line</h3>
        <TextField label="Name" required value={name} onValue={setName} />
        <div className="row row-end">
          <SelectField label="Stations, in order" value={next} onValue={setNext}>
            <option value="">Choose a station</option>
            {stops
              .filter((s) => !picked.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.country}
                </option>
              ))}
          </SelectField>
          <Button disabled={!next} onClick={() => (setPicked([...picked, next]), setNext(""))}>
            Add
          </Button>
        </div>
        {picked.length > 0 && (
          <ol className="list">
            {picked.map((id) => (
              <li key={id}>
                {byId.get(id)?.name}
                <Button kind="quiet" small onClick={() => setPicked(picked.filter((p) => p !== id))}>
                  Remove
                </Button>
              </li>
            ))}
          </ol>
        )}
        <FormError message={create.error?.message ?? auto.error?.message} />
        <div className="row">
          <Button kind="primary" type="submit" disabled={create.isPending || picked.length < 2}>
            Create line
          </Button>
          <Button onClick={() => auto.mutate(undefined)} disabled={auto.isPending || stops.length < 3}>
            Generate 3 random lines
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Trains({ routes }: { routes: Route[] }) {
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => api<Vehicle[]>("GET", "/vehicle") });
  const trips = useQuery({ queryKey: ["trips", "all"], queryFn: () => api<Trip[]>("GET", "/trip") });
  const [vehicleName, setVehicleName] = useState("");
  const [route, setRoute] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [speed, setSpeed] = useState(String(DEFAULT_SPEED_KMH));
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["trips"] });

  const addVehicle = useWorldMutation((name: string) => api<Vehicle>("POST", "/vehicle", { vehicle: { name } }));
  const addTrip = useWorldMutation((trip: unknown) => api<Trip>("POST", "/trip", { trip }));
  const start = useWorldMutation((id: string) => api<Trip>("POST", `/trip/${id}/start`));
  const setTripSpeed = useWorldMutation(({ id, speedKmh }: { id: string; speedKmh: number }) =>
    api<Trip>("PATCH", `/trip/${id}`, { trip: { speedKmh } }),
  );
  const routeName = (id: string) => routes.find((r) => r.id === lineId(id))?.name ?? "Unknown line";

  return (
    <Card>
      <h2>Trains</h2>
      <ul className="list">
        {trips.data?.map((t) => (
          <li key={t.id}>
            <span>
              <strong>{t.train ?? routeName(t.route)}</strong>{" "}
              <span className="muted small">
                {routeName(t.route)} · {t.active ? (t.state === "MOVING" ? "moving" : "at a station") : "not running"}
              </span>
            </span>
            <SpeedForm
              trip={t}
              pending={setTripSpeed.isPending}
              onSave={(speedKmh) => setTripSpeed.mutate({ id: t.id, speedKmh }, { onSuccess: refresh })}
            />
            {!t.active && (
              <Button kind="quiet" small onClick={() => start.mutate(t.id, { onSuccess: refresh })}>
                Start
              </Button>
            )}
          </li>
        ))}
        {trips.data && !trips.data.length && <li className="muted">No trips yet.</li>}
      </ul>

      <form
        className="form-wide"
        onSubmit={(e) => {
          e.preventDefault();
          addTrip.mutate(
            { route, vehicle: vehicle || undefined, speedKmh: Number(speed), active: true },
            { onSuccess: refresh },
          );
        }}
      >
        <h3>Run a train</h3>
        <div className="grid-2">
          <SelectField label="Line" required value={route} onValue={setRoute}>
            <option value="">Choose a line</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Train (optional)" value={vehicle} onValue={setVehicle}>
            <option value="">None</option>
            {vehicles.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Average speed (km/h)"
            hint="Including slow sections. High-speed lines ~300, maglev ~450, sleepers ~160."
            type="number"
            min={40}
            max={600}
            value={speed}
            onValue={setSpeed}
          />
        </div>
        <FormError message={addTrip.error?.message ?? start.error?.message ?? setTripSpeed.error?.message} />
        <Button kind="primary" type="submit" disabled={addTrip.isPending || !route}>
          Start from the first station
        </Button>
      </form>

      <form
        className="form-wide"
        onSubmit={(e) => {
          e.preventDefault();
          addVehicle.mutate(vehicleName.trim(), { onSuccess: () => setVehicleName("") });
        }}
      >
        <h3>Name a new train</h3>
        <div className="row row-end">
          <TextField label="Train name" required value={vehicleName} onValue={setVehicleName} />
          <Button type="submit" disabled={addVehicle.isPending}>
            Add train
          </Button>
        </div>
        <FormError message={addVehicle.error?.message} />
      </form>
    </Card>
  );
}

/** Inline speed editor for one train. */
function SpeedForm({ trip, pending, onSave }: { trip: Trip; pending: boolean; onSave: (kmh: number) => void }) {
  const [value, setValue] = useState(String(trip.speedKmh));
  return (
    <form
      className="row speed-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Number(value));
      }}
    >
      <label className="sr-only" htmlFor={`speed-${trip.id}`}>
        Speed of {trip.train ?? "this train"} in km/h
      </label>
      <input
        id={`speed-${trip.id}`}
        className="input input-small"
        type="number"
        min={40}
        max={600}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="muted small">km/h</span>
      <Button small type="submit" disabled={pending || Number(value) === trip.speedKmh}>
        Set
      </Button>
    </form>
  );
}

interface Invite {
  code: string;
  note: string | null;
  status: "open" | "used" | "expired" | "revoked";
  createdAt: number;
  expiresAt: number | null;
  usedAt: number | null;
  usedBy: { id: string; username: string } | null;
}

const inviteLink = (code: string) => `${window.location.origin}/signup?invite=${code}`;
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Aboard is invite-only: make a one-time signup link, share it, see who joined. */
function Invites() {
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ["invites"], queryFn: () => api<Invite[]>("GET", "/admin/invites") });
  const [note, setNote] = useState("");
  const [days, setDays] = useState("30");
  const [copied, setCopied] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api<Invite>("POST", "/admin/invites", { invite: { note: note.trim() || undefined, days: days ? Number(days) : undefined } }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (code: string) => api<Invite>("DELETE", `/admin/invites/${code}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(code);
    } catch {
      setCopied(null);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const fresh = create.data;

  return (
    <Card aria-labelledby="invites-title" role="region">
      <h2 id="invites-title">Invites</h2>
      <p className="muted small">Aboard is invite-only. Each link lets one person sign up.</p>
      <form className="form" onSubmit={submit}>
        <TextField label="Who's it for?" hint="Optional. Only admins see this; it greets them on the signup page." maxLength={120} value={note} onValue={setNote} />
        <SelectField label="Expires" value={days} onValue={setDays}>
          <option value="7">In 7 days</option>
          <option value="30">In 30 days</option>
          <option value="90">In 90 days</option>
          <option value="">Never</option>
        </SelectField>
        <Button kind="primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Making…" : "Create invite link"}
        </Button>
        <FormError message={create.error?.message} />
      </form>
      {fresh && (
        <Notice tone="successful">
          <span className="invite-link">{inviteLink(fresh.code)}</span>{" "}
          <Button small kind="secondary" onClick={() => copy(fresh.code)}>
            {copied === fresh.code ? "Copied" : "Copy link"}
          </Button>
        </Notice>
      )}

      <h3>All invites</h3>
      <FormError message={invites.error?.message ?? revoke.error?.message} />
      {invites.data && !invites.data.length && <p className="muted small">No invites yet.</p>}
      <ul className="list invite-list">
        {invites.data?.map((inv) => (
          <li key={inv.code}>
            <span className="invite-main">
              <strong>{inv.note ?? "No note"}</strong>
              <span className="muted small">
                <code>{inv.code}</code> ·{" "}
                {inv.status === "used" && inv.usedBy
                  ? `used by ${inv.usedBy.username} on ${day(inv.usedAt!)}`
                  : inv.status === "open"
                    ? inv.expiresAt
                      ? `open until ${day(inv.expiresAt)}`
                      : "open, never expires"
                    : inv.status}
              </span>
            </span>
            {inv.status === "open" && (
              <span className="row">
                <Button small kind="quiet" onClick={() => copy(inv.code)} aria-label={`Copy link for ${inv.note ?? inv.code}`}>
                  {copied === inv.code ? "Copied" : "Copy"}
                </Button>
                <Button small kind="danger" onClick={() => revoke.mutate(inv.code)} disabled={revoke.isPending} aria-label={`Revoke ${inv.note ?? inv.code}`}>
                  Revoke
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
