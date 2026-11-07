import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

// Draw the world's land (Natural Earth 1:110m, public domain, via world-atlas) onto an
// equirectangular canvas, used as the globe's texture. Colours come from the theme.

export interface LandColors {
  ocean: string;
  land: string;
  coast: string;
  grid: string;
}

export function drawLand(colors: LandColors, width = 2048): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = colors.ocean;
  ctx.fillRect(0, 0, width, height);

  // Faint graticule every 30°.
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let lng = -180; lng <= 180; lng += 30) {
    const x = ((lng + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const topo = land110 as unknown as Topology;
  const geo = feature(topo, topo.objects.land!) as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
  const features = "features" in geo ? geo.features : [geo];
  const px = ([lng, lat]: number[]) => [((lng! + 180) / 360) * width, ((90 - lat!) / 180) * height] as const;

  ctx.fillStyle = colors.land;
  ctx.strokeStyle = colors.coast;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  for (const f of features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach((pt, i) => {
          const [x, y] = px(pt);
          // Rings crossing the antimeridian jump across the canvas; lift the pen there.
          if (i === 0 || Math.abs(pt[0]! - ring[i - 1]![0]!) > 180) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
      ctx.stroke();
    }
  }
  return canvas;
}
