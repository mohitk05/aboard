import type { Journey as JourneyData } from "../api";
import { formatClock, formatIn, formatKm } from "../lib/format";
import { kmAlong } from "../lib/motion";
import { useNow } from "../lib/useNow";
import { Map } from "../map/LazyMap";
import { Board } from "../ui";
import { useWorld } from "../world";

/** How far the train still has to go to `journey.to`, extrapolated between ticks. */
export function kmLeft(j: JourneyData, now: number): number {
  const sinceTick = kmAlong(j.trip, now) - (j.trip.state === "MOVING" ? j.trip.progress : 0);
  return Math.max(0, j.kmToDestination - sinceTick);
}

/** On the train: where you are, what's next, and when you'll arrive. */
export function Journey({ journey: j }: { journey: JourneyData }) {
  const now = useNow(15_000);
  const world = useWorld();
  const atStation = j.trip.state === "STATIONARY";
  const here = j.stops[j.trip.currentStopIndex];
  const next = j.stops.find((s, i) => i > j.trip.currentStopIndex && s.eta !== null);
  const left = kmLeft(j, now);
  const done = j.tripKm > 0 ? Math.min(1, Math.max(0, 1 - left / j.tripKm)) : 0;

  const title = atStation && here ? `At ${here.name}` : next ? `Next: ${next.name}` : `To ${j.to.name}`;
  const sub =
    atStation && here
      ? `Stopped for a while · ${j.to.name} ${j.arriveAt ? formatIn(j.arriveAt - now) : ""}`
      : next?.eta
        ? `${next.name} ${formatIn(next.eta - now)}`
        : "";

  return (
    <>
      <Board label={`On board · ${j.line}`} title={title} sub={sub} />

      <Map
        stops={world.stops}
        routes={world.routes}
        trips={world.trips.length ? world.trips : [j.trip]}
        highlightStops={[j.from.id, j.to.id]}
        followTrip={j.trip.id}
        center={j.trip.position}
        zoom={6}
        label="Map following your train"
      />

      <section className="card" aria-label="Your trip">
        <div className="trip-progress">
          <div className="trip-ends">
            <span>{j.from.name}</span>
            <span>{j.to.name}</span>
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-label={`Progress to ${j.to.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(done * 100)}
          >
            <span style={{ width: `${done * 100}%` }} />
          </div>
          <p className="muted small">
            {formatKm(left)} to go
            {j.arriveAt ? ` · arriving ${formatClock(j.arriveAt, now)} (${formatIn(j.arriveAt - now)})` : ""}
          </p>
        </div>

        <h2>Stops</h2>
        <ol className="timeline">
          {j.stops.map((s, i) => {
            const mine = i >= j.fromIndex && i <= j.toIndex;
            const cls = [
              s.passed ? "is-passed" : "",
              s.current ? "is-current" : "",
              i === j.toIndex ? "is-destination" : "",
              mine ? "" : "is-outside",
            ].join(" ");
            return (
              <li key={s.id} className={cls}>
                <span className="tl-name">
                  {s.name}
                  {i === j.toIndex && <span className="tag">Your stop</span>}
                </span>
                <span className="tl-time">
                  {s.current ? "Here now" : s.passed ? "Passed" : s.eta ? formatClock(s.eta, now) : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted small">You'll be set down at {j.to.name} automatically.</p>
      </section>
    </>
  );
}
