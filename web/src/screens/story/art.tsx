import type { ReactNode } from "react";

// Drawing kit for the Story comic: action-comic conventions (heavy ink outlines, Ben-Day
// halftone dots, sunburst speed lines, sound-effect bursts), as small SVG building blocks.
// Every scene uses a 400 × 300 (or 600 × 300) viewBox and the shared defs in <ComicDefs />.

export const INK = "#14110f";
export const C = {
  yellow: "#ffd23f",
  red: "#e63946",
  orange: "#f4a261",
  cyan: "#3ab0c9",
  blue: "#1d3557",
  sky: "#8ecae6",
  cream: "#fbf3e0",
  green: "#6a994e",
  purple: "#5e3c7a",
  grey: "#8d99ae",
  white: "#ffffff",
};
const STROKE = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Patterns and gradients every panel can use. Render once on the page. */
export function ComicDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="4" cy="4" r="1.6" fill={INK} />
        </pattern>
        <pattern id="dots-light" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="4" cy="4" r="1.6" fill="#fff" />
        </pattern>
        <pattern id="dots-big" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="7" cy="7" r="3.2" fill={INK} />
        </pattern>
        <linearGradient id="heat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e63946" />
          <stop offset="0.55" stopColor="#f4a261" />
          <stop offset="1" stopColor="#ffd23f" />
        </linearGradient>
        <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1026" />
          <stop offset="1" stopColor="#3a2a6b" />
        </linearGradient>
        <linearGradient id="storm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2633" />
          <stop offset="1" stopColor="#47607a" />
        </linearGradient>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7b54" />
          <stop offset="0.6" stopColor="#ffb26b" />
          <stop offset="1" stopColor="#ffe3a3" />
        </linearGradient>
        <linearGradient id="day" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fa8d3" />
          <stop offset="1" stopColor="#cae9ff" />
        </linearGradient>
        <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.4" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#e63946" />
        </linearGradient>
        <radialGradient id="glow">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="1" stopColor="#fff7d6" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Sunburst / speed lines from a point: alternating wedges. */
export function Rays({ cx, cy, n = 28, color, opacity = 1, r = 900 }: { cx: number; cy: number; n?: number; color: string; opacity?: number; r?: number }) {
  const wedges = [];
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    wedges.push(`M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} L${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`);
  }
  return <path d={wedges.join(" ")} fill={color} opacity={opacity} />;
}

/** Horizontal speed streaks. */
export function Streaks({ y0, y1, x0 = 0, x1 = 400, n = 10, color = INK, seed = 1 }: { y0: number; y1: number; x0?: number; x1?: number; n?: number; color?: string; seed?: number }) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const r = Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
    const len = 40 + r * 120;
    const x = x0 + r * (x1 - x0 - len);
    lines.push(<line key={i} x1={x} y1={y} x2={x + len} y2={y} stroke={color} strokeWidth={2 + r * 2} strokeLinecap="round" />);
  }
  return <g>{lines}</g>;
}

/** Halftone shading over part of a panel. */
export function Dots({ d, light, big, opacity = 0.35 }: { d: string; light?: boolean; big?: boolean; opacity?: number }) {
  return <path d={d} fill={`url(#${light ? "dots-light" : big ? "dots-big" : "dots"})`} opacity={opacity} />;
}

/** A sound-effect burst: jagged star with lettering. */
export function Burst({ x, y, r = 60, text, fill = C.yellow, color = C.red, size = 30, rotate = -8 }: { x: number; y: number; r?: number; text: string; fill?: string; color?: string; size?: number; rotate?: number }) {
  const pts = [];
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.62 : r * (0.95 + 0.1 * Math.sin(i * 3.1));
    pts.push(`${x + rr * Math.cos(a) * 1.35},${y + rr * Math.sin(a)}`);
  }
  return (
    <g transform={`rotate(${rotate} ${x} ${y})`}>
      <polygon points={pts.join(" ")} fill={fill} {...STROKE} />
      <text x={x} y={y + size * 0.36} textAnchor="middle" className="sfx" fontSize={size} fill={color} stroke={INK} strokeWidth={1.6} paintOrder="stroke">
        {text}
      </text>
    </g>
  );
}

/** A person, as an inked silhouette. (x, y) is where their feet are; s is height in px. */
export function Person({ x, y, s = 60, fill = INK, arm }: { x: number; y: number; s?: number; fill?: string; arm?: "up" | "wave" | "point" }) {
  const k = s / 60;
  const t = (px: number, py: number) => `${x + px * k},${y - py * k}`;
  return (
    <g fill={fill} stroke={INK} strokeWidth={2} strokeLinejoin="round">
      <circle cx={x} cy={y - 52 * k} r={7 * k} />
      <path d={`M${t(-10, 42)} Q${t(0, 46)} ${t(10, 42)} L${t(8, 20)} L${t(7, 0)} L${t(2, 0)} L${t(0, 16)} L${t(-2, 0)} L${t(-7, 0)} L${t(-8, 20)} Z`} />
      {arm === "up" && <path d={`M${t(8, 40)} L${t(16, 62)} L${t(12, 63)} L${t(5, 44)} Z`} />}
      {arm === "wave" && <path d={`M${t(8, 40)} L${t(20, 56)} L${t(17, 59)} L${t(5, 44)} Z`} />}
      {arm === "point" && <path d={`M${t(8, 40)} L${t(28, 42)} L${t(28, 38)} L${t(6, 35)} Z`} />}
    </g>
  );
}

