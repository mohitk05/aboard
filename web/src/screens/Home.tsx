import { useQuery } from "@tanstack/react-query";
import { ADMIN_ROLE, api, type Me, type Stop, type UserState } from "../api";
import { useLogout, useMe } from "../auth";
import { Board, Page } from "../ui";

const STATE_LABEL: Record<UserState, string> = {
  ATSTATION: "At the station",
  READYTOGO: "Waiting for your train",
  ONBOARD: "On board",
};

export function Home() {
  const me = useMe().data as Me;
  const logout = useLogout();
  const stop = useQuery({
    queryKey: ["stop", me.currentStop],
    queryFn: () => api<Stop>("GET", `/stop/${me.currentStop}`),
    enabled: !!me.currentStop,
  });

  const where = me.currentStop ? (stop.data ? `${stop.data.name}, ${stop.data.country}` : "…") : "Nowhere yet";

  return (
    <Page
      actions={
        <button className="btn btn-quiet" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Log out
        </button>
      }
    >
      <Board label={STATE_LABEL[me.state]} title={where} sub={`Traveller ${me.username}`} />
      <section className="card">
        <h1>Hello, {me.username}</h1>
        {me.role === ADMIN_ROLE ? (
          <p className="muted">
            You're an admin. The admin console for building stations, lines and trains comes next.
          </p>
        ) : (
          <p className="muted">
            The departures board and ticket window open here soon. Your place in the world is saved.
          </p>
        )}
        {me.interests.length > 0 && (
          <div className="chips" aria-label="Your interests">
            {me.interests.map((i) => (
              <span key={i.id} className="chip" aria-pressed="true">
                {i.name}
              </span>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
