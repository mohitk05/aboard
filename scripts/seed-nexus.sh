#!/usr/bin/env bash
# Seed the "Nexus network" (ported from the old MongoDB seed script) through the Aboard API.
#
# Usage:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-nexus.sh
#   ADMIN_TOKEN=eyJ… ./scripts/seed-nexus.sh                  # or use a token you already have
#
# Options (environment variables):
#   BASE_URL       where Aboard runs (default: https://aboard.karekar-mohit.workers.dev)
#   SEED_PASSWORD  password for all seeded travellers (default: a random one, printed at the end)
#   SPEED_KMH      average train speed (default: 60, the game's real-world pace)
#
# Needs curl and jq. Run it once: it stops if the Nexus stations already exist. (It doesn't
# delete anything, unlike the old script, which dropped the whole database.)
#
# Differences from the old script, because the new backend checks more:
#   - Nexus-6 used to loop back to Los Angeles; a line can't visit a station twice, so it ends
#     in Sydney.
#   - Interest images were bare file names; images must be URLs, so they're left out.
#   - Travellers get a real password (SEED_PASSWORD) instead of "hashed_password_N".
#   - alex_chen was an admin; here everyone is a player (you already have an admin).
#   - Fares are worked out from distance, not copied.
#   - Trains mid-journey are placed with POST /api/trip/:id/position, after their passengers
#     board at the station they boarded from.
#   - The old script contradicted itself in places; this follows its comments:
#       * Horizon-5 left Moscow 20 hours ago (the old stop index pointed at Dubai).
#       * james_morrison waits at London without a ticket (the old ticket was never assigned
#         to him, and was for a train that had already left).
#       * mei_lin's train (Meridian-3) left Mumbai 18 hours ago, so she takes Meridian-6, which
#         is at the Mumbai platform, and boards it straight away.
set -euo pipefail

BASE_URL="${BASE_URL:-https://aboard.karekar-mohit.workers.dev}"
API="${BASE_URL%/}/api"
SPEED_KMH="${SPEED_KMH:-60}"
SEED_PASSWORD="${SEED_PASSWORD:-$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)}"

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "This script needs $bin." >&2; exit 1; }
done
if [ "${#SEED_PASSWORD}" -lt 8 ]; then echo "SEED_PASSWORD must be at least 8 characters." >&2; exit 1; fi

