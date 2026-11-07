import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Departure, type Me, type Stop } from "../api";
import { meKey } from "../auth";
import { clockParts, formatClock, formatIn, formatKm, formatPrice } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Map } from "../map/LazyMap";
import { Board, FormError } from "../ui";
import { useWorld } from "../world";

/** At a station with no ticket: what's coming, and where you could go. */
export function Station({ me, stop }: { me: Me; stop: Stop | undefined }) {
  const world = useWorld();
  const departures = useQuery({
    queryKey: ["departures", me.currentStop],
    queryFn: () => api<Departure[]>("GET", `/stop/${me.currentStop}/departures`),
    enabled: !!me.currentStop,
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <Board
        label="At the station"
        title={stop ? `${stop.name}, ${stop.country}` : "…"}
        sub={`Traveller ${me.username}`}
      />

      <section className="card" aria-labelledby="departures-title" role="region">
        <h2 id="departures-title">Departures</h2>
        {departures.isPending && <p className="muted">Reading the board…</p>}
        <FormError message={departures.error?.message} />
        {departures.data && !departures.data.length && (
          <p className="muted">
            No trains are due here right now. Trains run on the lines shown on the map, and new ones start from the
            first station of each line.
          </p>
        )}
        <ul className="departures">
          {departures.data?.map((d) => (
            <DepartureRow
              key={d.trip.id}
              d={d}
              from={me.currentStop!}
              open={open === d.trip.id}
              onToggle={() => setOpen(open === d.trip.id ? null : d.trip.id)}
            />
          ))}
        </ul>
      </section>

      <Map
        stops={world.stops}
        routes={world.routes}
        trips={world.trips}
        highlightStops={me.currentStop ? [me.currentStop] : []}
        center={stop?.coordinates}
        zoom={stop ? 4 : undefined}
        label={`Map around ${stop?.name ?? "your station"}`}
      />
    </>
  );
}

function DepartureRow({ d, from, open, onToggle }: { d: Departure; from: string; open: boolean; onToggle: () => void }) {
  const now = useNow();
  const qc = useQueryClient();
  const buy = useMutation({
    mutationFn: (to: string) => api("POST", "/ticket/buy", { ticket: { trip: d.trip.id, from, to } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
  const panel = `dest-${d.trip.id}`;

  return (
    <li className={open ? "is-open" : undefined}>
      <button className="departure" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <DepTime at={d.boardingNow ? null : d.arrivalTime} now={now} />
        <span className="dep-dest">
          <strong>{d.terminus.name}</strong>
          <span className="muted small">
            {d.line}
            {d.train ? ` · ${d.train}` : ""}
          </span>
        </span>
        <span className={`dep-status ${d.boardingNow ? "is-boarding" : ""}`}>
          {d.boardingNow ? `Boarding · leaves ${formatIn(d.departureTime - now)}` : formatIn(d.arrivalTime - now)}
        </span>
      </button>

      {open && (
        <div id={panel} className="ticket-window">
          <h3>Where to?</h3>
          <ul className="list">
            {d.destinations.map((x) => (
              <li key={x.stop.id}>
                <span>
                  <strong>{x.stop.name}</strong>
                  <span className="muted small">
                    {" "}
                    · arrives {formatClock(x.arrivalTime, now)} ({formatIn(x.arrivalTime - now)}) · {formatKm(x.km)}
                  </span>
                </span>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => buy.mutate(x.stop.id)}
                  disabled={buy.isPending}
                  aria-label={`Buy a ticket to ${x.stop.name} for ${formatPrice(x.price)}`}
                >
                  {formatPrice(x.price)}
                </button>
              </li>
            ))}
          </ul>
          <FormError message={buy.error?.message} />
        </div>
      )}
    </li>
  );
}

function DepTime({ at, now }: { at: number | null; now: number }) {
  if (at === null) return <span className="dep-time">Now</span>;
  const { day, time } = clockParts(at, now);
  return (
    <span className="dep-time">
      {day && <span className="dep-day">{day}</span>}
      <span>{time}</span>
    </span>
  );
}
