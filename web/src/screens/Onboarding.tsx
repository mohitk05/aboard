import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Departure, type Me, type Stop } from "../api";
import { meKey, useMe } from "../auth";
import { STARTING_BALANCE } from "../../../src/game/catalog";
import { useCatalog } from "../game";
import { formatClock, formatIn } from "../lib/format";
import { Icon, type IconName } from "../lib/icons";
import { useNow } from "../lib/useNow";
import { FED_PER_BATCH, formatHoursLeft, supplyRadiusKm, tutorialPlan, type Town } from "../onboarding";
import { Button, Card, FormError } from "../ui";
import { useWorld } from "../world";
import { useWorldFocus } from "../world3d/focus";

// The new-player tutorial (docs/PRD.md §7, screens in docs/onboarding/screens-1-6.png):
//   1-3  the story, in three beats        4  arrival: the Rail Authority's grant
//   5    your first need: the towns       6  the mission, and the train to board
// It's shown after signing up at /welcome. The towns and their figures are the tutorial's own
// (src/onboarding.ts) until the game has towns that really run out of things.

const STEPS = 6;
const GAME = "/";

interface Beat {
  label: string;
  title: string;
  text: string;
  image: string;
  position: string;
  alt: string;
  credit: string;
}

const BEATS: Beat[] = [
  {
    label: "I · The sky and sea closed",
    title: "We cooled the sky and warmed the sea.",
    text: "Nothing flies now. No ship survives the waves.",
    image: "/story/strip-5.webp",
    position: "center",
    alt: "Shipwreck survivors cling to a broken mast as a towering wave rises in a glowing, stormy dawn.",
    credit: "Ivan Aivazovsky, The Ninth Wave, 1850",
  },
  {
    label: "II · So we built rails",
    title: "Steel now crosses every continent.",
    text: "Trains are how the world moves. Everything else was left behind.",
    image: "/story/strip-6.webp",
    position: "center",
    alt: "Workers haul a glowing iron bloom through the smoke and fire of a vast rolling mill.",
    credit: "Adolph Menzel, The Iron Rolling Mill, 1875",
  },
  {
    label: "III · The Remaining",
    title: "You couldn't leave. You stayed.",
    text: "Most people left for the stars. Those who remain keep the world alive, one need at a time.",
    image: "/story/strip-8.webp",
    position: "center 30%",
    alt: "A traveller stands on a rocky summit, looking out over a sea of fog towards distant peaks.",
    credit: "Caspar David Friedrich, Wanderer above the Sea of Fog, c. 1818",
  },
];

