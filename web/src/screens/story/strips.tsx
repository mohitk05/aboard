import { Balloon, Burst, C, Caption, Dots, INK, Panel, Person, Plane, Rays, Rocket, Ship, Streaks, Train } from "./art";

// The story of Aboard, in eight strips. Each panel is inline SVG art with its lettering (captions
// and speech balloons) as HTML on top, so the words stay readable and selectable at any size.

const ink = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };

/** A deterministic scatter of numbers in [0, 1), so the art is the same every render. */
const rnd = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;

function Skyline({ base, color, seed, h = 120, w = 400 }: { base: number; color: string; seed: number; h?: number; w?: number }) {
  const blocks = [];
  let x = -10;
  let i = seed;
  while (x < w) {
    const bw = 18 + rnd(i) * 34;
    const bh = h * (0.35 + rnd(i + 99) * 0.65);
    blocks.push(<rect key={i} x={x} y={base - bh} width={bw} height={bh + 40} fill={color} {...ink} />);
    if (rnd(i + 7) > 0.5) blocks.push(<rect key={`a${i}`} x={x + bw / 2 - 2} y={base - bh - 18} width={4} height={18} fill={color} {...ink} />);
    x += bw - 3;
    i++;
  }
  return <g>{blocks}</g>;
}

function Windows({ base, seed, w = 400, color = C.yellow }: { base: number; seed: number; w?: number; color?: string }) {
  const out = [];
  for (let i = 0; i < 70; i++) {
    const x = rnd(seed + i) * w;
    const y = base - 10 - rnd(seed + i + 500) * 90;
    out.push(<rect key={i} x={x} y={y} width={4} height={5} fill={color} />);
  }
  return <g>{out}</g>;
}

export function Strip1() {
  return (
    <>
      <Panel span={2} view="0 0 600 300" label="A megacity packed with towers under a burning orange sky" lettering={<><Caption>Earth, 2190.</Caption><Caption at="bottom-left">Twelve billion people. One tired planet.</Caption></>}>
        <rect width="600" height="300" fill="url(#heat)" />
        <Rays cx={300} cy={150} color={C.yellow} opacity={0.45} n={36} />
        <circle cx={300} cy={150} r={62} fill={C.yellow} {...ink} />
        <Dots d="M0,0 H600 V300 H0 Z" opacity={0.18} />
        <Skyline base={260} color="#7a2e3a" seed={3} h={150} w={600} />
        <Skyline base={290} color="#3d1a2b" seed={40} h={110} w={600} />
        <Windows base={290} seed={7} w={600} />
        <path d="M0,215 Q150,195 300,215 T600,212 V240 H0 Z" fill="#f4a261" opacity="0.55" />
        <rect x="0" y="286" width="600" height="14" fill={INK} />
      </Panel>
      <Panel label="A packed crowd, a thermometer bursting at 48 degrees" lettering={<Caption at="bottom-left" wide>The cities had nowhere left to grow. The summers, nowhere left to go.</Caption>}>
        <rect width="400" height="300" fill={C.orange} />
        <Rays cx={300} cy={60} color={C.yellow} opacity={0.6} />
        {Array.from({ length: 26 }, (_, i) => (
          <Person key={i} x={-10 + (i % 13) * 34 + (i > 12 ? 17 : 0)} y={i > 12 ? 320 : 250} s={i > 12 ? 120 : 90} fill={i > 12 ? INK : "#5a2b35"} />
        ))}
        <Burst x={300} y={70} r={52} text="48°C!" size={34} />
      </Panel>
    </>
  );
}

