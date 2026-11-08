import { lazy, Suspense } from "react";
import { useCatalog } from "../game";
import { useWorld } from "../world";
import { useCurrentFocus } from "./focus";
import { Inspector } from "./Inspector";
import { useSelection } from "./selection";

// three.js is most of the app's weight, so the world loads after the panels.
const World3D = lazy(() => import("./World3D"));

/** The one 3D world, behind every screen. Screens steer it with useWorldFocus(). */
export function WorldLayer() {
  const world = useWorld();
  const focus = useCurrentFocus();
  const selection = useSelection();
  const home = useCatalog().data?.home?.id ?? null;
  return (
    <>
      <Suspense fallback={<div className="world" aria-hidden />}>
        <World3D stops={world.stops} routes={world.routes} allRoutes={world.allRoutes} trips={world.trips} home={home} focus={focus} selection={selection} />
      </Suspense>
      <Inspector />
    </>
  );
}
