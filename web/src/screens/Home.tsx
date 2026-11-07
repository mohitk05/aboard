import { useQuery } from "@tanstack/react-query";
import { api, type Me, type Stop } from "../api";
import { useMe } from "../auth";
import { Journey } from "./Journey";
import { Shell } from "./Shell";
import { Station } from "./Station";
import { Waiting } from "./Waiting";

/** Home shows the screen for where you are: at a station, waiting for a train, or on board. */
export function Home() {
  const me = useMe().data as Me;
  const stop = useQuery({
    queryKey: ["stop", me.currentStop],
    queryFn: () => api<Stop>("GET", `/stop/${me.currentStop}`),
    enabled: !!me.currentStop,
    staleTime: Infinity,
  });

  return (
    <Shell>
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
