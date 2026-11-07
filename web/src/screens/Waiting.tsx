import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Journey } from "../api";
import { meKey } from "../auth";
import { formatClock, formatIn, formatKm, formatPrice } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Map } from "../map/LazyMap";
import { Board, FormError } from "../ui";
import { useWorld } from "../world";

/** Ticket in hand, waiting on the platform for the train. */
export function Waiting({ journey }: { journey: Journey }) {
  const now = useNow();
  const world = useWorld();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api("DELETE", "/ticket"),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });

  const boardingNow = journey.trip.state === "STATIONARY" && journey.trip.currentStopIndex === journey.fromIndex;
  const status = boardingNow
    ? "Your train is at the platform"
    : journey.boardAt
      ? `Your train arrives ${formatIn(journey.boardAt - now)}`
      : "Waiting for your train";

  return (
    <>
      <Board label="Your ticket" title={`${journey.from.name} → ${journey.to.name}`} sub={status} />

      <section className="card ticket" aria-label="Ticket details">
        <dl className="facts">
          <div>
            <dt>Line</dt>
            <dd>
              {journey.line}
              {journey.train ? ` · ${journey.train}` : ""}
            </dd>
          </div>
          <div>
            <dt>Train arrives here</dt>
            <dd>{journey.boardAt ? formatClock(journey.boardAt, now) : "—"}</dd>
          </div>
          <div>
            <dt>You arrive in {journey.to.name}</dt>
            <dd>{journey.arriveAt ? `${formatClock(journey.arriveAt, now)} (${formatIn(journey.arriveAt - now)})` : "—"}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>{formatKm(journey.tripKm)}</dd>
          </div>
          <div>
            <dt>Fare</dt>
            <dd>{formatPrice(journey.ticket.price)}</dd>
          </div>
        </dl>
        <p className="muted small">
          Stay at {journey.from.name}. You'll board automatically when the train pulls in.
        </p>
        {confirming ? (
          <div className="row">
            <button className="btn btn-danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Yes, cancel my ticket
            </button>
            <button className="btn btn-quiet" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button className="btn btn-quiet" onClick={() => setConfirming(true)}>
            Cancel ticket
          </button>
        )}
        <FormError message={cancel.error?.message} />
      </section>

      <Map
        stops={world.stops}
        routes={world.routes}
        trips={world.trips}
        highlightStops={[journey.from.id, journey.to.id]}
        followTrip={null}
        label={`Map of your trip from ${journey.from.name} to ${journey.to.name}`}
      />
    </>
  );
}
