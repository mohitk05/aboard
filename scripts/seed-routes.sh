#!/usr/bin/env bash
# Grow the Nexus network: 10 new lines, each running through 3 existing Nexus stations and
# 4–6 new ones, with a train on each. Run after seed-nexus.sh.
#
# Usage:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-routes.sh
#   ADMIN_TOKEN=eyJ… ./scripts/seed-routes.sh
#
# Options: BASE_URL (default https://aboard.karekar-mohit.workers.dev).
# Needs curl and jq. Run it once: it stops if the new stations already exist.
set -euo pipefail

BASE_URL="${BASE_URL:-https://aboard.karekar-mohit.workers.dev}"
API="${BASE_URL%/}/api"
for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "This script needs $bin." >&2; exit 1; }
done

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

if [ -z "${ADMIN_TOKEN:-}" ]; then
  : "${ADMIN_EMAIL:?Set ADMIN_EMAIL and ADMIN_PASSWORD, or ADMIN_TOKEN}"
  : "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
  ADMIN_TOKEN=$(api POST /user/login "$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{user: {email: $e, password: $p}}')" "" | jq -r '.authToken')
fi
[ "$(api GET /user/me | jq -r '.role')" = "1" ] || { echo "That account isn't an admin." >&2; exit 1; }
echo "Signed in as admin on $BASE_URL"

ALL_STOPS=$(api GET /stop "")
if jq -e 'any(.[]; .name == "Washington Union Station")' >/dev/null <<<"$ALL_STOPS"; then
  echo "The new lines are already there (found Washington Union Station). Nothing to do." >&2
  exit 1
fi

# ---------- existing Nexus stations, by key ----------
declare -A STOP
while IFS=$'\t' read -r key name; do
  STOP[$key]=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id' <<<"$ALL_STOPS")
  [ -n "${STOP[$key]}" ] || { echo "Missing Nexus station \"$name\": run seed-nexus.sh first." >&2; exit 1; }
done <<'TSV'
NYC	New York Central Terminal
CHI	Chicago Grand Central
DEN	Denver Central Terminal
LAX	Los Angeles Union Terminal
VAN	Vancouver Pacific Terminal
MEX	Mexico City Central Station
LON	London King's Cross
PAR	Paris Gare du Nord
BER	Berlin Hauptbahnhof
MOW	Moscow Belorussky Station
IST	Istanbul Central Terminal
DXB	Dubai Central Station
BOM	Mumbai Terminus
DEL	New Delhi Central
BKK	Bangkok Grand Central
PEK	Beijing West Station
SHA	Shanghai Hongqiao Station
TYO	Tokyo Central Station
SYD	Sydney Central Station
CAI	Cairo Ramses Railway Station
JNB	Johannesburg Park Station
TSV

# ---------- new stations ----------
# Big interchanges wait longer (dwell minutes).
while IFS=$'\t' read -r key json; do
  STOP[$key]=$(api POST /stop "{\"stop\":$json}" | id)