# ---------- API helper ----------
# api METHOD PATH [JSON_BODY] [TOKEN] → prints the response's .data (compact JSON), or exits.
api() {
  local method=$1 path=$2 body=${3:-} token=${4:-${ADMIN_TOKEN:-}}
  local args=(-sS -X "$method" "$API$path" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(--data "$body")
  local resp
  resp=$(curl "${args[@]}") || { echo "✗ $method $path: request failed" >&2; exit 1; }
  if [ "$(jq -r '.success // false' <<<"$resp" 2>/dev/null)" != "true" ]; then
    echo "✗ $method $path: $(jq -r '.error // .' <<<"$resp" 2>/dev/null || echo "$resp")" >&2
    exit 1
  fi
  jq -c '.data' <<<"$resp"
}
id() { jq -r '.id'; }
km() { echo $((SPEED_KMH * $1)); } # distance covered in $1 hours

# ---------- admin login ----------
if [ -z "${ADMIN_TOKEN:-}" ]; then
  : "${ADMIN_EMAIL:?Set ADMIN_EMAIL and ADMIN_PASSWORD, or ADMIN_TOKEN}"
  : "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
  ADMIN_TOKEN=$(api POST /user/login "$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{user: {email: $e, password: $p}}')" "" | jq -r '.authToken')
fi
[ "$(api GET /user/me | jq -r '.role')" = "1" ] || { echo "That account isn't an admin." >&2; exit 1; }
echo "Signed in as admin on $BASE_URL"

if api GET /stop "" | jq -e 'any(.[]; .name == "New York Central Terminal")' >/dev/null; then
  echo "The Nexus network is already there (found New York Central Terminal). Nothing to do." >&2
  exit 1
fi

# ---------- stations ----------
declare -A STOP
while IFS=$'\t' read -r key json; do
  STOP[$key]=$(api POST /stop "{\"stop\":$json}" | id)
done < <(jq -r '.[] | [.key, ({name, country, coordinates: {lat: .lat, lng: .lng}} | tojson)] | @tsv' <<'JSON'
[
  {"key": "NYC", "name": "New York Central Terminal",    "country": "USA",            "lat": 40.7527,  "lng": -73.9772},
  {"key": "CHI", "name": "Chicago Grand Central",        "country": "USA",            "lat": 41.8781,  "lng": -87.6298},
  {"key": "DEN", "name": "Denver Central Terminal",      "country": "USA",            "lat": 39.7526,  "lng": -104.9968},
  {"key": "LAX", "name": "Los Angeles Union Terminal",   "country": "USA",            "lat": 34.0564,  "lng": -118.2345},
  {"key": "VAN", "name": "Vancouver Pacific Terminal",   "country": "Canada",         "lat": 49.2827,  "lng": -123.1207},
  {"key": "MEX", "name": "Mexico City Central Station",  "country": "Mexico",         "lat": 19.4326,  "lng": -99.1332},
  {"key": "LON", "name": "London King's Cross",          "country": "United Kingdom", "lat": 51.5308,  "lng": -0.1185},
  {"key": "PAR", "name": "Paris Gare du Nord",           "country": "France",         "lat": 48.8861,  "lng": 2.3555},
  {"key": "BER", "name": "Berlin Hauptbahnhof",          "country": "Germany",        "lat": 52.5255,  "lng": 13.3675},
  {"key": "MOW", "name": "Moscow Belorussky Station",    "country": "Russia",         "lat": 55.7745,  "lng": 37.6149},
  {"key": "IST", "name": "Istanbul Central Terminal",    "country": "Turkey",         "lat": 41.0073,  "lng": 28.9784},
  {"key": "DXB", "name": "Dubai Central Station",        "country": "UAE",            "lat": 25.2524,  "lng": 55.2707},
  {"key": "BOM", "name": "Mumbai Terminus",              "country": "India",          "lat": 18.9620,  "lng": 72.8194},
  {"key": "DEL", "name": "New Delhi Central",            "country": "India",          "lat": 28.6353,  "lng": 77.2250},
  {"key": "BKK", "name": "Bangkok Grand Central",        "country": "Thailand",       "lat": 13.7563,  "lng": 100.5018},
  {"key": "PEK", "name": "Beijing West Station",         "country": "China",          "lat": 39.8949,  "lng": 116.2388},
  {"key": "SHA", "name": "Shanghai Hongqiao Station",    "country": "China",          "lat": 31.1429,  "lng": 121.4218},
  {"key": "TYO", "name": "Tokyo Central Station",        "country": "Japan",          "lat": 35.6762,  "lng": 139.7674},
  {"key": "SYD", "name": "Sydney Central Station",       "country": "Australia",      "lat": -33.8715, "lng": 151.2093},
  {"key": "CAI", "name": "Cairo Ramses Railway Station", "country": "Egypt",          "lat": 30.0444,  "lng": 31.2357},
  {"key": "JNB", "name": "Johannesburg Park Station",    "country": "South Africa",   "lat": -26.1928, "lng": 28.2426}
]
JSON
)
echo "Created ${#STOP[@]} stations"

# ---------- lines ----------
declare -A ROUTE
route() { # route KEY "Name" STOP_KEY...
  local key=$1 name=$2; shift 2
  local ids=()
  for s in "$@"; do ids+=("${STOP[$s]}"); done
  local body
  body=$(jq -nc --arg n "$name" '{route: {name: $n, stops: $ARGS.positional}}' --args "${ids[@]}")
  local r; r=$(api POST /route "$body")
  ROUTE[$key]=$(id <<<"$r")
  printf '  %-34s %6s km\n' "$name" "$(jq -r '.totalKm | floor' <<<"$r")"
}
echo "Lines:"
route N1 "Nexus-1: Americas Corridor"      MEX NYC CHI DEN LAX VAN
route N2 "Nexus-2: Eurasia Bridge"         LON PAR BER MOW DXB PEK TYO
route N3 "Nexus-3: Indo-Pacific Traverse"  BOM DEL BKK SHA TYO SYD
route N4 "Nexus-4: Trans-African Span"     CAI JNB
route N5 "Nexus-5: Afro-European Link"     CAI IST PAR LON
route N6 "Nexus-6: Pacific Ring"           LAX VAN TYO SYD

# ---------- trains ----------
declare -A VEHICLE
for name in Apex-7 Apex-12 Horizon-5 Horizon-8 Meridian-3 Meridian-6; do
  VEHICLE[$name]=$(api POST /vehicle "$(jq -nc --arg n "$name" '{vehicle: {name: $n}}')" | id)
done
echo "Created ${#VEHICLE[@]} trains"

# ---------- interests ----------
declare -A INTEREST
while IFS=$'\t' read -r key json; do
  INTEREST[$key]=$(api POST /interest "{\"interest\":$json}" | id)
done < <(jq -r '.[] | [.key, ({name, description} | tojson)] | @tsv' <<'JSON'
[
  {"key": "tech",    "name": "Technology & Innovation", "description": "Software developers, engineers, and tech entrepreneurs"},
  {"key": "photo",   "name": "Photography",             "description": "Photography enthusiasts and landscape photographers"},
  {"key": "lit",     "name": "Literature",              "description": "Book lovers and aspiring writers"},
  {"key": "travel",  "name": "World Travel",            "description": "Backpackers, adventurers, and travel bloggers"},
  {"key": "biz",     "name": "Business & Networking",   "description": "Entrepreneurs and business professionals"},
  {"key": "arts",    "name": "Music & Arts",            "description": "Musicians, artists, and creative professionals"}
]
JSON
)
echo "Created ${#INTEREST[@]} interests"

# ---------- travellers ----------
declare -A USER_ID USER_TOKEN
traveller() { # traveller USERNAME EMAIL AGE STOP_KEY PUBLIC|PRIVATE INTEREST_KEY...
  local u=$1 email=$2 age=$3 stop=$4 mode=$5; shift 5
  local ints=()
  for i in "$@"; do ints+=("${INTEREST[$i]}"); done
  local body
  body=$(jq -nc --arg u "$u" --arg e "$email" --arg p "$SEED_PASSWORD" --argjson a "$age" --arg s "${STOP[$stop]}" --arg m "$mode" \
    '{user: {username: $u, email: $e, password: $p, age: $a, currentStop: $s, profileMode: $m, interests: $ARGS.positional}}' \
    --args "${ints[@]}")
  USER_ID[$u]=$(api POST /user "$body" | id)
  USER_TOKEN[$u]=$(api POST /user/login "$(jq -nc --arg e "$email" --arg p "$SEED_PASSWORD" '{user: {email: $e, password: $p}}')" "" | jq -r '.authToken')
}
# Everyone starts where they board (or wait); trains are moved on afterwards.
traveller alex_chen      alex@example.com      32 NYC PUBLIC  tech biz
traveller emma_rodriguez emma@example.com      29 NYC PUBLIC  photo travel
traveller yuki_tanaka    yuki@example.com      25 LAX PUBLIC  tech photo
traveller isabella_rossi isabella@example.com  38 LON PUBLIC  lit arts
traveller james_morrison james@example.com     44 LON PRIVATE travel arts
traveller pradeep_kumar  pradeep@example.com   31 BOM PUBLIC  tech biz
traveller mei_lin        mei@example.com       27 BOM PUBLIC  lit travel
traveller zahra_hassan   zahra@example.com     35 CAI PUBLIC  photo travel
echo "Created ${#USER_ID[@]} travellers"

# ---------- journeys ----------
declare -A TRIP
trip() { # trip KEY ROUTE_KEY VEHICLE — starts at the first station of the line
  TRIP[$1]=$(api POST /trip "$(jq -nc --arg r "${ROUTE[$2]}" --arg v "${VEHICLE[$3]}" --argjson s "$SPEED_KMH" \
    '{trip: {route: $r, vehicle: $v, speedKmh: $s, active: true}}')" | id)
}
place() { # place TRIP_KEY STOP_INDEX KM
  api POST "/trip/${TRIP[$1]}/position" "$(jq -nc --argjson i "$2" --argjson k "$3" '{stopIndex: $i, km: $k}')" >/dev/null
}
ticket() { # ticket USERNAME TRIP_KEY FROM TO → prints the traveller's state afterwards
  api POST /ticket/buy "$(jq -nc --arg t "${TRIP[$2]}" --arg f "${STOP[$3]}" --arg to "${STOP[$4]}" '{ticket: {trip: $t, from: $f, to: $to}}')" \
    "${USER_TOKEN[$1]}" >/dev/null
  printf '  %-15s %s → %s on %s: %s\n' "$1" "$3" "$4" "$2" "$(api GET /user/me "" "${USER_TOKEN[$1]}" | jq -r '.state')"
}

trip apex7  N1 Apex-7
trip apex12 N1 Apex-12        # waits at Mexico City
trip hor5   N2 Horizon-5
trip hor8   N2 Horizon-8      # waits at London
trip mer3   N3 Meridian-3
trip mer6   N3 Meridian-6     # waits at Mumbai
echo "Created ${#TRIP[@]} journeys. Tickets:"

# Apex-7 (Nexus-1): Emma boards at New York, then the train is 12 h past Denver.
place apex7 1 0
ticket emma_rodriguez apex7 NYC VAN
place apex7 3 "$(km 12)"
ticket yuki_tanaka apex7 LAX VAN        # waiting at Los Angeles for it

# Horizon-5 (Nexus-2): Isabella boards at London; the train left Moscow 20 h ago.
ticket isabella_rossi hor5 LON TYO
place hor5 3 "$(km 20)"

# Meridian-3 (Nexus-3): Pradeep boards at Mumbai; the train left Shanghai 18 h ago.
ticket pradeep_kumar mer3 BOM SYD
place mer3 3 "$(km 18)"

# Meridian-6 is at the Mumbai platform, so Mei boards straight away.
ticket mei_lin mer6 BOM SYD

# ---------- conversations ----------
say() { # say FROM CONVERSATION_ID TITLE BODY
  api POST "/conversation/$2/messages" "$(jq -nc --arg t "$3" --arg b "$4" '{message: {title: $t, body: $b}}')" "${USER_TOKEN[$1]}" >/dev/null
}
chat() { # chat A B → conversation id
  api POST /conversation "$(jq -nc --arg m "${USER_ID[$2]}" '{conversation: {members: [$m]}}')" "${USER_TOKEN[$1]}" | id
}

c1=$(chat emma_rodriguez yuki_tanaka)
say emma_rodriguez "$c1" "Crossing the continent on Nexus-1" \
  "The photography opportunities on this journey are incredible! We're crossing 3 countries and I've never seen anything like this."
say yuki_tanaka "$c1" "Re: Crossing the continent on Nexus-1" \
  "Absolutely! This is my first trans-continental journey. I'm heading to Vancouver for a tech conference. Where are you headed?"

c2=$(chat isabella_rossi james_morrison)
say isabella_rossi "$c2" "The longest train ride of my life" \
  "Nexus-2 is extraordinary. I'm writing about this journey from London all the way to Tokyo. The artistic inspiration is endless!"
say james_morrison "$c2" "Re: The longest train ride of my life" \
  "I'm looking forward to boarding. I heard Istanbul to Tokyo is a legendary route. Are you documenting everything for a book?"

c3=$(chat pradeep_kumar mei_lin)
say pradeep_kumar "$c3" "From Mumbai to Sydney on Nexus-3" \
  "This journey connects Asia and Australia. I'm attending tech summits in multiple cities. The innovation ecosystem across this route is fascinating!"
say mei_lin "$c3" "Re: From Mumbai to Sydney on Nexus-3" \
  "I'm researching stories across cultures for my novel. This is the perfect journey to understand different perspectives from coast to coast."
echo "Created 3 conversations, 6 messages"

cat <<EOF

✓ The Nexus network is running on $BASE_URL

  Stations ${#STOP[@]} · Lines ${#ROUTE[@]} · Trains ${#VEHICLE[@]} · Journeys ${#TRIP[@]} · Travellers ${#USER_ID[@]} · Interests ${#INTEREST[@]}

  Nexus-1  Mexico City → New York → Chicago → Denver → Los Angeles → Vancouver
  Nexus-2  London → Paris → Berlin → Moscow → Dubai → Beijing → Tokyo
  Nexus-3  Mumbai → Delhi → Bangkok → Shanghai → Tokyo → Sydney
  Nexus-4  Cairo → Johannesburg
  Nexus-5  Cairo → Istanbul → Paris → London
  Nexus-6  Los Angeles → Vancouver → Tokyo → Sydney

  Every traveller (alex@example.com, emma@example.com, …) logs in with:
    password: $SEED_PASSWORD

In a world without air travel, only trains connect humanity. Welcome aboard.
EOF
