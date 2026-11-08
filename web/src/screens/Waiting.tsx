import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Journey } from "../api";
import { meKey } from "../auth";
import { formatClock, formatIn, formatKm, formatPrice } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Board, Button, Card, FormError } from "../ui";
import { useWorldFocus } from "../world3d/focus";
import { NotifyNudge } from "./Notify";

/** Ticket in hand, waiting on the platform for the train. */
export function Waiting({ journey }: { journey: Journey }) {
  const now = useNow();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  useWorldFocus({
    label: `Map of your trip from ${journey.from.name} to ${journey.to.name}`,
    highlight: [journey.from.id, journey.to.id],
    labels: journey.stops.slice(journey.fromIndex, journey.toIndex + 1).map((s) => s.id),
    center: journey.from.coordinates,
    distance: 2.4,
  });
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
      <NotifyNudge about="Get a notification when your train is near." />

      <Card className="ticket" aria-label="Ticket details" role="region">
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
            <Button kind="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Yes, cancel my ticket
            </Button>
            <Button kind="quiet" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)}>Cancel ticket</Button>
        )}
        <FormError message={cancel.error?.message} />
      </Card>
    </>
  );
}
