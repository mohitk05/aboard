import { Link } from "react-router";
import { Map } from "../map/LazyMap";
import { Board, Page } from "../ui";
import { useWorld } from "../world";

export function Landing() {
  const world = useWorld();
  const running = world.trips.length;
  return (
    <Page
      actions={
        <Link to="/login" className="btn btn-quiet">
          Log in
        </Link>
      }
    >
      <Board
        label={running ? `${running} ${running === 1 ? "train" : "trains"} running now` : "Now boarding"}
        title="Lisbon → Vladivostok"
        sub="13,900 km · about 10 days"
      />
      <Map stops={world.stops} routes={world.routes} trips={world.trips} label="Trains running right now" />
      <section className="hero">
        <h1>A slow journey across the world, in real time.</h1>
        <p className="lede">
          Trains on Aboard run at the pace of real trains. Buy a ticket, board when your train pulls in, and
          check in when it reaches a station. Meet the people in your carriage along the way.
        </p>
        <div className="row">
          <Link to="/signup" className="btn btn-primary">
            Get a ticket
          </Link>
          <Link to="/login" className="btn">
            I already travel with Aboard
          </Link>
        </div>
      </section>
    </Page>
  );
}