export function Strip2() {
  return (
    <>
      <Panel span={2} view="0 0 600 300" label="Three great ark rockets blasting off into a starry night" lettering={<><Caption>The Exodus.</Caption><Caption at="bottom-left">Those who could, left for new worlds among the stars.</Caption></>}>
        <rect width="600" height="300" fill="url(#night)" />
        {Array.from({ length: 60 }, (_, i) => (
          <circle key={i} cx={rnd(i) * 600} cy={rnd(i + 300) * 200} r={rnd(i + 7) * 1.8 + 0.4} fill="#fff" />
        ))}
        <Rays cx={300} cy={300} color="#fff" opacity={0.08} n={40} />
        <Rocket x={150} y={170} s={0.9} />
        <Rocket x={320} y={110} s={1.25} />
        <Rocket x={480} y={190} s={0.75} />
        <path d="M0,260 Q60,220 120,250 Q180,215 250,248 Q320,212 380,246 Q450,218 520,250 Q570,230 600,250 V300 H0 Z" fill="#e8e1d5" {...ink} />
        <Dots d="M0,260 Q60,220 120,250 Q180,215 250,248 Q320,212 380,246 Q450,218 520,250 Q570,230 600,250 V300 H0 Z" opacity={0.25} />
        <Burst x={500} y={70} r={56} text="WHOOOSH!" size={26} rotate={6} />
      </Panel>
      <Panel label="A child at a window, watching the rocket trails in the sky" lettering={<><Balloon x="8%" y="10%" tail="right" width="56%">Will they ever come back?</Balloon><Caption at="bottom-left">Billions stayed behind.</Caption></>}>
        <rect width="400" height="300" fill="url(#night)" />
        <path d="M60,40 Q200,-30 340,60" stroke="#fff" strokeWidth="4" fill="none" strokeDasharray="2 10" strokeLinecap="round" />
        <path d="M30,110 Q230,20 380,30" stroke={C.yellow} strokeWidth="3" fill="none" strokeDasharray="2 12" strokeLinecap="round" />
        <rect x="0" y="0" width="400" height="300" fill="none" stroke="#2a1d3a" strokeWidth="60" />
        <path d="M200,30 V270 M30,150 H370" stroke="#2a1d3a" strokeWidth="14" />
        <rect x="30" y="30" width="340" height="240" fill="none" {...ink} />
        <g transform="translate(250 300)">
          <circle cx="0" cy="-118" r="34" fill="#3b2b4f" {...ink} />
          <path d="M-60,0 Q-58,-70 0,-80 Q58,-70 60,0 Z" fill="#3b2b4f" {...ink} />
        </g>
        <Dots d="M190,180 h120 v120 h-120 Z" light opacity={0.25} />
      </Panel>
    </>
  );
}