done < <(jq -r '.[] | [.key, ({name, country, coordinates: {lat: .lat, lng: .lng}, dwellMinutes: .dwell} | tojson)] | @tsv' <<'JSON'
[
  {"key": "WAS", "name": "Washington Union Station",      "country": "USA",          "lat": 38.8973,  "lng": -77.0063, "dwell": 30},
  {"key": "BOS", "name": "Boston South Station",          "country": "USA",          "lat": 42.3523,  "lng": -71.0552, "dwell": 20},
  {"key": "YUL", "name": "Montréal Gare Centrale",        "country": "Canada",       "lat": 45.4997,  "lng": -73.5665, "dwell": 20},
  {"key": "YYZ", "name": "Toronto Union Station",         "country": "Canada",       "lat": 43.6453,  "lng": -79.3806, "dwell": 30},
  {"key": "HOU", "name": "Houston Central",               "country": "USA",          "lat": 29.7604,  "lng": -95.3698, "dwell": 20},
  {"key": "DAL", "name": "Dallas Union Station",          "country": "USA",          "lat": 32.7757,  "lng": -96.8089, "dwell": 20},
  {"key": "SLC", "name": "Salt Lake City Central",        "country": "USA",          "lat": 40.7608,  "lng": -111.8910, "dwell": 20},
  {"key": "SFO", "name": "San Francisco Transbay",        "country": "USA",          "lat": 37.7897,  "lng": -122.3972, "dwell": 30},
  {"key": "SEA", "name": "Seattle King Street",           "country": "USA",          "lat": 47.5983,  "lng": -122.3299, "dwell": 20},
  {"key": "AMS", "name": "Amsterdam Centraal",            "country": "Netherlands",  "lat": 52.3791,  "lng": 4.9003,   "dwell": 20},
  {"key": "CPH", "name": "Copenhagen Central",            "country": "Denmark",      "lat": 55.6727,  "lng": 12.5644,  "dwell": 20},
  {"key": "STO", "name": "Stockholm Central",             "country": "Sweden",       "lat": 59.3303,  "lng": 18.0586,  "dwell": 20},
  {"key": "HEL", "name": "Helsinki Central",              "country": "Finland",      "lat": 60.1719,  "lng": 24.9414,  "dwell": 20},
  {"key": "LED", "name": "Saint Petersburg Moskovsky",    "country": "Russia",       "lat": 59.9298,  "lng": 30.3622,  "dwell": 30},
  {"key": "LYS", "name": "Lyon Part-Dieu",                "country": "France",       "lat": 45.7606,  "lng": 4.8593,   "dwell": 20},
  {"key": "MIL", "name": "Milano Centrale",               "country": "Italy",        "lat": 45.4862,  "lng": 9.2046,   "dwell": 30},
  {"key": "ROM", "name": "Roma Termini",                  "country": "Italy",        "lat": 41.9010,  "lng": 12.5016,  "dwell": 30},
  {"key": "ATH", "name": "Athens Central",                "country": "Greece",       "lat": 37.9922,  "lng": 23.7211,  "dwell": 20},
  {"key": "LIS", "name": "Lisboa Oriente",                "country": "Portugal",     "lat": 38.7678,  "lng": -9.0990,  "dwell": 20},
  {"key": "MAD", "name": "Madrid Atocha",                 "country": "Spain",        "lat": 40.4066,  "lng": -3.6892,  "dwell": 30},
  {"key": "BCN", "name": "Barcelona Sants",               "country": "Spain",        "lat": 41.3792,  "lng": 2.1404,   "dwell": 20},
  {"key": "BRU", "name": "Brussels Midi",                 "country": "Belgium",      "lat": 50.8357,  "lng": 4.3363,   "dwell": 20},
  {"key": "CGN", "name": "Köln Hauptbahnhof",             "country": "Germany",      "lat": 50.9430,  "lng": 6.9586,   "dwell": 20},
  {"key": "WAW", "name": "Warszawa Centralna",            "country": "Poland",       "lat": 52.2289,  "lng": 21.0031,  "dwell": 20},
  {"key": "ANK", "name": "Ankara Central",                "country": "Turkey",       "lat": 39.9360,  "lng": 32.8436,  "dwell": 20},
  {"key": "THR", "name": "Tehran Central",                "country": "Iran",         "lat": 35.6574,  "lng": 51.4093,  "dwell": 30},
  {"key": "TAS", "name": "Tashkent Central",              "country": "Uzbekistan",   "lat": 41.2925,  "lng": 69.2860,  "dwell": 20},
  {"key": "ALA", "name": "Almaty Central",                "country": "Kazakhstan",   "lat": 43.2732,  "lng": 76.9396,  "dwell": 20},
  {"key": "URC", "name": "Ürümqi South",                  "country": "China",        "lat": 43.7766,  "lng": 87.5940,  "dwell": 20},
  {"key": "XIY", "name": "Xi'an North",                   "country": "China",        "lat": 34.3770,  "lng": 108.9390, "dwell": 20},
  {"key": "JED", "name": "Jeddah Central",                "country": "Saudi Arabia", "lat": 21.5433,  "lng": 39.1728,  "dwell": 20},
  {"key": "RUH", "name": "Riyadh Central",                "country": "Saudi Arabia", "lat": 24.7136,  "lng": 46.6753,  "dwell": 30},
  {"key": "MCT", "name": "Muscat Central",                "country": "Oman",         "lat": 23.5880,  "lng": 58.3829,  "dwell": 20},
  {"key": "KHI", "name": "Karachi City",                  "country": "Pakistan",     "lat": 24.8607,  "lng": 67.0011,  "dwell": 30},
  {"key": "SIN", "name": "Singapore Woodlands",           "country": "Singapore",    "lat": 1.4430,   "lng": 103.7690, "dwell": 30},
  {"key": "KUL", "name": "Kuala Lumpur Sentral",          "country": "Malaysia",     "lat": 3.1340,   "lng": 101.6866, "dwell": 20},
  {"key": "HAN", "name": "Hanoi Central",                 "country": "Vietnam",      "lat": 21.0245,  "lng": 105.8412, "dwell": 20},
  {"key": "HKG", "name": "Hong Kong West Kowloon",        "country": "China",        "lat": 22.3039,  "lng": 114.1660, "dwell": 30},
  {"key": "CAN", "name": "Guangzhou South",               "country": "China",        "lat": 22.9895,  "lng": 113.2690, "dwell": 20},
  {"key": "SHE", "name": "Shenyang North",                "country": "China",        "lat": 41.8209,  "lng": 123.4290, "dwell": 20},
  {"key": "SEL", "name": "Seoul Station",                 "country": "South Korea",  "lat": 37.5547,  "lng": 126.9707, "dwell": 30},
  {"key": "PUS", "name": "Busan Station",                 "country": "South Korea",  "lat": 35.1151,  "lng": 129.0415, "dwell": 20},
  {"key": "FUK", "name": "Fukuoka Hakata",                "country": "Japan",        "lat": 33.5897,  "lng": 130.4207, "dwell": 20},
  {"key": "OSA", "name": "Shin-Osaka",                    "country": "Japan",        "lat": 34.7334,  "lng": 135.5001, "dwell": 20},
  {"key": "CPT", "name": "Cape Town Central",             "country": "South Africa", "lat": -33.9221, "lng": 18.4231,  "dwell": 30},
  {"key": "LUN", "name": "Lusaka Central",                "country": "Zambia",       "lat": -15.4167, "lng": 28.2833,  "dwell": 20},
  {"key": "DAR", "name": "Dar es Salaam Central",         "country": "Tanzania",     "lat": -6.8160,  "lng": 39.2803,  "dwell": 20},
  {"key": "NBO", "name": "Nairobi Terminus",              "country": "Kenya",        "lat": -1.3192,  "lng": 36.8219,  "dwell": 30},
  {"key": "ADD", "name": "Addis Ababa Lebu",              "country": "Ethiopia",     "lat": 8.9806,   "lng": 38.7578,  "dwell": 20},
  {"key": "KRT", "name": "Khartoum Central",              "country": "Sudan",        "lat": 15.5007,  "lng": 32.5599,  "dwell": 20}
]
JSON
)
echo "Created 50 stations"