/** A jet airliner, nose to the right. */
export function Plane({ x, y, s = 1, fill = C.white, rotate = 0 }: { x: number; y: number; s?: number; fill?: string; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`} {...STROKE} fill={fill}>
      <path d="M-70,0 Q-60,-10 40,-9 Q70,-8 78,0 Q70,8 40,9 L-60,9 Q-72,6 -70,0 Z" />
      <path d="M-5,-2 L-35,-42 L-20,-42 L20,-4 Z" />
      <path d="M-5,6 L-30,36 L-16,36 L18,8 Z" />
      <path d="M-62,-3 L-74,-28 L-64,-28 L-48,-6 Z" />
      <g fill={INK} stroke="none">
        {[-40, -28, -16, -4, 8, 20, 32].map((wx) => (
          <circle key={wx} cx={wx} cy={-2} r={2} />
        ))}
      </g>
    </g>
  );
}

/** A container ship, bow to the right. */
export function Ship({ x, y, s = 1, rotate = 0 }: { x: number; y: number; s?: number; rotate?: number }) {
  const boxes = [C.red, C.cyan, C.yellow, C.orange, C.red, C.green];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`} {...STROKE}>
      {boxes.map((c, i) => (
        <rect key={i} x={-60 + i * 18} y={-34 - (i % 2) * 14} width={18} height={14 + (i % 2) * 14} fill={c} />
      ))}
      <rect x={-78} y={-48} width={16} height={28} fill={C.white} />
      <path d="M-90,-20 L80,-20 L64,10 L-80,10 Z" fill={C.blue} />
      <path d="M-86,-8 L74,-8" stroke={C.red} strokeWidth={5} />
    </g>
  );
}

/** A big ark rocket, nose up. */
export function Rocket({ x, y, s = 1, flame = true, fill = C.white }: { x: number; y: number; s?: number; flame?: boolean; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {flame && (
        <>
          <path d="M-16,40 Q0,150 16,40 Z" fill="url(#flame)" {...STROKE} />
          <circle cx={0} cy={60} r={40} fill="url(#glow)" />
        </>
      )}
      <g {...STROKE}>
        <path d="M-18,40 L-18,-50 Q0,-100 18,-50 L18,40 Z" fill={fill} />
        <path d="M-18,10 L-34,44 L-18,40 Z" fill={C.red} />
        <path d="M18,10 L34,44 L18,40 Z" fill={C.red} />
        <circle cx={0} cy={-34} r={7} fill={C.cyan} />
        <path d="M-18,-10 L18,-10" />
      </g>
    </g>
  );
}

/** A streamlined maglev train, heading right: `cars` cars behind a long nose. */
export function Train({ x, y, s = 1, cars = 3, fill = C.white, stripe = C.red }: { x: number; y: number; s?: number; cars?: number; fill?: string; stripe?: string }) {
  const parts: ReactNode[] = [];
  for (let i = 0; i < cars; i++) {
    const cx = -i * 112;
    parts.push(
      <g key={i}>
        <rect x={cx - 108} y={-34} width={104} height={34} rx={8} fill={fill} />
        <rect x={cx - 108} y={-14} width={104} height={6} fill={stripe} stroke="none" />
        {[0, 1, 2, 3].map((w) => (
          <rect key={w} x={cx - 100 + w * 24} y={-28} width={16} height={10} rx={2} fill={C.blue} />
        ))}
      </g>,
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE}>
      {parts}
      <path d="M-4,-34 L40,-34 Q96,-30 110,0 L-4,0 Z" fill={fill} />
      <path d="M-4,-14 L104,-14 L108,-8 L-4,-8 Z" fill={stripe} stroke="none" />
      <path d="M44,-30 Q80,-26 92,-12 L48,-12 Z" fill={C.blue} />
    </g>
  );
}

/** A comic panel: an inked frame around a scene, plus HTML lettering on top. */
export function Panel({ children, view = "0 0 400 300", span = 1, label, lettering }: { children: ReactNode; view?: string; span?: number; label: string; lettering?: ReactNode }) {
  return (
    <figure className="panel" style={{ gridColumn: `span ${span}` }}>
      <svg viewBox={view} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
        {children}
      </svg>
      {lettering}
    </figure>
  );
}

/** Yellow caption box (narration). */
export function Caption({ children, at = "top-left", wide }: { children: ReactNode; at?: "top-left" | "top-right" | "bottom-left" | "bottom-right"; wide?: boolean }) {
  return <p className={`caption caption-${at}${wide ? " caption-wide" : ""}`}>{children}</p>;
}

/** Speech balloon, its tail pointing down-left or down-right towards the speaker. */
export function Balloon({ children, x, y, tail = "left", width }: { children: ReactNode; x: string; y: string; tail?: "left" | "right"; width?: string }) {
  return (
    <p className={`balloon balloon-${tail}`} style={{ left: x, top: y, width }}>
      {children}
    </p>
  );
}
