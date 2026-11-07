import { useQuery } from "@tanstack/react-query";
import { ADMIN_ROLE, api, type Me, type Stop, type UserState } from "../api";
import { useMe } from "../auth";
import { Map } from "../map/LazyMap";
import { Board } from "../ui";
import { useWorld } from "../world";
import { Shell } from "./Shell";

const STATE_LABEL: Record<UserState, string> = {
  ATSTATION: "At the station",
  READYTOGO: "Waiting for your train",
  ONBOARD: "On board",
};

export function Home() {
  const me = useMe().data as Me;
  const world = useWorld();
  const stop = useQuery({
    queryKey: ["stop", me.currentStop],
    queryFn: () => api<Stop>("GET", `/stop/${me.currentStop}`),
    enabled: !!me.currentStop,
  });

  const where = me.currentStop ? (stop.data ? `${stop.data.name}, ${stop.data.country}` : "…") : "Nowhere yet";

  return (
    <Shell>
      <Board label={STATE_LABEL[me.state]} title={where} sub={`Traveller ${me.username}`} />
      <Map
        stops={world.stops}
        routes={world.routes}
        trips={world.trips}
        highlightStops={me.currentStop ? [me.currentStop] : []}
      />
      <section className="card">
        <h1>Hello, {me.username}</h1>
        {me.role === ADMIN_ROLE ? (
          <p className="muted">Build stations, lines and trains in the Admin tab.</p>
        ) : (
          <p className="muted">The departures board and ticket window open here soon.</p>
        )}
      </section>
    </Shell>
  );
}
