import * as THREE from "three";

// A realistic Earth: NASA Blue Marble by day, city lights at night, a soft terminator, sunlight
// glinting on water, terrain relief, and blue atmospheric scattering at the limb. One shader,
// lit by the real sun direction. Textures are in web/public/textures (see CREDITS.md).

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform sampler2D reliefMap;
  uniform vec3 sunDir;
  uniform vec2 reliefTexel;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vWorldNormal);

    // Terrain relief: tilt the normal along the height gradient (east/north frame on the sphere).
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5));
    vec3 north = cross(n, east);
    float hL = texture2D(reliefMap, vUv - vec2(reliefTexel.x, 0.0)).r;
    float hR = texture2D(reliefMap, vUv + vec2(reliefTexel.x, 0.0)).r;
    float hD = texture2D(reliefMap, vUv - vec2(0.0, reliefTexel.y)).r;
    float hU = texture2D(reliefMap, vUv + vec2(0.0, reliefTexel.y)).r;
    n = normalize(n - 0.6 * ((hR - hL) * east + (hU - hD) * north));

    vec3 L = normalize(sunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndl = dot(n, L);
    float day = smoothstep(-0.12, 0.22, dot(normalize(vWorldNormal), L)); // terminator band

    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    float water = texture2D(waterMap, vUv).r;

    // Daylight: diffuse with a little sky fill, so the dark side isn't pitch black.
    vec3 color = dayColor * (0.035 + 1.15 * max(ndl, 0.0));
    // City lights fade in as the sun goes down.
    color += nightColor * pow(1.0 - day, 1.5) * vec3(1.0, 0.85, 0.6) * 1.4;
    // Sun glint on water.
    vec3 h = normalize(L + V);
    color += water * pow(max(dot(n, h), 0.0), 60.0) * 0.55 * day * vec3(1.0, 0.95, 0.85);
    // Atmospheric scattering towards the limb, brighter on the day side.
    // (A thin blue haze right at the edge, not a wash over the whole sunlit limb.)
    float fres = pow(1.0 - max(dot(normalize(vWorldNormal), V), 0.0), 5.0);
    color = mix(color, vec3(0.35, 0.6, 1.0) * (0.06 + 0.5 * day), fres * 0.6);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// The thin glowing shell around the planet, seen edge-on; brighter where the sun is, and
// brightest right at the planet's edge.
const ATMO_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    // Back faces of the shell: -dot(V, n) is ~0.26 at the planet's edge and 0 at the shell's
    // outer edge, so the glow hugs the limb and fades out into space (no hard ring).
    float rim = pow(clamp(-dot(V, n) / 0.28, 0.0, 1.0), 2.0);
    float lit = 0.25 + 0.75 * smoothstep(-0.3, 0.4, dot(n, normalize(sunDir)));
    gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * rim * lit * 1.6, rim * lit);
    #include <colorspace_fragment>
  }
`;

export interface Earth {
  globe: THREE.Mesh;
  atmosphere: THREE.Mesh;
  setSun(dir: THREE.Vector3): void;
  dispose(): void;
}

export function createEarth(renderer: THREE.WebGLRenderer, radius = 1): Earth {
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (url: string, srgb: boolean) => {
    const t = loader.load(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };
  const day = load("/textures/earth-blue-marble.jpg", true);
  const night = load("/textures/earth-night.jpg", true);
  const water = load("/textures/earth-water.png", false);
  const relief = load("/textures/earth-topology.png", false);

  const sunDir = { value: new THREE.Vector3(1, 0, 0) };
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 96),
    new THREE.ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
      uniforms: {
        dayMap: { value: day },
        nightMap: { value: night },
        waterMap: { value: water },
        reliefMap: { value: relief },
        reliefTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
        sunDir,
      },
    }),
  );
  // Equirectangular textures start at longitude -180; turn the sphere so 0° faces +z (see geo.ts).
  globe.rotation.y = -Math.PI / 2;

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.035, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { sunDir },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  return {
    globe,
    atmosphere,
    setSun: (dir) => sunDir.value.copy(dir).normalize(),
    dispose() {
      for (const t of [day, night, water, relief]) t.dispose();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
    },
  };
}

/** The Milky Way behind everything. */
export function loadStarfield(): THREE.Texture {
  const t = new THREE.TextureLoader().load("/textures/night-sky.png");
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
