import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Me, type Stop } from "../api";
import { useMe } from "../auth";
import { Notice } from "../ui";
import { Journey } from "./Journey";
import { Shell } from "./Shell";
import { Station } from "./Station";
import { Waiting } from "./Waiting";

// Remember the trip you were on, so that when you next open the app after getting off
// (which happens on the server, maybe while you slept) we can welcome you.
const LAST_TRIP = "aboard:lastTrip";
const store = {
  get(): { user: string; to: string; toName: string } | null {
    try {
      return JSON.parse(localStorage.getItem(LAST_TRIP) ?? "null");
    } catch {
      return null;
    }
  },
  set(v: { user: string; to: string; toName: string } | null) {
    try {
      if (v) localStorage.setItem(LAST_TRIP, JSON.stringify(v));
      else localStorage.removeItem(LAST_TRIP);
    } catch {
      /* storage unavailable: no welcome message, nothing else breaks */
    }
  },
};

function useArrival(me: Me): string | null {
  const [arrived, setArrived] = useState<string | null>(null);
  useEffect(() => {
    if (me.state === "ONBOARD" && me.journey) {
      store.set({ user: me.id, to: me.journey.to.id, toName: me.journey.to.name });
      return;
    }
    const last = store.get();
    if (last && last.user === me.id && me.state === "ATSTATION") {
      if (me.currentStop === last.to) setArrived(last.toName);
      store.set(null);
    }
  }, [me.state, me.id, me.currentStop, me.journey]);
  return arrived;
}

/** Home shows the screen for where you are: at a station, waiting for a train, or on board. */
export function Home() {
  const me = useMe().data as Me;
  const arrived = useArrival(me);
  const stop = useQuery({
    queryKey: ["stop", me.currentStop],
    queryFn: () => api<Stop>("GET", `/stop/${me.currentStop}`),
    enabled: !!me.currentStop,
    staleTime: Infinity,
  });

  return (
    <Shell>
      {arrived && me.state === "ATSTATION" && (
        <Notice tone="successful">You've arrived in {arrived}. Welcome.</Notice>
      )}
      {me.state === "ONBOARD" && me.journey ? (
        <Journey journey={me.journey} />
      ) : me.state === "READYTOGO" && me.journey ? (
        <Waiting journey={me.journey} />
      ) : (
        <Station me={me} stop={stop.data} />
      )}
    </Shell>
  );
}
