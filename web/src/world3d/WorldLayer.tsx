import { Component, lazy, Suspense, type ReactNode } from "react";
import { useCatalog } from "../game";
import { useWorld } from "../world";
import { useCurrentFocus } from "./focus";
import { Inspector } from "./Inspector";
import { useSelection } from "./selection";

// three.js is most of the app's weight, so the world loads after the panels.
const World3D = lazy(() => import("./World3D"));

/**
 * If the 3D world can't load (offline before its code was cached, a flaky network), carry on
 * without it: the panels work on their own, as they do without WebGL. Without this, a failed
 * import would take the whole app down to a blank screen.
 */
class WithoutWorldOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div className="world" aria-hidden data-webgl="unavailable" /> : this.props.children;
  }
}

/** The one 3D world, behind every screen. Screens steer it with useWorldFocus(). */
export function WorldLayer() {
  const world = useWorld();
  const focus = useCurrentFocus();
  const selection = useSelection();
  const home = useCatalog().data?.home?.id ?? null;
  return (
    <>
      <WithoutWorldOnError>
        <Suspense fallback={<div className="world" aria-hidden />}>
        <World3D stops={world.stops} routes={world.routes} allRoutes={world.allRoutes} trips={world.trips} home={home} focus={focus} selection={selection} />
        </Suspense>
      </WithoutWorldOnError>
      <Inspector />
    </>
  );
}
