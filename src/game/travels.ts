// Travel records and badges: where a player has been (stations they stood at, not ones their train
// passed through), the lines they've ridden, and how far. Pure: the World counts, this judges.

export type Region = "Europe" | "Africa" | "Middle East" | "Asia" | "Oceania" | "North America" | "South America";
export const REGIONS: Region[] = ["Europe", "Africa", "Middle East", "Asia", "Oceania", "North America", "South America"];

const BY_COUNTRY: Record<string, Region> = {
  // Europe
  Portugal: "Europe", Spain: "Europe", France: "Europe", Germany: "Europe", Poland: "Europe", Italy: "Europe",
  Netherlands: "Europe", Belgium: "Europe", "United Kingdom": "Europe", Ireland: "Europe", Iceland: "Europe",
  Denmark: "Europe", Sweden: "Europe", Finland: "Europe", Greece: "Europe", Turkey: "Europe", Norway: "Europe",
  Austria: "Europe", Switzerland: "Europe", "Czech Republic": "Europe", Czechia: "Europe", Hungary: "Europe",
  // Africa
  Morocco: "Africa", Senegal: "Africa", Egypt: "Africa", Sudan: "Africa", Ethiopia: "Africa", Kenya: "Africa",
  Tanzania: "Africa", Zambia: "Africa", "South Africa": "Africa", Nigeria: "Africa", Ghana: "Africa", Algeria: "Africa",
  // Middle East
  UAE: "Middle East", "United Arab Emirates": "Middle East", "Saudi Arabia": "Middle East", Oman: "Middle East",
  Iran: "Middle East", Iraq: "Middle East", Jordan: "Middle East", Israel: "Middle East", Qatar: "Middle East",
  // Asia
  China: "Asia", Japan: "Asia", "South Korea": "Asia", India: "Asia", Pakistan: "Asia", Thailand: "Asia",
  Vietnam: "Asia", Malaysia: "Asia", Singapore: "Asia", Mongolia: "Asia", Kazakhstan: "Asia", Uzbekistan: "Asia",
  Indonesia: "Asia", Bangladesh: "Asia", Nepal: "Asia",
  // Oceania
  Australia: "Oceania", "New Zealand": "Oceania", "French Polynesia": "Oceania", Fiji: "Oceania",
  // The Americas
  USA: "North America", "United States": "North America", Canada: "North America", Mexico: "North America",
  Panama: "North America", Cuba: "North America", Guatemala: "North America",
  Colombia: "South America", Ecuador: "South America", Peru: "South America", Bolivia: "South America",
  Chile: "South America", Argentina: "South America", Brazil: "South America", Venezuela: "South America",
  Uruguay: "South America", Paraguay: "South America",
};

/** The region a station is in. Russia spans two: west of the Urals (60°E) is Europe. */
export function regionOf(country: string, lng: number): Region | null {
  if (country === "Russia") return lng < 60 ? "Europe" : "Asia";
  return BY_COUNTRY[country] ?? null;
}

/** Traveller levels, by how many places you've been to. */
export const LEVELS = [
  { name: "Newcomer", places: 0 },
  { name: "Day-tripper", places: 3 },
  { name: "Wayfarer", places: 6 },
  { name: "Voyager", places: 12 },
  { name: "Globetrotter", places: 25 },
  { name: "Rail Legend", places: 50 },
] as const;
export type LevelName = (typeof LEVELS)[number]["name"];

export function levelFor(places: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && places >= LEVELS[i + 1]!.places) i++;
  const next = LEVELS[i + 1];
  return { name: LEVELS[i]!.name as LevelName, rank: i + 1, next: next ? { name: next.name as LevelName, places: next.places } : null };
}

export interface TravelStats {
  places: number;
  lines: number;
  km: number;
  /** Places been to in each region. */
  regions: Partial<Record<Region, number>>;
}

export interface Badge {
  id: string;
  name: string;
  /** What it's for. */
  about: string;
  kind: "area" | "distance" | "lines";
  earned: boolean;
  /** Towards it: how far along, and the goal. */
  progress: { have: number; need: number };
}

const DISTANCES = [
  { id: "km-1000", name: "First thousand", about: "Ride 1,000 km", need: 1_000 },
  { id: "km-10000", name: "Long hauler", about: "Ride 10,000 km", need: 10_000 },
  { id: "km-earth", name: "Around the world", about: "Ride 40,075 km, once round the Equator", need: 40_075 },
  { id: "km-moon", name: "To the Moon", about: "Ride 384,400 km, as far as the Moon", need: 384_400 },
];
const LINES = [
  { id: "lines-5", name: "Line hopper", about: "Ride 5 different lines", need: 5 },
  { id: "lines-15", name: "Line collector", about: "Ride 15 different lines", need: 15 },
  { id: "lines-30", name: "Network master", about: "Ride 30 different lines", need: 30 },
];

/** Every badge, earned or not, with progress towards it. */
export function badgesFor(s: TravelStats): Badge[] {
  const out: Badge[] = REGIONS.map((r) => ({
    id: `region-${r.toLowerCase().replace(/ /g, "-")}`,
    name: r,
    about: `Get off a train somewhere in ${r}`,
    kind: "area" as const,
    earned: (s.regions[r] ?? 0) > 0,
    progress: { have: Math.min(1, s.regions[r] ?? 0), need: 1 },
  }));
  const regions = REGIONS.filter((r) => (s.regions[r] ?? 0) > 0).length;
  out.push({
    id: "region-all",
    name: "Seven regions",
    about: "Get off a train in every region of the world",
    kind: "area",
    earned: regions === REGIONS.length,
    progress: { have: regions, need: REGIONS.length },
  });
  for (const d of DISTANCES)
    out.push({ id: d.id, name: d.name, about: d.about, kind: "distance", earned: s.km >= d.need, progress: { have: Math.min(Math.round(s.km), d.need), need: d.need } });
  for (const l of LINES)
    out.push({ id: l.id, name: l.name, about: l.about, kind: "lines", earned: s.lines >= l.need, progress: { have: Math.min(s.lines, l.need), need: l.need } });
  return out;
}
