import { formatKm } from "../lib/format";
import { Board, ButtonLink, Card, Page } from "../ui";
import { useWorld } from "../world";
import { useWorldFocus } from "../world3d/focus";

export function Landing() {
  const world = useWorld();
  const running = world.trips.length;
  // The longest line in the world, as a taste of how far you can go.
  const longest = [...world.routes].sort((a, b) => b.totalKm - a.totalKm)[0];
  useWorldFocus({ label: "Trains running right now", distance: 3.2 });
  return (
    <Page
      actions={
        <ButtonLink to="/login" kind="quiet">
          Log in
        </ButtonLink>
      }
    >
      <Board
        label={running ? `${running} ${running === 1 ? "train" : "trains"} running now` : "Now boarding"}
        title={longest ? `${longest.stops[0]!.name} → ${longest.stops.at(-1)!.name}` : "The line is being laid"}
        sub={longest ? `${formatKm(longest.totalKm)} · about ${Math.max(1, Math.round(longest.totalKm / 60 / 24))} days` : undefined}
      />
      <Card className="hero">
        <h1>A slow journey across the world, in real time.</h1>
        <p className="lede">
          Trains on Aboard run at the pace of real trains. Buy a ticket, board when your train pulls in, and
          check in when it reaches a station. Meet the people in your carriage along the way.
        </p>
        <div className="row">
          <ButtonLink to="/signup" kind="primary">
            Get a ticket
          </ButtonLink>
          <ButtonLink to="/login">I already travel with Aboard</ButtonLink>
        </div>
      </Card>
    </Page>
  );
}
