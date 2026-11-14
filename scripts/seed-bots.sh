#!/usr/bin/env bash
# Turn on the bots: players the World runs itself (src/game/bot.ts). They build businesses the way
# people do, riding out for materials, running factories and selling where it pays.
#
# Marks the travellers from seed-nexus.sh as bots (any that exist), and creates a few new bot
# players, who start at home in Berlin with the usual credits.
#
# Usage:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ./scripts/seed-bots.sh
#   ADMIN_TOKEN=eyJ… ./scripts/seed-bots.sh
#
# Options (environment variables):
#   BASE_URL   where Aboard runs (default: https://aboard.karekar-mohit.workers.dev)
#
# Safe to run again: players that already exist are just (re)marked as bots. To make a bot a
# person again: POST /api/admin/bots {"usernames": ["…"], "bot": false}.
set -euo pipefail

BASE_URL="${BASE_URL:-https://aboard.karekar-mohit.workers.dev}"
API="${BASE_URL%/}/api"

for bin in curl jq openssl; do
  command -v "$bin" >/dev/null || { echo "This script needs $bin." >&2; exit 1; }
done

# api METHOD PATH [JSON_BODY] [TOKEN] → prints the response's .data (compact JSON), or exits.
# With SOFT=1, prints nothing and returns 1 instead of exiting.
api() {
  local method=$1 path=$2 body=${3:-} token=${4:-${ADMIN_TOKEN:-}}
  local args=(-sS -X "$method" "$API$path" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(--data "$body")
  local resp
  resp=$(curl "${args[@]}") || { echo "✗ $method $path: request failed" >&2; exit 1; }
  if [ "$(jq -r '.success // false' <<<"$resp" 2>/dev/null)" != "true" ]; then
    [ "${SOFT:-0}" = 1 ] && return 1
    echo "✗ $method $path: $(jq -r '.error // .' <<<"$resp" 2>/dev/null || echo "$resp")" >&2
    exit 1
  fi
  jq -c '.data' <<<"$resp"
}

# ---------- admin login ----------
if [ -z "${ADMIN_TOKEN:-}" ]; then
  : "${ADMIN_EMAIL:?Set ADMIN_EMAIL and ADMIN_PASSWORD, or ADMIN_TOKEN}"
  : "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
  ADMIN_TOKEN=$(api POST /user/login "$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{user: {email: $e, password: $p}}')" "" | jq -r '.authToken')
fi
[ "$(api GET /user/me | jq -r '.role')" = "1" ] || { echo "That account isn't an admin." >&2; exit 1; }
echo "Signed in as admin on $BASE_URL"

# ---------- new bot players ----------
# Nobody logs in as a bot, so each gets a long random password that isn't kept.
INTERESTS=$(api GET /interest "" | jq -c '[.[].id]')
created=0
while IFS=$'\t' read -r username age; do
  body=$(jq -nc --arg u "$username" --arg e "$username@example.com" --arg p "$(openssl rand -hex 24)" --argjson a "$age" \
    --argjson all "$INTERESTS" \
    '{user: {username: $u, email: $e, password: $p, age: $a, profileMode: "PUBLIC", interests: ($all | sort_by(. as $id | ($u + $id) | explode | add % 97) | .[0:2])}}')
  if SOFT=1 api POST /user "$body" >/dev/null; then
    created=$((created + 1))
    echo "  created $username"
  else
    echo "  $username already exists"
  fi
done <<'BOTS'
greta_lindqvist	34
kofi_mensah	41
ana_souza	28
dmitri_volkov	46
priya_nair	30
BOTS

# ---------- mark them all as bots ----------
marked=()
for u in alex_chen emma_rodriguez yuki_tanaka isabella_rossi james_morrison pradeep_kumar mei_lin zahra_hassan \
         greta_lindqvist kofi_mensah ana_souza dmitri_volkov priya_nair; do
  if SOFT=1 api POST /admin/bots "$(jq -nc --arg u "$u" '{usernames: [$u], bot: true}')" >/dev/null; then
    marked+=("$u")
  else
    echo "  (no player called $u; skipped)"
  fi
done

echo
echo "Created $created new bots. ${#marked[@]} players are now bots:"
api GET /admin/bots | jq -r '.[] | "  \(.username)\t\(.balance) cr\t\(.note // "starts on the next world tick")"'
