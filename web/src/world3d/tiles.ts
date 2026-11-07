import * as THREE from "three";
import { toLatLng, toVec3 } from "./geo";

// Streamed satellite imagery, like a map app: as you zoom in, the globe swaps its single texture
// for map tiles (Web Mercator, zoom 3–8) of just the area in view. NASA GIBS imagery: Blue Marble
// by day and Black Marble city lights at night, served through our Worker (/tiles/…), which caches
// them at the edge. The whole-Earth texture stays underneath, so there's never a hole while tiles
// load, and it covers the poles, which Web Mercator doesn't reach.

const MIN_Z = 3;
const MAX_Z = 8;
const MAX_TILES = 48; // in view at once
const CACHE = 160; // tiles kept in memory
const SHOW_BELOW = 1.3; // altitude (in Earth radii) where tiles start to fade in
const FULL_BELOW = 0.8;

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// The same lighting as the whole-Earth shader (earth.ts), so tiles blend in seamlessly.
const FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform float hasNight;
  uniform vec3 sunDir;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 L = normalize(sunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndl = dot(n, L);
    float day = smoothstep(-0.12, 0.22, ndl);
    vec3 color = texture2D(dayMap, vUv).rgb * (0.035 + 1.15 * max(ndl, 0.0));
    vec3 lights = texture2D(nightMap, vUv).rgb * hasNight;
    color += lights * pow(1.0 - day, 1.5) * vec3(1.0, 0.85, 0.6) * 1.4;
    float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
    color = mix(color, vec3(0.35, 0.6, 1.0) * (0.06 + 0.5 * day), fres * 0.6);
    gl_FragColor = vec4(color, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface Tile {
  key: string;
  z: number;
  mesh: THREE.Mesh;
  day: THREE.Texture;
  night: THREE.Texture;
  ready: boolean;
  usedAt: number;
}

/** Latitude of the top edge of tile row y at zoom z (Web Mercator). */
function tileLat(y: number, z: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}
const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
function latToY(lat: number, z: number): number {
  const φ = (THREE.MathUtils.clamp(lat, -85.05, 85.05) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * 2 ** z;
}

function tileGeometry(z: number, x: number, y: number, r: number): THREE.BufferGeometry {
  const seg = z <= 4 ? 24 : 12;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= seg; j++) {
    // Rows are evenly spaced in Mercator y, so the image maps onto them without distortion.
    const lat = tileLat(y + j / seg, z);
    for (let i = 0; i <= seg; i++) {
      const lng = ((x + i / seg) / 2 ** z) * 360 - 180;
      pos.push(...toVec3({ lat, lng }, r));
      uv.push(i / seg, 1 - j / seg);
    }
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export interface TileLayer {
  group: THREE.Group;
  /** Choose and load the tiles for this view. Cheap enough to call every frame. */
  update(camera: THREE.PerspectiveCamera): void;
  setSun(dir: THREE.Vector3): void;
  dispose(): void;
}

export function createTileLayer(renderer: THREE.WebGLRenderer, radius = 1): TileLayer {
  const group = new THREE.Group();
  group.name = "tiles";
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const sunDir = { value: new THREE.Vector3(1, 0, 0) };
  const opacity = { value: 0 };
  const tiles = new Map<string, Tile>();
  let lastView = "";

  function texture(url: string, onLoad?: () => void): THREE.Texture {
    const t = loader.load(url, onLoad);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  function tile(z: number, x: number, y: number): Tile {
    const key = `${z}/${x}/${y}`;
    let t = tiles.get(key);
    if (t) return t;
    const hasNight = { value: 0 };
    const day = texture(`/tiles/day/${key}.jpg`, () => {
      t!.ready = true;
    });
    // City lights are much coarser than daylight imagery; level 6 is as sharp as they get.
    const nz = Math.min(z, 6);
    const s = 2 ** (z - nz);
    const night = texture(`/tiles/night/${nz}/${Math.floor(x / s)}/${Math.floor(y / s)}.png`, () => (hasNight.value = 1));
    const geometry = tileGeometry(z, x, y, radius * (1.0001 + z * 0.00003));
    if (s > 1) {
      // Use the matching part of the coarser night tile.
      const u0 = (x % s) / s;
      const v0 = 1 - ((y % s) + 1) / s;
      const uvs = geometry.getAttribute("uv") as THREE.BufferAttribute;
      const night2 = new Float32Array(uvs.count * 2);
      for (let i = 0; i < uvs.count; i++) {
        night2[i * 2] = u0 + uvs.getX(i) / s;
        night2[i * 2 + 1] = v0 + uvs.getY(i) / s;
      }
      geometry.setAttribute("uvNight", new THREE.BufferAttribute(night2, 2));
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: s > 1 ? VERT.replace("varying vec2 vUv;", "varying vec2 vUv;\n  attribute vec2 uvNight;\n  varying vec2 vUvN;").replace("vUv = uv;", "vUv = uv; vUvN = uvNight;") : VERT,
      fragmentShader: s > 1 ? FRAG.replace("varying vec2 vUv;", "varying vec2 vUv;\n  varying vec2 vUvN;").replace("texture2D(nightMap, vUv)", "texture2D(nightMap, vUvN)") : FRAG,
      uniforms: { dayMap: { value: day }, nightMap: { value: night }, hasNight, sunDir, opacity },
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = z; // finer tiles draw over coarser ones
    group.add(mesh);
    t = { key, z, mesh, day, night, ready: false, usedAt: 0 };
    tiles.set(key, t);
    return t;
  }

  function drop(t: Tile) {
    group.remove(t.mesh);
    t.mesh.geometry.dispose();
    (t.mesh.material as THREE.Material).dispose();
    t.day.dispose();
    t.night.dispose();
    tiles.delete(t.key);
  }

  /** Tile ranges covering the area in view at zoom z. */
  function cover(z: number, lat: number, lng: number, spanDeg: number) {
    const n = 2 ** z;
    const y0 = Math.max(0, Math.floor(latToY(lat + spanDeg, z)));
    const y1 = Math.min(n - 1, Math.floor(latToY(lat - spanDeg, z)));
    const lngSpan = Math.min(180, spanDeg / Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
    const x0 = Math.floor(lngToX(lng - lngSpan, z));
    const x1 = Math.floor(lngToX(lng + lngSpan, z));
    const out: [number, number, number][] = [];
    for (let y = y0; y <= y1; y++)
      for (let xx = x0; xx <= Math.min(x1, x0 + n - 1); xx++) out.push([z, ((xx % n) + n) % n, y]);
    return out;
  }

  const now = () => performance.now();

  return {
    group,
    setSun: (dir) => sunDir.value.copy(dir).normalize(),
    update(camera) {
      const d = camera.position.length();
      const alt = d / radius - 1;
      opacity.value = THREE.MathUtils.smoothstep(SHOW_BELOW - alt, 0, SHOW_BELOW - FULL_BELOW);
      group.visible = opacity.value > 0;
      if (!group.visible) return;

      const { lat, lng } = toLatLng(camera.position.toArray() as [number, number, number]);
      // How much of the globe is in view: limited by the horizon, and by the field of view.
      const horizon = Math.acos(Math.min(1, radius / d));
      const fov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const across = Math.atan((alt * Math.tan(fov) * Math.max(1, camera.aspect)) / 1) * 1.4;
      const spanDeg = THREE.MathUtils.radToDeg(Math.min(horizon, Math.max(across, 0.02)));

      let z = THREE.MathUtils.clamp(Math.floor(Math.log2(2.4 / alt)) + MIN_Z, MIN_Z, MAX_Z);
      let want = cover(z, lat, lng, spanDeg);
      while (want.length > MAX_TILES && z > MIN_Z) want = cover(--z, lat, lng, spanDeg);

      const view = `${want.length}:${want[0]?.join("/")}:${want.at(-1)?.join("/")}`;
      const stamp = now();
      const show = new Set<Tile>();
      for (const [tz, x, y] of want) {
        const t = tile(tz, x, y);
        t.usedAt = stamp;
        if (t.ready) show.add(t);
        else if (tz > MIN_Z) {
          // Until it arrives, show its parent if that's loaded (the whole-Earth texture is below).
          const p = tile(tz - 1, x >> 1, y >> 1);
          p.usedAt = stamp;
          if (p.ready) show.add(p);
        }
      }
      for (const t of tiles.values()) t.mesh.visible = show.has(t);

      if (view !== lastView) {
        lastView = view;
        if (tiles.size > CACHE) {
          const old = [...tiles.values()].filter((t) => t.usedAt < stamp).sort((a, b) => a.usedAt - b.usedAt);
          for (const t of old.slice(0, tiles.size - CACHE)) drop(t);
        }
      }
    },
    dispose() {
      for (const t of [...tiles.values()]) drop(t);
    },
  };
}