# ---------- lines ----------
declare -A ROUTE ROUTE_JSON
route() { # route KEY "Name" STOP_KEY...
  local key=$1 name=$2; shift 2
  local ids=()
  for s in "$@"; do ids+=("${STOP[$s]}"); done
  ROUTE_JSON[$key]=$(api POST /route "$(jq -nc --arg n "$name" '{route: {name: $n, stops: $ARGS.positional}}' --args "${ids[@]}")")
  ROUTE[$key]=$(id <<<"${ROUTE_JSON[$key]}")
  echo "  $name: $(jq -r '[.stops[].name] | join(" → ")' <<<"${ROUTE_JSON[$key]}") ($(jq -r '.totalKm | floor' <<<"${ROUTE_JSON[$key]}") km)"
}
# Each line runs through 3 existing Nexus stations (NYC, CHI, DEN, … from the list above).
route N7  "Nexus-7: Great Lakes Express"          WAS NYC BOS YUL YYZ CHI DEN
route N8  "Nexus-8: Gulf to Pacific Northwest"    MEX HOU DAL DEN SLC SFO SEA VAN
route N9  "Nexus-9: Baltic Circle"                LON AMS BER CPH STO HEL LED MOW
route N10 "Nexus-10: Mediterranean Arc"           PAR LYS MIL ROM ATH IST CAI
route N11 "Nexus-11: Atlantic to Volga"           LIS MAD BCN PAR BRU CGN BER WAW MOW
route N12 "Nexus-12: Silk Road"                   IST ANK THR TAS ALA URC XIY PEK SHA
route N13 "Nexus-13: Arabian Sea Line"            CAI JED RUH DXB MCT KHI BOM
route N14 "Nexus-14: Straits to the Capital"      SIN KUL BKK HAN HKG CAN SHA PEK
route N15 "Nexus-15: Yellow Sea Link"             SHA PEK SHE SEL PUS FUK OSA TYO
route N16 "Nexus-16: Cape to Bosphorus"           CPT JNB LUN DAR NBO ADD KRT CAI IST

