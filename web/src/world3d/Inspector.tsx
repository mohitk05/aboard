import { useEffect, useRef } from "react";
import { formatClock, formatDuration, formatIn, formatKm } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Button } from "../ui";
import { DEFAULT_SPEED_KMH, lineHours, useStationBoard, useStopPhoto, useWorld, type Route, type Trip } from "../world";
import { select, useSelection } from "./selection";

/** Details of whatever was clicked in the world: a train, a line or a station. */
export function Inspector() {
  const selection = useSelection();
  const world = useWorld();
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the panel when it opens; Escape closes it.
  useEffect(() => {
    if (!selection) return;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  if (!selection) return null;
  if (selection.kind === "stop") {
    if (!world.stops.some((s) => s.id === selection.id)) return null;
    return (
      <aside className="inspector card inspector-station" aria-labelledby="inspector-title" role="region">
        <StationDetails id={selection.id} headingRef={heading} />
      </aside>
    );
  }
  const trip = selection.kind === "train" ? world.trips.find((t) => t.id === selection.id) : undefined;
  const route =
    selection.kind === "route" ? world.routes.find((r) => r.id === selection.id) : world.routes.find((r) => r.id === trip?.route);
  if ((selection.kind === "train" && !trip) || !route) return null;

  return (
    <aside className="inspector card" aria-labelledby="inspector-title" role="region">
      <div className="inspector-head">
        <span className="inspector-kind">{selection.kind === "train" ? "Train" : "Line"}</span>
        <Button kind="quiet" small onClick={() => select(null)} aria-label="Close details">
          Close
        </Button>
      </div>
      {trip ? (
        <TrainDetails trip={trip} route={route} headingRef={heading} />
      ) : (
        <RouteDetails route={route} trips={world.trips.filter((t) => t.route === route.id)} headingRef={heading} />
      )}
    </aside>
  );
}

function TrainDetails({ trip, route, headingRef }: { trip: Trip; route: Route; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const now = useNow(15_000);
  const terminus = route.stops.at(-1)!;
  const moving = trip.state === "MOVING";
  const status = !trip.active ? "Not running" : moving ? `On the way to ${trip.nextStopName}` : `Stopped at ${trip.lastStop}`;
  return (
    <>
      <h2 id="inspector-title" tabIndex={-1} ref={headingRef}>
        {trip.train ?? "Train"} <span className="muted">to {terminus.name}</span>
      </h2>
      <dl className="facts">
        <div>
          <dt>Line</dt>
          <dd>{trip.line}</dd>
        </div>
        <div>
          <dt>Now</dt>
          <dd>{status}</dd>
        </div>
        {trip.nextStopArrival && trip.nextStopName && (
          <div>
            <dt>{moving ? `Arrives in ${trip.nextStopName}` : "Leaves for"}</dt>
            <dd>
              {moving ? `${formatClock(trip.nextStopArrival, now)} (${formatIn(trip.nextStopArrival - now)})` : trip.nextStopName}
            </dd>
          </div>
        )}
        <div>
          <dt>Speed</dt>
          <dd>{moving ? `${trip.speedKmh} km/h` : "Standing"}</dd>
        </div>
        <div>
          <dt>Journey</dt>
          <dd>
            {route.stops[0]!.name} → {terminus.name}, {formatKm(route.totalKm)}
          </dd>
        </div>
      </dl>
      <button className="linklike" onClick={() => select({ kind: "route", id: route.id })}>
        See the whole line
      </button>
    </>
  );
}

function RouteDetails({ route, trips, headingRef }: { route: Route; trips: Trip[]; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  let km = 0;
  const hours = lineHours(route, trips, DEFAULT_SPEED_KMH);
  return (
    <>
      <h2 id="inspector-title" tabIndex={-1} ref={headingRef}>
        {route.name}
      </h2>
      <p className="muted">
        {route.stops.length} stations · {formatKm(route.totalKm)} · {formatDuration(hours)} end to end · {trips.length ? `${trips.length} ${trips.length === 1 ? "train" : "trains"} running` : "no trains running"}
      </p>
      <ol className="timeline">
        {route.stops.map((s) => {
          km += s.kmFromPrevious;
          return (
            <li key={s.id}>
              <button className="linklike tl-name" onClick={() => select({ kind: "stop", id: s.id })}>
                {s.name}
              </button>
              <span className="tl-time muted">{formatKm(km)}</span>
            </li>
          );
        })}
      </ol>
      {trips.length > 0 && (
        <ul className="list">
          {trips.map((t) => (
            <li key={t.id}>
              <button className="linklike" onClick={() => select({ kind: "train", id: t.id })}>
                {t.train ?? "Train"}
              </button>
              <span className="muted small">{t.state === "MOVING" ? `towards ${t.nextStopName}` : `at ${t.lastStop}`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A station: a photo of the place, then its arrivals and departures. */
function StationDetails({ id, headingRef }: { id: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const world = useWorld();
  const stop = world.stops.find((s) => s.id === id)!;
  const board = useStationBoard(id);
  const photo = useStopPhoto(id);
  const now = useNow(15_000);
  const arrivals = board.data?.arrivals ?? [];
  const departures = board.data?.departures ?? [];
  const lines = world.routes.filter((r) => r.stops.some((s) => s.id === id));
  const trainLabel = (train: string | null, line: string) => `${train ?? "Train"} · ${line}`;

  return (
    <>
      <figure className="station-photo">
        {photo.data ? (
          <img
            src={photo.data.url}
            width={photo.data.width}
            height={photo.data.height}
            alt={`${photo.data.title}, near ${stop.name}`}
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className={`station-photo-empty${photo.isPending ? " pulse" : ""}`} aria-hidden="true" />
        )}
        <div className="station-photo-head">
          <span className="inspector-kind">Station</span>
          <Button kind="quiet" small onClick={() => select(null)} aria-label="Close details">
            Close
          </Button>
        </div>
        {photo.data && (
          <figcaption>
            <a href={photo.data.page} target="_blank" rel="noreferrer">
              {photo.data.title}
            </a>
            {" · "}
            <a href={photo.data.source} target="_blank" rel="noreferrer">
              {[photo.data.credit, photo.data.license].filter(Boolean).join(", ") || "Wikimedia Commons"}
            </a>
          </figcaption>
        )}
      </figure>
      <div className="station-body">
        <h2 id="inspector-title" tabIndex={-1} ref={headingRef}>
          {stop.name}
        </h2>
        <p className="muted small">
          {stop.country} · {lines.length ? lines.map((l) => l.name).join(", ") : "No lines call here yet"}
        </p>

        <div>
          <h3>Arrivals</h3>
          {board.isPending ? (
            <p className="muted small pulse">Reading the board…</p>
          ) : arrivals.length === 0 ? (
            <p className="muted small">No trains on their way here.</p>
          ) : (
            <ul className="station-board">
              {arrivals.map((a) => (
                <li key={a.trip}>
                  <span className="sb-time">{a.arrived ? "Here" : formatClock(a.arrivalTime, now)}</span>
                  <span className="sb-main">
                    <button className="linklike" onClick={() => select({ kind: "train", id: a.trip })}>
                      From {a.from}
                    </button>
                    <span className="muted small">
                      {trainLabel(a.train, a.line)} · {a.terminates ? "Terminates here" : `via ${a.previous}`}
                    </span>
                  </span>
                  <span className={`sb-status${a.arrived ? " is-boarding" : ""}`}>
                    {a.arrived ? "At platform" : formatIn(a.arrivalTime - now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>Departures</h3>
          {board.isPending ? null : departures.length === 0 ? (
            <p className="muted small">No departures scheduled.</p>
          ) : (
            <ul className="station-board">
              {departures.map((d) => (
                <li key={d.trip}>
                  <span className="sb-time">{formatClock(d.departureTime, now)}</span>
                  <span className="sb-main">
                    <button className="linklike" onClick={() => select({ kind: "train", id: d.trip })}>
                      To {d.to}
                    </button>
                    <span className="muted small">
                      {trainLabel(d.train, d.line)} · next {d.next}
                    </span>
                  </span>
                  <span className={`sb-status${d.boarding ? " is-boarding" : ""}`}>
                    {d.boarding ? "Boarding" : formatIn(d.departureTime - now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
