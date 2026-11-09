import { formatDuration, formatKm } from "../lib/format";
import { Board, ButtonLink, Card, Page } from "../ui";
import { DEFAULT_SPEED_KMH, lineHours, useWorld } from "../world";
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
        <div className="row">
          <ButtonLink to="/story" kind="quiet">
            Story
          </ButtonLink>
          <ButtonLink to="/login" kind="quiet">
            Log in
          </ButtonLink>
        </div>
      }
    >
      <Board
        label={running ? `${running} ${running === 1 ? "train" : "trains"} running now` : "Now boarding"}
        title={longest ? `${longest.stops[0]!.name} → ${longest.stops.at(-1)!.name}` : "The line is being laid"}
        sub={longest ? `${formatKm(longest.totalKm)} · ${formatDuration(lineHours(longest, world.trips, DEFAULT_SPEED_KMH))}` : undefined}
      />
      <Card className="hero">
        <h1>Build an industry from Berlin, one train at a time.</h1>
        <p className="lede">
          There are no planes and no ships, only railways, and they run in real time. Ride out for cocoa, lithium or
          polysilicon, bring it home to Berlin, build your factory and sell what you make across the world.
        </p>
        <div className="row">
          <ButtonLink to="/signup" kind="primary">
            I have an invite
          </ButtonLink>
          <ButtonLink to="/login">I already travel with Aboard</ButtonLink>
        </div>
      </Card>
    </Page>
  );
}
