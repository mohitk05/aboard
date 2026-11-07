import { Board, ButtonLink, Card, Page } from "../ui";
import { useWorld } from "../world";
import { useWorldFocus } from "../world3d/focus";

export function Landing() {
  const world = useWorld();
  const running = world.trips.length;
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
        title="Lisbon → Vladivostok"
        sub="13,900 km · about 10 days"
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
