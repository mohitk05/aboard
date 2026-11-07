import { lazy, Suspense } from "react";
import { useWorld } from "../world";
import { useCurrentFocus } from "./focus";

// three.js is most of the app's weight, so the world loads after the panels.
const World3D = lazy(() => import("./World3D"));

/** The one 3D world, behind every screen. Screens steer it with useWorldFocus(). */
export function WorldLayer() {
  const world = useWorld();
  const focus = useCurrentFocus();
  return (
    <Suspense fallback={<div className="world" aria-hidden />}>
      <World3D stops={world.stops} routes={world.routes} trips={world.trips} focus={focus} />
    </Suspense>
  );
}