/** The tutorial: six screens, one primary action each, always at the bottom right. */
export function Onboarding() {
  const me = useMe().data as Me;
  const navigate = useNavigate();
  const [screen, setScreen] = useState(0);
  const home = useCatalog().data?.home ?? null;
  const world = useWorld();
  const plan = home ? tutorialPlan(world.stops, home.id) : null;
  const towns = plan?.towns ?? [];
  const town = towns[0] ?? null;

  const leave = () => navigate(GAME);
  const next = () => setScreen((s) => Math.min(STEPS - 1, s + 1));
  // One step per screen: the strip and "Step n of 6" move on with every screen.
  const step = screen + 1;

  // The story screens carry their actions in a bar at the bottom of the screen; the others in the
  // bottom of their panel (the `bar`), so the action stays with what it's about.
  const bar = (left: ReactNode, cta: ReactNode) => (
    <div className="onb-bar">
      <span className="onb-left">{left}</span>
      {cta}
    </div>
  );
  const frame = (body: ReactNode, paint = false, footer?: ReactNode) => (
    <div className={`onb${paint ? " is-paint" : ""}`}>
      <header className="onb-head">
        <Link to={GAME} className="brand" aria-label="Skip the tutorial and go to Aboard">
          Aboard
        </Link>
        <span className="onb-step">
          Step {step} of {STEPS}
        </span>
      </header>
      <ol className="onb-strip" aria-label={`Step ${step} of ${STEPS}`}>
        {Array.from({ length: STEPS }, (_, i) => (
          <li key={i} className={i < step ? "on" : undefined} />
        ))}
      </ol>
      <main className="onb-body">{body}</main>
      {paint && <footer className="onb-foot">{footer}</footer>}
    </div>
  );
  const primary = (label: string, onClick: () => void, disabled?: boolean) => (
    <Button kind="primary" className="onb-cta" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
  const quiet = (label: string, onClick: () => void) => (
    <button type="button" className="onb-link" onClick={onClick}>
      {label}
    </button>
  );

  if (screen < 3) {
    const b = BEATS[screen]!;
    return frame(
      <>
        <figure className="onb-art">
          <img src={b.image} alt={b.alt} style={{ objectPosition: b.position }} />
        </figure>
        <p className="eyebrow">{b.label}</p>
        <h1 className="onb-title">{b.title}</h1>
        <p className="lede">{b.text}</p>
        <p className="onb-credit">{b.credit}. Public domain.</p>
      </>,
      true,
      bar(screen === 2 ? <Link to="/story" className="onb-link">Read the full history</Link> : quiet("Skip", leave), primary(screen === 2 ? "Arrive" : "Next", next)),
    );
  }

  if (screen === 3) {
    return frame(
      <>
        <Focus home={home} others={[]} routes={world.routes} label="Berlin Hauptbahnhof, your home base" />
        <Card className="onb-card onb-center">
          <p className="eyebrow">{home ? `${home.name} · Rail Authority` : "Rail Authority"}</p>
          <h2>Welcome, traveller.</h2>
          <span className="onb-seal">
            <Icon name="coin" large />
          </span>
          <p className="onb-grant">{STARTING_BALANCE.toLocaleString("en")}</p>
          <p className="eyebrow">credits granted</p>
          <p className="muted">This is trust, not a prize. Turn it into food, water and medicine for people who need it.</p>
          {bar(null, primary("Accept the grant", next))}
        </Card>
      </>,
    );
  }

  if (!home || !town || !plan) {
    // A world with no other station, or still loading: nothing to feed yet.
    return frame(
      <Card className="onb-card">
        <h2>The line is still being laid.</h2>
        <p className="muted">There are no towns to reach yet. You can look around while the world fills in.</p>
        {bar(null, primary("Go to Aboard", leave))}
      </Card>,
    );
  }

  if (screen === 4) {
    const shown = towns.slice(0, 3);
    return frame(
      <>
        <Focus home={home} others={[town.stop]} routes={world.routes} label={`The line from ${home.name} to ${town.stop.name}`} />
        <Card className="onb-card">
          <p className="eyebrow onb-urgent">
            <span className="live-dot" />
            {towns.length} {towns.length === 1 ? "town needs" : "towns near you need"} bread
          </p>
          <h2>You are the only supply line within {supplyRadiusKm([town]).toLocaleString("en")} km.</h2>
          <p className="muted">
            The line to {town.stop.name} is lit. It is the town closest to running out.
          </p>
          <ul className="onb-rows">
            {shown.map((t) => (
              <li key={t.stop.id}>
                <span className="onb-ico">
                  <Icon name="people" />
                </span>
                <span>
                  {t.stop.name}
                  <small>
                    {t.people.toLocaleString("en")} people · {formatHoursLeft(t.hoursLeft)} left
                  </small>
                </span>
              </li>
            ))}
          </ul>
          {bar(quiet("Skip tutorial", leave), primary(`Feed ${town.stop.name} first`, next))}
        </Card>
      </>,
    );
  }

  return (
    <Mission
      me={me}
      home={home}
      market={plan.market}
      town={town}
      routes={world.routes}
      frame={frame}
      bar={bar}
      left={quiet("Wait", leave)}
      go={leave}
    />
  );
}

/** Screen 6: the whole mission, and the train that starts it. */
function Mission({
  me,
  home,
  market,
  town,
  routes,
  frame,
  bar,
  left,
  go,
}: {
  me: Me;
  home: Stop;
  /** Where the first train goes: the station that sells the ingredients. */
  market: Stop;
  town: Town;
  routes: ReturnType<typeof useWorld>["routes"];
  frame: (body: ReactNode, paint?: boolean, footer?: ReactNode) => ReactNode;
  bar: (left: ReactNode, cta: ReactNode) => ReactNode;
  left: ReactNode;
  go: () => void;
}) {
  const now = useNow(30_000);
  const qc = useQueryClient();
  const atHome = me.state === "ATSTATION" && me.currentStop === home.id;
  const departures = useQuery({
    queryKey: ["departures", home.id],
    queryFn: () => api<Departure[]>("GET", `/stop/${home.id}/departures`),
    enabled: atHome,
  });
  const dep = departures.data?.find((d) => d.destinations.some((x) => x.stop.id === market.id));
  const dest = dep?.destinations.find((x) => x.stop.id === market.id);
  const board = useMutation({
    mutationFn: () => api("POST", "/ticket/buy", { ticket: { trip: dep!.trip.id, from: home.id, to: market.id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: meKey });
      go();
    },
  });

  const flow: { icon: IconName; title: string; text: string }[] = [
    { icon: "wheat", title: "Grain, salt, yeast", text: `Bought in ${market.name}` },
    { icon: "oven", title: "Your bakery", text: "2 hours a batch" },
    { icon: "loaf", title: "24 loaves", text: `Feeds about ${FED_PER_BATCH}` },
  ];

  let cta: ReactNode;
  if (!atHome) cta = <Button kind="primary" className="onb-cta" onClick={go}>Go to Aboard</Button>;
  else if (dep) {
    cta = (
      <Button kind="primary" className="onb-cta" onClick={() => board.mutate()} disabled={board.isPending}>
        Board the train
      </Button>
    );
  } else cta = <Button kind="primary" className="onb-cta" onClick={go} disabled={departures.isPending}>See the departures</Button>;

  return frame(
    <>
      <Focus home={home} others={[market, town.stop]} routes={routes} label={`${home.name}, ${market.name} for the ingredients, ${town.stop.name} for the bread`} />
      <Card className="onb-card">
        <p className="eyebrow onb-urgent">
          <span className="live-dot" />
          Mission 1 · {town.hoursLeft} h of bread left
        </p>
        <h2>Make bread. Save {town.stop.name}.</h2>
        <p className="muted">
          {town.people.toLocaleString("en")} people in {town.stop.name} are waiting on one thing. {home.name} has no grain, so your
          first train goes to {market.name}, where it is sold.
        </p>
        <div className="onb-flow">
          {flow.map((f, i) => (
            <div key={f.title} className="onb-flow-item">
              {i > 0 && <span className="onb-arrow" aria-hidden="true">→</span>}
              <div>
                <Icon name={f.icon} large />
                <strong>{f.title}</strong>
                <small>{f.text}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="onb-pass">
          <p className="eyebrow">
            {dep ? `Ingredients · ${dep.boardingNow ? "boarding now" : `departs ${formatIn(dep.departureTime - now)}`}` : "Ingredients"}
          </p>
          {dep && dest ? (
            <div className="onb-leg">
              <span className="onb-stop">
                <Icon name="pin" />
                <span>
                  <strong>{home.name}</strong>
                  <small>{dep.boardingNow ? "Now" : formatClock(dep.departureTime, now)}</small>
                </span>
              </span>
              <span className="onb-leg-line" aria-hidden="true" />
              <span className="onb-stop">
                <Icon name="pin" />
                <span>
                  <strong>{market.name}</strong>
                  <small>{formatClock(dest.arrivalTime, now)}</small>
                </span>
              </span>
            </div>
          ) : (
            <p className="muted">
              {!atHome
                ? "You're already on your way. Carry on from the main screen."
                : departures.isPending
                  ? "Reading the board…"
                  : `No train to ${market.name} is due yet. Check the departures at ${home.name}.`}
            </p>
          )}
          <FormError message={board.error?.message} />
        </div>
        {bar(left, cta)}
      </Card>
    </>,
  );
}

/** Point the 3D world at home, or at the lines from home to other stations (lit, as when hovered). */
function Focus({
  home,
  others,
  routes,
  label,
}: {
  home: Stop | null;
  others: Stop[];
  routes: ReturnType<typeof useWorld>["routes"];
  label: string;
}) {
  const ids = [home?.id, ...others.map((o) => o.id)].filter((x): x is string => !!x);
  const lit = home ? routes.filter((r) => r.stops.some((s) => s.id === home.id) && others.some((o) => r.stops.some((s) => s.id === o.id))).map((r) => r.id) : [];
  const all = home ? [home, ...others] : [];
  // Look a little south of the northernmost station, so the stations sit in the open map above
  // the panel (whichever way the others lie from home).
  const mid = home
    ? others.length
      ? {
          lat: Math.max(...all.map((s) => s.coordinates.lat)) - 1.25,
          lng: all.reduce((m, s) => m + s.coordinates.lng, 0) / all.length,
        }
      : { lat: home.coordinates.lat - 0.7, lng: home.coordinates.lng }
    : null;
  const span = home ? Math.max(0, ...others.map((o) => Math.abs(home.coordinates.lng - o.coordinates.lng) + Math.abs(home.coordinates.lat - o.coordinates.lat))) : 0;
  useWorldFocus({ label, highlight: ids, labels: ids, litRoutes: lit, center: mid, distance: Math.min(3, 1.5 + span / 40) });
  return null;
}