export function Strip3() {
  return (
    <>
      <Panel label="A council of leaders around a round table, a glowing globe above them" lettering={<><Caption>The Accord of the Remaining.</Caption><Caption at="bottom-left" wide>Those who stayed took charge of the planet.</Caption></>}>
        <rect width="400" height="300" fill="#22314a" />
        <Rays cx={200} cy={95} color={C.cyan} opacity={0.18} n={30} />
        <circle cx="200" cy="95" r="58" fill={C.cyan} {...ink} />
        <path d="M160,70 Q185,60 196,82 Q178,100 166,92 Z M210,60 Q240,70 236,98 Q218,110 210,88 Z M200,120 Q222,124 214,142 Q196,140 200,120 Z" fill={C.green} stroke={INK} strokeWidth="2" />
        <Dots d="M142,95 a58,58 0 0 0 116,0 Z" opacity={0.25} />
        <ellipse cx="200" cy="245" rx="170" ry="40" fill="#6b4f3a" {...ink} />
        {[60, 115, 170, 230, 285, 340].map((x, i) => (
          <Person key={x} x={x} y={232 - Math.abs(200 - x) * 0.08} s={70} fill={i === 2 ? "#3a2a1c" : "#151b29"} />
        ))}
      </Panel>
      <Panel label="A leader slamming a fist down, shouting" lettering={<Balloon x="6%" y="6%" tail="left" width="62%">No more waste! Every journey must earn its place.</Balloon>}>
        <rect width="400" height="300" fill={C.red} />
        <Rays cx={170} cy={140} color="#ff6b6b" n={36} />
        <g transform="translate(170 300)">
          <path d="M-110,0 Q-105,-120 0,-130 Q105,-120 110,0 Z" fill="#1d1d2b" {...ink} />
          <circle cx="0" cy="-172" r="52" fill="#d9a07a" {...ink} />
          <path d="M-52,-185 Q-40,-232 0,-226 Q44,-232 52,-182 Q30,-200 0,-198 Q-30,-200 -52,-185 Z" fill={INK} />
          <path d="M-20,-165 l12,-4 M20,-165 l-12,-4" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M-18,-140 Q0,-128 18,-140 Q0,-150 -18,-140 Z" fill={INK} />
        </g>
        <g transform="translate(330 120)">
          <path d="M-60,120 L-20,10 L30,30 L-10,130 Z" fill="#1d1d2b" {...ink} />
          <rect x="-34" y="-34" width="64" height="54" rx="14" fill="#d9a07a" {...ink} />
          <path d="M-34,-14 h64 M-34,4 h64" stroke={INK} strokeWidth="2" />
        </g>
        <Streaks y0={40} y1={110} x0={260} x1={400} n={5} />
      </Panel>
      <Panel label="A red BANNED stamp over an airliner and a container ship" lettering={<Caption at="bottom-left" wide>Flying and shipping were the first to go.</Caption>}>
        <rect width="400" height="300" fill={C.cream} />
        <Dots d="M0,0 H400 V300 H0 Z" opacity={0.12} />
        <Plane x={200} y={95} s={1.3} />
        <Ship x={205} y={225} s={1.1} />
        <g transform="rotate(-14 200 160)">
          <rect x="70" y="122" width="260" height="76" rx="8" fill="none" stroke={C.red} strokeWidth="10" />
          <text x="200" y="180" textAnchor="middle" className="sfx" fontSize="54" fill={C.red}>
            BANNED
          </text>
        </g>
      </Panel>
    </>
  );
}

