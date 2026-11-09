#!/usr/bin/env bash
# More lines through Mumbai and Delhi: five lines that each run through Mumbai Terminus, New
# Delhi Central or both, using only existing stations (from the earlier seeds), with a train on
# each. Run after the other seed scripts; then run scripts/fill-trains.mjs to add trains both ways.
#
# Usage:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-india.sh
#   ADMIN_TOKEN=eyJ… ./scripts/seed-india.sh
#
# Options: BASE_URL (default https://aboard.karekar-mohit.workers.dev).
# Needs curl and jq. Run it once: it stops if these lines already exist.
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

if api GET /route "" | jq -e 'any(.[]; .name == "Nexus-23: Indian Ocean Crossing")' >/dev/null; then
  echo "The Mumbai and Delhi lines are already there. Nothing to do." >&2
  exit 1
fi
ALL_STOPS=$(api GET /stop "")

# ---------- stations, by key (all existing) ----------
declare -A STOP
while IFS=$'\t' read -r key name; do
  STOP[$key]=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id' <<<"$ALL_STOPS")
  [ -n "${STOP[$key]}" ] || { echo "Missing station \"$name\": run the other seed scripts first." >&2; exit 1; }
done <<'TSV'
BOM	Mumbai Terminus
DEL	New Delhi Central
NBO	Nairobi Terminus
DAR	Dar es Salaam Central
LUN	Lusaka Central
JNB	Johannesburg Park Station
CPT	Cape Town Central
SIN	Singapore Woodlands
HKG	Hong Kong West Kowloon
SHA	Shanghai Hongqiao Station
PEK	Beijing West Station
SEL	Seoul Station
TAS	Tashkent Central
MOW	Moscow Belorussky Station
LED	Saint Petersburg Moskovsky
HEL	Helsinki Central
URC	Ürümqi South
ULN	Ulaanbaatar Central
IKT	Irkutsk Passazhirsky
YKS	Yakutsk Central
THR	Tehran Central
IST	Istanbul Central Terminal
ATH	Athens Central
ROM	Roma Termini
MIL	Milano Centrale
PAR	Paris Gare du Nord
TSV

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
# Mumbai across the Indian Ocean to East and southern Africa (cobalt and copper at Lusaka).
route N23 "Nexus-23: Indian Ocean Crossing"  BOM NBO DAR LUN JNB CPT
# Mumbai to the Far East by way of the Straits.
route N24 "Nexus-24: Spice Route"            BOM SIN HKG SHA PEK SEL
# Mumbai and Delhi north through Central Asia to Russia and the Baltic (neon at Saint Petersburg).
route N25 "Nexus-25: Frontier Mail"          BOM DEL TAS MOW LED HEL
# Delhi over the roof of the world to Siberia (polysilicon at Ürümqi, nickel at Yakutsk).
route N26 "Nexus-26: Himalayan Express"      DEL URC ULN IKT YKS
# Delhi west along the old trade roads to Europe.
route N27 "Nexus-27: Grand Trunk Road"       DEL THR IST ATH ROM MIL PAR

# ---------- a first train on each line (fill-trains.mjs adds the rest, both ways) ----------
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
start N23 "Zambezi-1"  550 0 0     # waiting at Mumbai
start N24 "Malabar-1"  550 0 0     # waiting at Mumbai
start N25 "Frontier-1" 320 1 0.3   # leaving Delhi for Tashkent
start N26 "Garuda-1"   280 0 0     # waiting at Delhi
start N27 "Sarai-1"    350 0 0     # waiting at Delhi

echo "Done: 5 lines through Mumbai and Delhi added to $BASE_URL. Now run scripts/fill-trains.mjs."
