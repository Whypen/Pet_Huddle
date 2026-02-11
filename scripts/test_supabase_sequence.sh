#!/usr/bin/env bash
set -euo pipefail

SUPABASE_URL_RESOLVED="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
KEY_RESOLVED="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}}"

if [[ -z "$SUPABASE_URL_RESOLVED" ]]; then
  echo "SUPABASE_URL or VITE_SUPABASE_URL is required"
  exit 1
fi

if [[ -z "$KEY_RESOLVED" ]]; then
  echo "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required"
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "WARNING: Service role key not found. Inserts may fail due to RLS."
fi

API="$SUPABASE_URL_RESOLVED/rest/v1"
AUTH_HEADER="Authorization: Bearer $KEY_RESOLVED"
APIKEY_HEADER="apikey: $KEY_RESOLVED"

get_user_id() {
  curl -sS "$API/profiles?select=id&limit=1" \
    -H "$AUTH_HEADER" -H "$APIKEY_HEADER" | \
    python3 - <<'PY'
import json,sys
try:
  data=json.load(sys.stdin)
  if not data:
    print("")
  else:
    print(data[0].get("id", ""))
except Exception:
  print("")
PY
}

USER_ID="${TEST_USER_ID:-}"
if [[ -z "$USER_ID" ]]; then
  USER_ID=$(get_user_id)
fi

if [[ -z "$USER_ID" ]]; then
  echo "No user id found. Set TEST_USER_ID or create a profile."
  exit 1
fi

echo "Using user_id: $USER_ID"

THREAD_ID=$(curl -sS -X POST "$API/threads?select=id" \
  -H "$AUTH_HEADER" -H "$APIKEY_HEADER" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "[{\"user_id\":\"$USER_ID\",\"title\":\"Sequence Test\",\"content\":\"curl sequence test\",\"tags\":[\"News\"],\"hashtags\":[],\"images\":[],\"is_map_alert\":true,\"is_public\":true}]" | \
  python3 - <<'PY'
import json,sys
try:
  data=json.load(sys.stdin)
  if isinstance(data,list) and data:
    print(data[0].get("id",""))
  else:
    print("")
except Exception:
  print("")
PY
)

if [[ -z "$THREAD_ID" ]]; then
  echo "Thread insert failed."
  exit 1
fi

echo "Thread created: $THREAD_ID"

MAP_ALERT_PAYLOAD="[{\"creator_id\":\"$USER_ID\",\"latitude\":22.2855,\"longitude\":114.1577,\"alert_type\":\"Stray\",\"description\":\"curl sequence test\",\"thread_id\":\"$THREAD_ID\",\"posted_to_threads\":true}]"

if [[ "${TEST_FORCE_FAIL:-}" == "1" ]]; then
  MAP_ALERT_PAYLOAD="[{\"creator_id\":\"$USER_ID\",\"alert_type\":\"Stray\"}]"
fi

ALERT_RES=$(curl -sS -X POST "$API/map_alerts?select=id" \
  -H "$AUTH_HEADER" -H "$APIKEY_HEADER" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$MAP_ALERT_PAYLOAD")

ALERT_ID=$(echo "$ALERT_RES" | python3 - <<'PY'
import json,sys
try:
  data=json.load(sys.stdin)
  if isinstance(data,list) and data and "id" in data[0]:
    print(data[0]["id"])
  else:
    print("")
except Exception:
  print("")
PY
)

if [[ -z "$ALERT_ID" ]]; then
  echo "Map alert insert failed; rolling back thread: $THREAD_ID"
  curl -sS -X DELETE "$API/threads?id=eq.$THREAD_ID" -H "$AUTH_HEADER" -H "$APIKEY_HEADER" >/dev/null
  echo "Rollback complete."
  exit 1
fi

echo "Map alert created: $ALERT_ID"

# Cleanup
curl -sS -X DELETE "$API/map_alerts?id=eq.$ALERT_ID" -H "$AUTH_HEADER" -H "$APIKEY_HEADER" >/dev/null
curl -sS -X DELETE "$API/threads?id=eq.$THREAD_ID" -H "$AUTH_HEADER" -H "$APIKEY_HEADER" >/dev/null

echo "Sequence OK: thread -> map_alerts -> cleanup"
