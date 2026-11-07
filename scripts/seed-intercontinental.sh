#!/usr/bin/env bash
# Intercontinental lines: six long-distance routes joining the continents, four of them through
# South America, by way of (imagined) tunnels under the Darién Gap, the Atlantic, the Southern
# Ocean, the Bering Strait and the Pacific. Each runs through stations from the Nexus seeds and
# new ones, with a fast train on each. Run after seed-nexus.sh and seed-routes.sh.
#
# Usage:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-intercontinental.sh
#   ADMIN_TOKEN=eyJ… ./scripts/seed-intercontinental.sh
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
if jq -e 'any(.[]; .name == "Buenos Aires Retiro")' >/dev/null <<<"$ALL_STOPS"; then
  echo "The intercontinental lines are already there (found Buenos Aires Retiro). Nothing to do." >&2
  exit 1
fi

# ---------- stations from the earlier seeds, by key ----------
declare -A STOP
while IFS=$'\t' read -r key name; do
  STOP[$key]=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id' <<<"$ALL_STOPS")
  [ -n "${STOP[$key]}" ] || { echo "Missing station \"$name\": run seed-nexus.sh and seed-routes.sh first." >&2; exit 1; }
done <<'TSV'
NYC	New York Central Terminal
BOS	Boston South Station
LAX	Los Angeles Union Terminal
MEX	Mexico City Central Station
SEA	Seattle King Street
VAN	Vancouver Pacific Terminal
LON	London King's Cross
PAR	Paris Gare du Nord
MAD	Madrid Atocha
PEK	Beijing West Station
CPT	Cape Town Central
JNB	Johannesburg Park Station
SYD	Sydney Central Station
TSV

# ---------- new stations ----------
while IFS=$'\t' read -r key json; do
  STOP[$key]=$(api POST /stop "{\"stop\":$json}" | id)