export function Strip4() {
  return (
    <>
      <Panel label="An airliner torn by violent high-altitude winds" lettering={<Caption at="bottom-left">The Thin Sky.</Caption>}>
        <rect width="400" height="300" fill="url(#storm)" />
        <Streaks y0={20} y1={280} n={16} color="#cfe3f2" seed={4} />
        <Plane x={200} y={150} s={1.3} rotate={-18} />
        <path d="M262,120 l12,-18 l6,14 l14,-10" stroke={C.yellow} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Burst x={300} y={60} r={50} text="KRRAKK!" size={26} rotate={-12} />
      </Panel>
      <Panel label="Diagram of the atmosphere: thin air high up, a wall of wind, and the 3,000 metre limit" lettering={<Caption at="bottom-left" wide>The carbon scrubbers cooled and thinned the upper air. Above 3,000 m, wings found nothing to hold.</Caption>}>
        <rect width="400" height="300" fill="url(#day)" />
        <rect x="0" y="0" width="400" height="70" fill="#0b1026" />
        <Dots d="M0,0 H400 V70 H0 Z" light big opacity={0.35} />
        <text x="16" y="28" className="diagram">THIN AIR: NOTHING TO HOLD A WING</text>
        <rect x="0" y="92" width="400" height="44" fill="#ffffff" opacity="0.6" />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${20 + i * 96},114 h60 l-12,-10 m12,10 l-12,10`} stroke={C.red} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <text x="16" y="160" className="diagram">JET STREAM: 900 KM/H WALL OF WIND</text>
        <path d="M0,196 H400" stroke={C.red} strokeWidth="4" strokeDasharray="14 8" />
        <text x="16" y="188" className="diagram">3,000 M · LIFT FAILS</text>
        <path d="M0,250 L60,214 L110,236 L170,196 L230,232 L290,206 L350,238 L400,220 V300 H0 Z" fill={C.green} {...ink} />
      </Panel>
      <Panel label="Rows of abandoned airliners in a desert at sunset" lettering={<Caption at="top-left" wide>Within a generation, nothing flew.</Caption>}>
        <rect width="400" height="300" fill="url(#dusk)" />
        <circle cx="300" cy="150" r="46" fill={C.yellow} {...ink} />
        <rect x="0" y="180" width="400" height="120" fill="#d9a066" {...ink} />
        <Dots d="M0,180 H400 V300 H0 Z" opacity={0.2} />
        <Plane x={110} y={205} s={0.55} fill="#e9e3d6" rotate={4} />
        <Plane x={270} y={220} s={0.6} fill="#d8d0c0" rotate={-6} />
        <Plane x={150} y={262} s={0.75} fill="#efe9dc" rotate={8} />
        <path d="M300,262 l40,-6 l20,10" stroke={INK} strokeWidth="3" fill="none" />
      </Panel>
    </>
  );
}

export function Strip5() {
  return (
    <>
      <Panel span={2} view="0 0 600 300" label="A gigantic storm wave towering over a container ship, lightning above" lettering={<><Caption at="top-right">The Wild Sea.</Caption><Caption at="bottom-right">The warmed oceans never calmed: hundred-metre swells, storms without end.</Caption></>}>
        <rect width="600" height="300" fill="url(#storm)" />
        <path d="M420,0 l-30,70 l26,-6 l-34,80" stroke={C.yellow} strokeWidth="6" fill="none" strokeLinejoin="round" />
        <path d="M-10,300 L-10,210 Q120,190 220,230 Q300,40 470,20 Q560,30 560,90 Q520,70 490,92 Q530,110 510,150 Q470,120 430,160 Q420,240 610,250 L610,300 Z" fill="#2f6f8f" {...ink} />
        <path d="M300,90 Q380,30 470,20 Q560,30 560,90 Q520,70 490,92" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
        <Dots d="M220,230 Q300,40 470,20 L470,300 L220,300 Z" opacity={0.25} />
        <Ship x={170} y={218} s={0.85} rotate={-24} />
        <path d="M-10,260 Q60,240 140,262 Q220,282 300,256 Q400,236 610,262 V300 H-10 Z" fill="#1f4f68" {...ink} />
        <Burst x={110} y={70} r={58} text="WHOOOM!" size={28} />
      </Panel>
      <Panel label="A harbour behind a locked chain, a sign reading PORT CLOSED" lettering={<Caption at="bottom-left" wide>One by one, the harbours closed.</Caption>}>
        <rect width="400" height="300" fill="url(#storm)" />
        <path d="M60,40 V200 M60,60 H170 L150,80 M120,60 V110" stroke="#8a4b2f" strokeWidth="10" fill="none" />
        <path d="M290,30 V200 M290,50 H380 M350,50 V100" stroke="#8a4b2f" strokeWidth="10" fill="none" />
        <rect x="0" y="200" width="400" height="100" fill="#2f6f8f" {...ink} />
        <path d="M0,170 Q100,210 200,180 Q300,150 400,190" stroke={INK} strokeWidth="9" fill="none" strokeDasharray="16 6" />
        <g transform="rotate(-4 200 135)">
          <rect x="110" y="104" width="180" height="62" fill={C.yellow} {...ink} />
          <text x="200" y="147" textAnchor="middle" className="sfx" fontSize="30" fill={C.red}>
            PORT CLOSED
          </text>
        </g>
      </Panel>
    </>
  );
}

export function Strip6() {
  return (
    <>
      <Panel label="A giant tunnel-boring machine grinding through rock, sparks flying" lettering={<><Caption at="top-right">Steel across the world.</Caption><Caption at="bottom-left">So humanity did what it does best. It dug.</Caption></>}>
        <rect width="400" height="300" fill="#3a2a22" />
        <Rays cx={200} cy={150} color="#5b4334" n={30} />
        <circle cx="200" cy="150" r="118" fill={C.grey} {...ink} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <line key={i} x1={200} y1={150} x2={200 + 118 * Math.cos(a)} y2={150 + 118 * Math.sin(a)} stroke={INK} strokeWidth="5" />;
        })}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return <circle key={i} cx={200 + 96 * Math.cos(a)} cy={150 + 96 * Math.sin(a)} r={7} fill={C.yellow} {...ink} />;
        })}
        <circle cx="200" cy="150" r="30" fill={C.red} {...ink} />
        {Array.from({ length: 18 }, (_, i) => (
          <line key={i} x1={320} y1={250} x2={320 + Math.cos(-0.4 - rnd(i) * 1.6) * (30 + rnd(i + 9) * 60)} y2={250 + Math.sin(-0.4 - rnd(i) * 1.6) * (30 + rnd(i + 9) * 60)} stroke={C.yellow} strokeWidth="3" strokeLinecap="round" />
        ))}
        <Burst x={86} y={60} r={46} text="KRRSSH!" size={24} />
      </Panel>
      <Panel label="A map of the world with new rail lines and tunnels drawn across the oceans" lettering={<Caption at="bottom-left" wide>Under the Atlantic. Beneath the Bering Strait. Through the Andes.</Caption>}>
        <rect width="400" height="300" fill="#e9dfc6" />
        <Dots d="M0,0 H400 V300 H0 Z" opacity={0.1} />
        <path d="M30,60 Q60,40 110,52 Q130,90 100,110 Q120,150 90,200 Q70,170 66,130 Q40,110 30,60 Z" fill={C.green} {...ink} />
        <path d="M70,190 Q100,200 110,240 Q96,280 84,250 Q70,220 70,190 Z" fill={C.green} {...ink} />
        <path d="M180,50 Q260,30 360,60 Q380,100 330,120 Q300,140 280,120 Q250,130 230,110 Q200,100 180,50 Z" fill={C.green} {...ink} />
        <path d="M200,130 Q240,130 250,170 Q240,230 220,240 Q200,200 196,170 Q184,150 200,130 Z" fill={C.green} {...ink} />
        <path d="M330,200 Q370,190 380,220 Q360,240 330,230 Z" fill={C.green} {...ink} />
        <path d="M100,80 Q150,40 200,70" stroke={C.red} strokeWidth="4" fill="none" strokeDasharray="8 6" />
        <path d="M200,70 Q270,70 340,80" stroke={C.red} strokeWidth="4" fill="none" />
        <path d="M60,62 Q40,30 20,40" stroke={C.red} strokeWidth="4" fill="none" strokeDasharray="8 6" />
        <path d="M95,200 Q150,200 205,180" stroke={C.red} strokeWidth="4" fill="none" strokeDasharray="8 6" />
        <path d="M230,180 Q300,210 340,210" stroke={C.red} strokeWidth="4" fill="none" strokeDasharray="8 6" />
        <path d="M80,120 Q90,170 92,220" stroke={C.red} strokeWidth="4" fill="none" />
        {[[100, 80], [200, 70], [340, 80], [205, 180], [340, 210], [92, 220]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={7} fill={C.white} {...ink} />
        ))}
      </Panel>
      <Panel label="A rail worker swinging a hammer onto a spike" lettering={<Caption at="top-left">The Great Lines took two hundred years.</Caption>}>
        <rect width="400" height="300" fill={C.yellow} />
        <Rays cx={250} cy={210} color="#ffe57a" n={32} />
        <path d="M0,250 L400,226 L400,300 L0,300 Z" fill="#8a6f55" {...ink} />
        {[30, 110, 190, 270, 350].map((x) => (
          <path key={x} d={`M${x},${276 - x * 0.06} l46,-3 l0,14 l-46,3 Z`} fill="#5b4334" {...ink} />
        ))}
        <path d="M0,262 L400,238 M0,282 L400,258" stroke={C.grey} strokeWidth="7" />
        <Person x={150} y={250} s={150} arm="up" fill="#1d3557" />
        <path d="M168,96 L222,54" stroke="#5b4334" strokeWidth="8" strokeLinecap="round" />
        <rect x="210" y="34" width="34" height="22" rx="3" fill={C.grey} {...ink} transform="rotate(-38 227 45)" />
        <Burst x={310} y={170} r={52} text="CLANG!" size={30} fill={C.white} />
      </Panel>
    </>
  );
}

export function Strip7() {
  return (
    <>
      <Panel span={2} view="0 0 600 300" label="A sleek maglev train racing past mountains at sunset" lettering={<><Caption at="top-right">Centuries later…</Caption><Caption at="bottom-left">Nobody remembers wings.</Caption></>}>
        <rect width="600" height="300" fill="url(#dusk)" />
        <circle cx="460" cy="110" r="60" fill={C.yellow} {...ink} />
        <Rays cx={460} cy={110} color="#fff1c1" opacity={0.4} n={40} />
        <path d="M0,200 L80,120 L140,170 L230,80 L320,160 L400,110 L480,170 L560,120 L600,150 V300 H0 Z" fill={C.purple} {...ink} />
        <path d="M230,80 L250,100 L240,104 L226,96 L212,104 Z M80,120 L94,134 L72,138 Z" fill="#fff" stroke={INK} strokeWidth="2" />
        <path d="M0,230 Q300,200 600,226 V300 H0 Z" fill="#c76d4a" {...ink} />
        <rect x="0" y="246" width="600" height="12" fill={C.grey} {...ink} />
        <Streaks y0={190} y1={245} x0={0} x1={420} n={8} color={INK} seed={9} />
        <Train x={470} y={244} s={0.95} cars={4} />
        <Burst x={110} y={70} r={56} text="FWOOSH!" size={28} rotate={-6} />
      </Panel>
      <Panel label="Two passengers at a train window, fields rushing past outside" lettering={<><Balloon x="6%" y="5%" tail="left" width="60%">Lisbon to Vladivostok in two days. Imagine walking!</Balloon><Caption at="bottom-right" wide>Trains are simply how the world moves.</Caption></>}>
        <rect width="400" height="300" fill="#e9dcc3" />
        <rect x="30" y="34" width="340" height="150" rx="22" fill="url(#day)" {...ink} />
        <path d="M30,140 Q150,110 370,138 V170 Q370,184 356,184 H44 Q30,184 30,170 Z" fill={C.green} />
        <Streaks y0={140} y1={180} x0={40} x1={360} n={6} color="#3f6b2f" seed={3} />
        <rect x="30" y="34" width="340" height="150" rx="22" fill="none" {...ink} />
        <g transform="translate(120 300)">
          <path d="M-70,0 Q-66,-82 0,-92 Q66,-82 70,0 Z" fill={C.red} {...ink} />
          <circle cx="0" cy="-122" r="36" fill="#c98a64" {...ink} />
          <path d="M-36,-130 Q-30,-172 6,-166 Q40,-160 36,-124 Q16,-148 -36,-130 Z" fill="#3a2a1c" />
        </g>
        <g transform="translate(290 300)">
          <path d="M-66,0 Q-62,-78 0,-88 Q62,-78 66,0 Z" fill={C.blue} {...ink} />
          <circle cx="0" cy="-118" r="34" fill="#8a5a3c" {...ink} />
          <path d="M-34,-124 Q-30,-160 0,-158 Q32,-156 34,-120 Q30,-138 0,-142 Q-26,-140 -34,-124 Z" fill={INK} />
        </g>
      </Panel>
    </>
  );
}

export function Strip8() {
  return (
    <>
      <Panel label="Berlin Hauptbahnhof's great glass hall, a traveller with a suitcase in front" lettering={<><Caption>Your turn.</Caption><Caption at="bottom-left">Berlin Hauptbahnhof: your home base.</Caption></>}>
        <rect width="400" height="300" fill="url(#day)" />
        <path d="M20,230 V140 Q200,40 380,140 V230 Z" fill="#cfe8f3" {...ink} />
        {[60, 110, 160, 200, 240, 290, 340].map((x) => (
          <path key={x} d={`M${x},230 V${140 - (1 - Math.abs(200 - x) / 180) * 70}`} stroke={INK} strokeWidth="2" />
        ))}
        <path d="M20,175 Q200,90 380,175" stroke={INK} strokeWidth="2" fill="none" />
        <rect x="90" y="96" width="220" height="40" fill={C.white} {...ink} />
        <text x="200" y="123" textAnchor="middle" className="sign">
          Berlin Hbf
        </text>
        <rect x="0" y="230" width="400" height="70" fill="#9a8f80" {...ink} />
        <Dots d="M0,230 H400 V300 H0 Z" opacity={0.2} />
        <Person x={250} y={292} s={110} fill={C.red} arm="wave" />
        <rect x="200" y="252" width="34" height="40" rx="4" fill="#6b4f3a" {...ink} />
      </Panel>
      <Panel label="A ledger and map with pins: cocoa in Dakar, lithium in La Paz, polysilicon in Ürümqi" lettering={<Balloon x="22%" y="4%" tail="left" width="70%">Cocoa in Dakar. Lithium in La Paz. Polysilicon in Ürümqi…</Balloon>}>
        <rect width="400" height="300" fill="#6b4f3a" />
        <rect x="26" y="24" width="348" height="250" fill="#f3e8cc" {...ink} transform="rotate(-2 200 150)" />
        <Dots d="M30,30 H370 V270 H30 Z" opacity={0.08} />
        <path d="M60,90 Q120,70 170,96 Q180,140 140,150 Q150,200 120,240 Q100,190 96,150 Q60,130 60,90 Z" fill="#cfd8b0" stroke={INK} strokeWidth="2" />
        <path d="M210,70 Q290,50 350,90 Q330,140 290,130 Q260,150 230,120 Q200,110 210,70 Z" fill="#cfd8b0" stroke={INK} strokeWidth="2" />
        <path d="M196,92 C230,150 120,170 106,190" stroke={C.red} strokeWidth="3" fill="none" strokeDasharray="6 5" />
        <path d="M196,92 C240,80 280,96 310,100" stroke={C.red} strokeWidth="3" fill="none" strokeDasharray="6 5" />
        {[
          [196, 92, C.red],
          [106, 190, C.yellow],
          [150, 128, C.orange],
          [310, 100, C.cyan],
        ].map(([x, y, c]) => (
          <g key={`${x}`}>
            <circle cx={x as number} cy={(y as number) - 14} r={9} fill={c as string} {...ink} />
            <path d={`M${x},${y} L${x},${(y as number) - 6}`} stroke={INK} strokeWidth="3" />
          </g>
        ))}
        <text x="210" y="80" className="note">home</text>
        <text x="72" y="214" className="note">lithium</text>
        <text x="120" y="112" className="note">cocoa</text>
        <text x="290" y="128" className="note">polysilicon</text>
      </Panel>
      <Panel label="ALL ABOARD! burst over a rising factory and a departing train" lettering={<Caption at="bottom-right" wide>5,000 credits. A ticket. An industry to build.</Caption>}>
        <rect width="400" height="300" fill={C.red} />
        <Rays cx={200} cy={150} color={C.yellow} n={32} />
        <path d="M40,250 V170 L90,196 V170 L140,196 V150 H180 V250 Z" fill="#1d1d2b" {...ink} />
        <rect x="150" y="110" width="20" height="44" fill="#1d1d2b" {...ink} />
        <path d="M160,104 q10,-24 30,-26 q14,-16 34,-6" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.85" />
        <Train x={360} y={270} s={0.6} cars={2} />
        <rect x="0" y="270" width="400" height="30" fill={INK} />
        <Burst x={262} y={86} r={74} text="ALL ABOARD!" size={28} fill={C.yellow} color={C.blue} rotate={-4} />
      </Panel>
    </>
  );
}
