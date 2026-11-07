import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Stop } from "../api";
import { Map } from "../map/LazyMap";
import { formatKm } from "../lib/format";
import { Field, FormError } from "../ui";
import { useWorld, type Route, type Trip, type Vehicle } from "../world";
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

  return (
    <Shell>
      <section className="board" aria-label="Admin">
        <div className="board-label">Control room</div>
        <div className="board-title">
          {world.stops.length} stations · {world.routes.length} lines · {world.trips.length} trains running
        </div>
      </section>

      <WorldTools />

      <section className="card">
        <h2>Network</h2>
        <p className="muted small">Click the map to place a new station there.</p>
        <Map
          stops={world.stops}
          routes={world.routes}
          trips={world.trips}
          highlightStops={[]}
          onMapClick={setClicked}
          className="map-tall"
        />
      </section>

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
    <section className="card">
      <h2>World</h2>
      <div className="row">
        <button className="btn btn-primary" onClick={() => seed.mutate(undefined)} disabled={seed.isPending}>
          {seed.isPending ? "Laying track…" : "Seed Lisbon → Vladivostok"}
        </button>
        <button className="btn" onClick={() => tick.mutate(undefined)} disabled={tick.isPending}>
          Advance one tick (5 min)
        </button>
      </div>
      {seed.data && (
        <p className="muted small" role="status">
          The line has {seed.data.stops} stations and a train is running on it.
        </p>
      )}
      {tick.data && (
        <p className="muted small" role="status">
          Tick done: {tick.data.arrivals} arrivals, {tick.data.departures} departures, {tick.data.boarded} boarded,{" "}
          {tick.data.alighted} got off.
        </p>
      )}
      <FormError message={seed.error?.message ?? tick.error?.message} />
    </section>
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
    <form className="card form-wide" onSubmit={submit}>
      <h2>New station</h2>
      <div className="grid-2">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Country">
          <input required value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
        <Field label="Latitude">
          <input required type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => setLat(e.target.value)} />
        </Field>
        <Field label="Longitude">
          <input required type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => setLng(e.target.value)} />
        </Field>
        <Field label="Dwell (minutes)" hint="How long trains wait here. About 60 for big cities.">
          <input required type="number" min={1} max={1440} value={dwell} onChange={(e) => setDwell(e.target.value)} />
        </Field>
      </div>
      <FormError message={create.error?.message} />
      {create.isSuccess && <p className="muted small" role="status">Added {create.data.name}.</p>}
      <button className="btn btn-primary" disabled={create.isPending}>
        Add station
      </button>
    </form>
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
    <section className="card">
      <h2>Lines</h2>
      <ul className="list">
        {routes.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong>
            <span className="muted small">
              {r.stops.length} stations · {formatKm(r.totalKm)}
            </span>
          </li>
        ))}
        {!routes.length && <li className="muted">No lines yet.</li>}
      </ul>

      <form className="form-wide" onSubmit={submit}>
        <h3>New line</h3>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Stations, in order">
          <div className="row">
            <select value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">Choose a station</option>
              {stops
                .filter((s) => !picked.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}, {s.country}
                  </option>
                ))}
            </select>
            <button type="button" className="btn" disabled={!next} onClick={() => (setPicked([...picked, next]), setNext(""))}>
              Add
            </button>
          </div>
        </Field>
        {picked.length > 0 && (
          <ol className="list">
            {picked.map((id) => (
              <li key={id}>
                {byId.get(id)?.name}
                <button type="button" className="linklike" onClick={() => setPicked(picked.filter((p) => p !== id))}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
        <FormError message={create.error?.message ?? auto.error?.message} />
        <div className="row">
          <button className="btn btn-primary" disabled={create.isPending || picked.length < 2}>
            Create line
          </button>
          <button type="button" className="btn" onClick={() => auto.mutate(undefined)} disabled={auto.isPending || stops.length < 3}>
            Generate 3 random lines
          </button>
        </div>
      </form>
    </section>
  );
}

function Trains({ routes }: { routes: Route[] }) {
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => api<Vehicle[]>("GET", "/vehicle") });
  const trips = useQuery({ queryKey: ["trips", "all"], queryFn: () => api<Trip[]>("GET", "/trip") });
  const [vehicleName, setVehicleName] = useState("");
  const [route, setRoute] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [speed, setSpeed] = useState("60");
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["trips"] });

  const addVehicle = useWorldMutation((name: string) => api<Vehicle>("POST", "/vehicle", { vehicle: { name } }));
  const addTrip = useWorldMutation((trip: unknown) => api<Trip>("POST", "/trip", { trip }));
  const start = useWorldMutation((id: string) => api<Trip>("POST", `/trip/${id}/start`));
  const routeName = (id: string) => routes.find((r) => r.id === id)?.name ?? "Unknown line";

  return (
    <section className="card">
      <h2>Trains</h2>
      <ul className="list">
        {trips.data?.map((t) => (
          <li key={t.id}>
            <span>
              <strong>{routeName(t.route)}</strong>{" "}
              <span className="muted small">
                {t.active ? (t.state === "MOVING" ? "moving" : "at a station") : "not running"} · {t.speedKmh} km/h
              </span>
            </span>
            {!t.active && (
              <button className="linklike" onClick={() => start.mutate(t.id, { onSuccess: refresh })}>
                Start
              </button>
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
          <Field label="Line">
            <select required value={route} onChange={(e) => setRoute(e.target.value)}>
              <option value="">Choose a line</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Train (optional)">
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="">None</option>
              {vehicles.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Average speed (km/h)">
            <input type="number" min={1} max={400} value={speed} onChange={(e) => setSpeed(e.target.value)} />
          </Field>
        </div>
        <FormError message={addTrip.error?.message ?? start.error?.message} />
        <button className="btn btn-primary" disabled={addTrip.isPending || !route}>
          Start from the first station
        </button>
      </form>

      <form
        className="form-wide"
        onSubmit={(e) => {
          e.preventDefault();
          addVehicle.mutate(vehicleName.trim(), { onSuccess: () => setVehicleName("") });
        }}
      >
        <h3>Name a new train</h3>
        <div className="row">
          <input required aria-label="Train name" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
          <button className="btn" disabled={addVehicle.isPending}>
            Add train
          </button>
        </div>
        <FormError message={addVehicle.error?.message} />
      </form>
    </section>
  );
}
