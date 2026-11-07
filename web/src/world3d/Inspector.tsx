import { useEffect, useRef } from "react";
import { formatClock, formatDuration, formatIn, formatKm } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Button } from "../ui";
import { DEFAULT_SPEED_KMH, lineHours, useWorld, type Route, type Trip } from "../world";
import { select, useSelection } from "./selection";

/** Details of whatever was clicked in the world: a train or a line. */
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
              <span className="tl-name">{s.name}</span>
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
