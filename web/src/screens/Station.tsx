import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, type Departure, type Me, type Stop } from "../api";
import { meKey } from "../auth";
import { clockParts, formatClock, formatIn, formatKm, formatPrice } from "../lib/format";
import { grantedCoords } from "../lib/location";
import { useNow } from "../lib/useNow";
import { Board, Button, ButtonLink, Card, FormError, SelectField } from "../ui";
import { MarketCard } from "./Business";
import { useWorld } from "../world";
import { useWorldFocus } from "../world3d/focus";
import { select } from "../world3d/selection";

/** At a station with no ticket: what's coming, and where you could go. */
export function Station({ me, stop }: { me: Me; stop: Stop | undefined }) {
  if (!me.currentStop) return <ChooseStation me={me} />;
  return <AtStation me={me} stop={stop} />;
}

/**
 * Not at any station yet (e.g. a new admin account): we place you at the station nearest to
 * you straight away. If that isn't possible, you pick one.
 */
function ChooseStation({ me }: { me: Me }) {
  const world = useWorld();
  const qc = useQueryClient();
  const [stop, setStop] = useState("");
  const picked = world.stops.find((s) => s.id === stop);
  useWorldFocus({
    label: "Map of stations. Click one to start there.",
    highlight: stop ? [stop] : [],
    center: picked?.coordinates ?? null,
    onStopClick: setStop,
  });
  const choose = useMutation({
    mutationFn: () => api<Me>("PATCH", "/user/me", { user: { currentStop: stop } }),
    onSuccess: (m) => qc.setQueryData(meKey, m),
  });
  const locate = useMutation({
    mutationFn: async () => api<Me>("POST", "/user/me/locate", { near: (await grantedCoords()) ?? undefined }),
    onSuccess: (m) => qc.setQueryData(meKey, m),
  });
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    locate.mutate();
  }, [locate]);

  if (!locate.isError) {
    return <Board label="Not at a station yet" title="Finding the station nearest to you…" sub={`Traveller ${me.username}`} />;
  }
  return (
    <>
      <Board label="Not at a station yet" title="Where do you start?" sub={`Traveller ${me.username}`} />
      <Card>
        <form
          className="form-wide"
          onSubmit={(e) => {
            e.preventDefault();
            choose.mutate();
          }}
        >
          <div className="row row-end">
            <SelectField label="Starting station" required value={stop} onValue={setStop}>
              <option value="" disabled>
                {world.stops.length ? "Choose a station" : "No stations yet"}
              </option>
              {world.stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.country}
                </option>
              ))}
            </SelectField>
            <Button kind="primary" type="submit" disabled={!stop || choose.isPending}>
              Start here
            </Button>
          </div>
          <FormError message={choose.error?.message} />
        </form>
      </Card>
    </>
  );
}

function AtStation({ me, stop }: { me: Me; stop: Stop | undefined }) {
  useWorldFocus({
    label: `Map around ${stop?.name ?? "your station"}`,
    highlight: me.currentStop ? [me.currentStop] : [],
    center: stop?.coordinates ?? null,
    distance: 2.2,
  });
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
      {stop && (
        <div className="row">
          <Button small kind="secondary" onClick={() => select({ kind: "stop", id: stop.id })}>
            Station details
          </Button>
          <ButtonLink to="/business">Your business</ButtonLink>
        </div>
      )}
      {stop && <MarketCard stopId={stop.id} />}

      <Card aria-labelledby="departures-title" role="region">
        <h2 id="departures-title">Departures</h2>
        {departures.isLoading && <p className="muted">Reading the board…</p>}
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
      </Card>
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
                <Button
                  kind="primary"
                  small
                  onClick={() => buy.mutate(x.stop.id)}
                  disabled={buy.isPending}
                  aria-label={`Buy a ticket to ${x.stop.name} for ${formatPrice(x.price)}`}
                >
                  {formatPrice(x.price)}
                </Button>
              </li>
            ))}
          </ul>
          <FormError message={buy.error?.message} />
          <div className="row">
            <Button small kind="quiet" onClick={() => select({ kind: "train", id: d.trip.id })}>
              Train details
            </Button>
            <Button small kind="quiet" onClick={() => select({ kind: "route", id: d.trip.route })}>
              Line details
            </Button>
          </div>
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
