import { lazy, Suspense } from "react";
import type { WorldMapProps } from "./WorldMap";

// MapLibre is most of the app's weight, so it loads only on screens that show a map.
const WorldMap = lazy(() => import("./WorldMap"));

export function Map(props: WorldMapProps) {
  return (
    <Suspense fallback={<div className={`map map-loading ${props.className ?? ""}`} aria-hidden />}>
      <WorldMap {...props} />
    </Suspense>
  );
}
