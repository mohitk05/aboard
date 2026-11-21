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
    labels: j.stops.slice(j.fromIndex, j.toIndex + 1).map((s) => s.id),
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
          <TripRail done={done} moving={!atStation} label={`Progress to ${j.to.name}`} />
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

/**
 * The trip as a line from where you boarded to your stop, with your train on it: a sleek
 * high-speed set, nose towards your stop. It glides to where it should be between updates, and
 * while it's moving, speed lines stream behind it and it rocks gently on the track.
 */
function TripRail({ done, moving, label }: { done: number; moving: boolean; label: string }) {
  const pct = Math.round(done * 1000) / 10;
  return (
    <div className={`rail${moving ? " is-moving" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span className="rail-pin rail-pin-from" aria-hidden="true" />
      <span className="rail-track" aria-hidden="true">
        <span className="rail-done" style={{ width: `${pct}%` }} />
        {/* Its nose at the point reached, but never hanging off the start of the line. */}
        <span className="rail-train" style={{ left: `clamp(72px, ${pct}%, 100%)` }}>
          <span className="rail-speed" />
          <TrainSide />
        </span>
      </span>
      <span className="rail-pin rail-pin-to" aria-hidden="true" />
    </div>
  );
}

/** A high-speed train from the side, facing right: a long nose, a band of windows, a pantograph. */
function TrainSide() {
  return (
    <svg className="rail-train-art" viewBox="0 0 96 22" width="72" height="17" aria-hidden="true">
      {/* pantograph */}
      <path d="M30 4 L36 0.8 L42 4" fill="none" stroke="currentColor" strokeWidth="1" />
      {/* body: flat back, roof, then the long sloping nose */}
      <path d="M2 5 H62 C74 5 84 8 94 14.5 Q95.5 15.6 94 16.6 L91 17.5 H2 Z" fill="currentColor" />
      {/* windows, and the cab's windscreen */}
      <rect x="6" y="8" width="11" height="3" rx="1" fill="var(--bg)" />
      <rect x="20" y="8" width="11" height="3" rx="1" fill="var(--bg)" />
      <rect x="34" y="8" width="11" height="3" rx="1" fill="var(--bg)" />
      <rect x="48" y="8" width="11" height="3" rx="1" fill="var(--bg)" />
      <path d="M66 7.6 C73 7.8 79 9.6 84 12.4 H70 Z" fill="var(--bg)" />
      {/* a line along the side */}
      <rect x="2" y="13.4" width="80" height="0.9" fill="var(--bg)" opacity="0.55" />
      {/* bogies */}
      <rect x="8" y="17.5" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.7" />
      <rect x="66" y="17.5" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
