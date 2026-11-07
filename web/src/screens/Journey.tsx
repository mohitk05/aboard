import type { Journey as JourneyData } from "../api";
import { formatClock, formatIn, formatKm } from "../lib/format";
import { kmAlong } from "../lib/motion";
import { useNow } from "../lib/useNow";
import { Badge, Board, Button, Card } from "../ui";
import { select } from "../world3d/selection";
import { useWorldFocus } from "../world3d/focus";
import { NotifyNudge } from "./Notify";

/** How far the train still has to go to `journey.to`, extrapolated between ticks. */
export function kmLeft(j: JourneyData, now: number): number {
  const sinceTick = kmAlong(j.trip, now) - (j.trip.state === "MOVING" ? j.trip.progress : 0);
  return Math.max(0, j.kmToDestination - sinceTick);
}

/** On the train: where you are, what's next, and when you'll arrive. */
export function Journey({ journey: j }: { journey: JourneyData }) {
  const now = useNow(15_000);
  useWorldFocus({
    label: "Map following your train",
    highlight: [j.from.id, j.to.id],
    follow: j.trip.id,
    distance: 2.1,
  });
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
      <NotifyNudge about={`Get a notification before ${j.to.name}.`} />

      <Card aria-label="Your trip" role="region">
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
                  {i === j.toIndex && <Badge>Your stop</Badge>}
                </span>
                <span className="tl-time">
                  {s.current ? "Here now" : s.passed ? "Passed" : s.eta ? formatClock(s.eta, now) : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted small">You'll be set down at {j.to.name} automatically.</p>
        <div className="row">
          <Button small onClick={() => select({ kind: "train", id: j.trip.id })}>
            Train details
          </Button>
          <Button small kind="quiet" onClick={() => select({ kind: "route", id: j.trip.route })}>
            Line details
          </Button>
        </div>
      </Card>
    </>
  );
}