done < <(jq -r '.[] | [.key, ({name, country, coordinates: {lat: .lat, lng: .lng}, dwellMinutes: .dwell} | tojson)] | @tsv' <<'JSON'
[
  {"key": "PTY", "name": "Panama City Albrook",           "country": "Panama",        "lat": 8.9737,   "lng": -79.5502, "dwell": 20},
  {"key": "BOG", "name": "Bogotá La Sabana",              "country": "Colombia",      "lat": 4.6062,   "lng": -74.0896, "dwell": 30},
  {"key": "UIO", "name": "Quito Chimbacalle",             "country": "Ecuador",       "lat": -0.2416,  "lng": -78.5142, "dwell": 20},
  {"key": "LIM", "name": "Lima Desamparados",             "country": "Peru",          "lat": -12.0453, "lng": -77.0311, "dwell": 30},
  {"key": "LPB", "name": "La Paz Central",                "country": "Bolivia",       "lat": -16.4897, "lng": -68.1193, "dwell": 20},
  {"key": "SCL", "name": "Santiago Estación Central",     "country": "Chile",         "lat": -33.4517, "lng": -70.6800, "dwell": 30},
  {"key": "EZE", "name": "Buenos Aires Retiro",           "country": "Argentina",     "lat": -34.5915, "lng": -58.3746, "dwell": 30},
  {"key": "GRU", "name": "São Paulo Luz",                 "country": "Brazil",        "lat": -23.5347, "lng": -46.6354, "dwell": 30},
  {"key": "GIG", "name": "Rio de Janeiro Central do Brasil", "country": "Brazil",     "lat": -22.9035, "lng": -43.1910, "dwell": 30},
  {"key": "REC", "name": "Recife Central",                "country": "Brazil",        "lat": -8.0663,  "lng": -34.8901, "dwell": 20},
  {"key": "DKR", "name": "Dakar Central",                 "country": "Senegal",       "lat": 14.6721,  "lng": -17.4300, "dwell": 20},
  {"key": "CMN", "name": "Casablanca Casa-Voyageurs",     "country": "Morocco",       "lat": 33.5899,  "lng": -7.5911,  "dwell": 20},
  {"key": "PER", "name": "Perth Central",                 "country": "Australia",     "lat": -31.9512, "lng": 115.8597, "dwell": 20},
  {"key": "ADL", "name": "Adelaide Parklands",            "country": "Australia",     "lat": -34.9206, "lng": 138.5868, "dwell": 20},
  {"key": "MEL", "name": "Melbourne Southern Cross",      "country": "Australia",     "lat": -37.8183, "lng": 144.9525, "dwell": 20},
  {"key": "YHZ", "name": "Halifax Central",               "country": "Canada",        "lat": 44.6418,  "lng": -63.5728, "dwell": 20},
  {"key": "YYT", "name": "St. John's Central",            "country": "Canada",        "lat": 47.5615,  "lng": -52.7126, "dwell": 20},
  {"key": "KEF", "name": "Reykjavík Central",             "country": "Iceland",       "lat": 64.1466,  "lng": -21.9426, "dwell": 20},
  {"key": "DUB", "name": "Dublin Heuston",                "country": "Ireland",       "lat": 53.3464,  "lng": -6.2925,  "dwell": 20},
  {"key": "ANC", "name": "Anchorage Central",             "country": "USA",           "lat": 61.2181,  "lng": -149.9003, "dwell": 20},
  {"key": "DYR", "name": "Anadyr Central",                "country": "Russia",        "lat": 64.7337,  "lng": 177.5089, "dwell": 20},
  {"key": "YKS", "name": "Yakutsk Central",               "country": "Russia",        "lat": 62.0355,  "lng": 129.6755, "dwell": 20},
  {"key": "IKT", "name": "Irkutsk Passazhirsky",          "country": "Russia",        "lat": 52.2830,  "lng": 104.2560, "dwell": 30},
  {"key": "ULN", "name": "Ulaanbaatar Central",           "country": "Mongolia",      "lat": 47.9037,  "lng": 106.8858, "dwell": 20},
  {"key": "IPC", "name": "Hanga Roa",                     "country": "Chile",         "lat": -27.1500, "lng": -109.4333, "dwell": 20},
  {"key": "PPT", "name": "Papeete Central",               "country": "French Polynesia", "lat": -17.5350, "lng": -149.5696, "dwell": 20},
  {"key": "AKL", "name": "Auckland Britomart",            "country": "New Zealand",   "lat": -36.8443, "lng": 174.7676, "dwell": 20}
]
JSON
)
echo "Created 27 stations"

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
route N17 "Nexus-17: Pan-American Express"       LAX MEX PTY BOG UIO LIM LPB SCL EZE
route N18 "Nexus-18: South Atlantic Tunnel"       EZE GRU GIG REC DKR CMN MAD PAR
route N19 "Nexus-19: Southern Cross"              SCL EZE CPT JNB PER ADL MEL SYD
route N20 "Nexus-20: Pacific Islands Express"     LIM SCL IPC PPT AKL SYD
route N21 "Nexus-21: North Atlantic Bridge"       NYC BOS YHZ YYT KEF DUB LON
route N22 "Nexus-22: Bering Link"                 SEA VAN ANC DYR YKS IKT ULN PEK

# ---------- a train on each line ----------
# Ocean crossings are evacuated-tube maglev, so the intercontinental expresses are fast.
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
start N17 "Condor-1"     320 3 0.4   # in the Andes, Bogotá to Quito
start N18 "Equator-2"    600 3 0.5   # under the Atlantic, Recife to Dakar
start N19 "Albatross-3"  550 1 0.6   # under the South Atlantic, Buenos Aires to Cape Town
start N20 "Kon-Tiki-4"   600 0 0     # waiting at Lima
start N21 "Viking-5"     550 3 0.3   # leaving St. John's for Reykjavík
start N22 "Polaris-6"    450 2 0.5   # under the Bering Strait, Anchorage to Anadyr

echo "Done: 6 intercontinental lines and 6 trains added to $BASE_URL."
