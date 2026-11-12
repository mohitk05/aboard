#!/usr/bin/env bash
# Connect West and East Africa: re-route "Nexus-4: Trans-African Span" (was Cairo → Johannesburg) to
# Dakar → Khartoum → Addis Ababa → Nairobi → Johannesburg, using existing stations. Its trains stay on it.
# Then run scripts/fill-trains.mjs: the line is longer, so it needs more trains.
#
# Usage: ADMIN_TOKEN=eyJ… ./scripts/reroute-trans-african.sh   (BASE_URL defaults to the live site)
set -euo pipefail
BASE_URL="${BASE_URL:-https://aboard.karekar-mohit.workers.dev}"
API="${BASE_URL%/}/api"
id() { curl -sf "$API/stop" | jq -r --arg n "$1" '.data[] | select(.name == $n) | .id'; }
LINE=$(curl -sf "$API/route" | jq -r '.data[] | select(.name == "Nexus-4: Trans-African Span" and .returnOf == null) | .id')
STOPS=$(for n in "Dakar Central" "Khartoum Central" "Addis Ababa Lebu" "Nairobi Terminus" "Johannesburg Park Station"; do id "$n"; done | jq -R . | jq -sc .)
echo "line $LINE stops $STOPS"
curl -sf -XPUT "$API/route/$LINE" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d "{\"route\":{\"stops\":$STOPS}}" | jq -r '.data | "\(.name): \([.stops[].name] | join(" → ")) (\(.totalKm | round) km)"'
