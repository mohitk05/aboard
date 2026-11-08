#!/usr/bin/env bash
# Lines out of Berlin, the players' home base: six long-distance lines that start at Berlin
# Hauptbahnhof and run straight out to where the raw materials are and where products sell.
# They use only existing stations (from the earlier seeds). Each line gets two trains, one
# leaving Berlin and one on its way back. Run after seed-nexus.sh, seed-routes.sh and
# seed-intercontinental.sh.
#
# Usage:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-berlin.sh
#   ADMIN_TOKEN=eyJ… ./scripts/seed-berlin.sh
#
# Options: BASE_URL (default https://aboard.karekar-mohit.workers.dev).
# Needs curl and jq. Run it once: it stops if the Berlin lines already exist.
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

if api GET /route "" | jq -e 'any(.[]; .name == "Berlin–São Paulo Express")' >/dev/null; then
  echo "The Berlin lines are already there. Nothing to do." >&2
  exit 1
fi
ALL_STOPS=$(api GET /stop "")

# ---------- stations, by key ----------
declare -A STOP
while IFS=$'\t' read -r key name; do
  STOP[$key]=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id' <<<"$ALL_STOPS")
  [ -n "${STOP[$key]}" ] || { echo "Missing station \"$name\": run the other seed scripts first." >&2; exit 1; }
done <<'TSV'
BER	Berlin Hauptbahnhof
CGN	Köln Hauptbahnhof
BRU	Brussels Midi
PAR	Paris Gare du Nord
MAD	Madrid Atocha
CMN	Casablanca Casa-Voyageurs
DKR	Dakar Central
REC	Recife Central
GIG	Rio de Janeiro Central do Brasil
GRU	São Paulo Luz
WAW	Warszawa Centralna
MOW	Moscow Belorussky Station
TAS	Tashkent Central
ALA	Almaty Central
URC	Ürümqi South
XIY	Xi'an North
PEK	Beijing West Station
SHE	Shenyang North
SEL	Seoul Station
PUS	Busan Station
FUK	Fukuoka Hakata
OSA	Shin-Osaka
TYO	Tokyo Central Station
MIL	Milano Centrale
ROM	Roma Termini
ATH	Athens Central
CAI	Cairo Ramses Railway Station
KRT	Khartoum Central
ADD	Addis Ababa Lebu
NBO	Nairobi Terminus
DAR	Dar es Salaam Central
LUN	Lusaka Central
JNB	Johannesburg Park Station
CPT	Cape Town Central
AMS	Amsterdam Centraal
LON	London King's Cross
DUB	Dublin Heuston
KEF	Reykjavík Central
YYT	St. John's Central
YHZ	Halifax Central
NYC	New York Central Terminal
MEX	Mexico City Central Station
PTY	Panama City Albrook
BOG	Bogotá La Sabana
UIO	Quito Chimbacalle
LIM	Lima Desamparados
LPB	La Paz Central
SCL	Santiago Estación Central
CPH	Copenhagen Central
STO	Stockholm Central
HEL	Helsinki Central
LED	Saint Petersburg Moskovsky
IKT	Irkutsk Passazhirsky
YKS	Yakutsk Central
IST	Istanbul Central Terminal
ANK	Ankara Central
THR	Tehran Central
DXB	Dubai Central Station
MCT	Muscat Central
KHI	Karachi City
BOM	Mumbai Terminus
DEL	New Delhi Central
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
# Chocolate: cocoa (Dakar, São Paulo), sugar (São Paulo), milk (Amsterdam).
route B1 "Berlin–São Paulo Express"  BER CGN BRU PAR MAD CMN DKR REC GIG GRU
# Semiconductors: polysilicon (Ürümqi), graphite (Beijing), photoresist (Tokyo); chips sell in Seoul and Tokyo.
route B2 "Berlin–Tokyo Express"      BER WAW MOW TAS ALA URC XIY PEK SHE SEL PUS FUK OSA TYO
# Batteries: cobalt and copper (Lusaka), on the way down Africa.
route B3 "Berlin–Cape Town Express"  BER MIL ROM ATH CAI KRT ADD NBO DAR LUN JNB CPT
# Lithium (La Paz, Santiago) and copper (Santiago), by way of London and New York.
route B4 "Berlin–Santiago Express"   BER AMS LON DUB KEF YYT YHZ NYC MEX PTY BOG UIO LIM LPB SCL
# Neon (Saint Petersburg) and nickel (Yakutsk), through Scandinavia.
route B5 "Berlin–Yakutsk Express"    BER CPH STO HEL LED MOW IKT YKS
# The Gulf and India: products sell in Dubai.
route B6 "Berlin–Delhi Express"      BER WAW IST ANK THR DXB MCT KHI BOM DEL

# ---------- two trains on each line: one out of Berlin, one coming home ----------
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
back() { # back ROUTE_KEY "Train name" SPEED_KMH STOP_INDEX FRACTION — on the line's return run, towards Berlin
  ROUTE["$1~r"]="${ROUTE[$1]}~r"
  # The return run is the same stations reversed: its stop i is the line's stop n-1-i, whose
  # distance from the previous stop is the line's distance into stop n-i.
  ROUTE_JSON["$1~r"]=$(jq -c '.stops as $s | ($s | length) as $n
    | {stops: [range(0; $n) as $i | {kmFromPrevious: (if $i == 0 then 0 else $s[$n - $i].kmFromPrevious end)}]}' <<<"${ROUTE_JSON[$1]}")
  start "$1~r" "$2" "$3" "$4" "$5"
}
start B1 "Spree-1"     320 0 0     # waiting at Berlin
back  B1 "Spree-2"     320 2 0.5   # under the Atlantic, Recife to Dakar, homeward
start B2 "Kranich-1"   450 0 0     # waiting at Berlin
back  B2 "Kranich-2"   450 6 0.3   # Beijing to Xi'an, homeward
start B3 "Adler-1"     300 1 0.4   # in the Alps, Milan to Rome
back  B3 "Adler-2"     300 2 0.6   # Lusaka to Dar es Salaam, homeward
start B4 "Falke-1"     550 0 0     # waiting at Berlin
back  B4 "Falke-2"     550 1 0.5   # through the Andes, homeward
start B5 "Polarstern-1" 280 2 0.5  # Stockholm to Helsinki
back  B5 "Polarstern-2" 280 1 0.3  # Irkutsk to Moscow, homeward
start B6 "Falke-3"     350 1 0.6   # Warsaw to Istanbul
back  B6 "Falke-4"     350 2 0.2   # Karachi to Muscat, homeward

echo "Done: 6 Berlin lines and 12 trains added to $BASE_URL."