# ---------- a train on each line ----------
# Speeds assume railways a little ahead of today's: maglev 450–500, high speed 300–350,
# mountain and desert lines slower, sleepers 160–200.
start() { # start ROUTE_KEY "Train name" SPEED_KMH STOP_INDEX FRACTION — FRACTION of the way to the next station
  local route=$1 name=$2 speed=$3 at=$4 frac=$5
  local vehicle trip seg km
  vehicle=$(api POST /vehicle "$(jq -nc --arg n "$name" '{vehicle: {name: $n}}')" | id)
  trip=$(api POST /trip "$(jq -nc --arg r "${ROUTE[$route]}" --arg v "$vehicle" --argjson s "$speed" \
    '{trip: {route: $r, vehicle: $v, speedKmh: $s, active: true}}')" | id)
  if [ "$at" != 0 ] || [ "$frac" != 0 ]; then
    seg=$(jq -r --argjson i "$((at + 1))" '.stops[$i].kmFromPrevious' <<<"${ROUTE_JSON[$route]}")
    km=$(jq -n --argjson s "$seg" --argjson f "$frac" '($s * $f * 10 | floor) / 10')
    api POST "/trip/$trip/position" "$(jq -nc --argjson i "$at" --argjson k "$km" '{stopIndex: $i, km: $k}')" >/dev/null
  fi
  echo "  $name ($speed km/h) on ${route}"
}
start N7  "Laurentian-1"  320 0 0     # waiting at Washington
start N8  "Cascadia-4"    350 2 0.5   # between Dallas and Denver
start N9  "Aurora-2"      300 3 0.3   # leaving Copenhagen
start N10 "Riviera-9"     300 1 0.6   # in the Alps, Lyon to Milan
start N11 "Volga-Atlantic" 180 0 0    # night sleeper, waiting at Lisbon
start N12 "Caravan-3"     450 3 0.4   # maglev across the steppe, Tashkent to Almaty
start N13 "Dhow-5"        280 2 0.7   # through the desert, Riyadh to Dubai
start N14 "Monsoon-6"     320 2 0     # at the Bangkok platform
start N15 "Tsushima-1"    500 4 0.5   # under the strait, Busan to Fukuoka
start N16 "Kilimanjaro-7" 200 3 0.2   # leaving Dar es Salaam

echo "Done: 10 lines and 10 trains added to $BASE_URL."
