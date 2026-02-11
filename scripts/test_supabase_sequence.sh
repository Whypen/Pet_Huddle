#!/usr/bin/env bash
set -euo pipefail

SUPABASE_URL_RESOLVED="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
KEY_RESOLVED="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}}"

# Optional: load service role key from backend env files (if present)
BACKEND_ENV_FILES=(
  "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/backend.env"
  "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/Backend.env.md"
  "/Users/hyphen/Documents/Whypen/Huddle App/Backend logins.env.md"
)

for f in "${BACKEND_ENV_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    # extract SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY if present
    if [[ -z "${SUPABASE_URL_RESOLVED}" ]]; then
      SUPABASE_URL_RESOLVED=$(rg --no-line-number -m 1 "^SUPABASE_URL=" "$f" | sed 's/^SUPABASE_URL=//' | sed 's/^\"//;s/\"$//')
    fi
    if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
      SUPABASE_SERVICE_ROLE_KEY=$(rg --no-line-number -m 1 "^SUPABASE_SERVICE_ROLE_KEY=" "$f" | sed 's/^SUPABASE_SERVICE_ROLE_KEY=//' | sed 's/^\"//;s/\"$//')
      export SUPABASE_SERVICE_ROLE_KEY
    fi
  fi
done

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
# Use an authenticated user's access token if provided; otherwise default to service role / anon.
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
  APIKEY_HEADER="apikey: ${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-$KEY_RESOLVED}}"
else
  AUTH_HEADER="Authorization: Bearer $KEY_RESOLVED"
  APIKEY_HEADER="apikey: $KEY_RESOLVED"
fi

json_first_value() {
  local key="$1"
  local raw="$2"
  RAW="$raw" KEY="$key" python3 - <<'PY'
import json,os
key=os.environ.get("KEY","")
raw=os.environ.get("RAW","")
try:
  data=json.loads(raw) if raw else []
  if isinstance(data,list) and data:
    print(data[0].get(key,""))
  else:
    print("")
except Exception:
  print("")
PY
}

get_user_id() {
  local resp id
  resp=$(curl -sS "$API/profiles?select=id&limit=1" -H "$AUTH_HEADER" -H "$APIKEY_HEADER")
  id=$(json_first_value id "$resp")
  if [[ -n "$id" ]]; then
    echo "$id"
    return
  fi
  # Fallback: use creator_id from existing map_alerts
  resp=$(curl -sS "$API/map_alerts?select=creator_id&limit=1" -H "$AUTH_HEADER" -H "$APIKEY_HEADER")
  json_first_value creator_id "$resp"
}

USER_ID="${TEST_USER_ID:-}"
if [[ -z "$USER_ID" ]]; then
  USER_ID=$(get_user_id)
fi
if [[ -z "$USER_ID" && -f "/tmp/auth_data.sql" ]]; then
  USER_ID=$(python3 - <<'PY'
import re
try:
  with open("/tmp/auth_data.sql","r") as f:
    data=f.read()
  start = data.find('INSERT INTO \"auth\".\"users\"')
  if start == -1:
    print("")
    raise SystemExit
  chunk = data[start:start+4000]
  # grab the first values row and extract the second uuid (user id)
  row = None
  for line in chunk.splitlines():
    if line.strip().startswith("("):
      row = line
      break
  if not row:
    print("")
    raise SystemExit
  uuids = re.findall(r"'([0-9a-fA-F-]{36})'", row)
  print(uuids[1] if len(uuids) > 1 else "")
except Exception:
  print("")
PY
)
fi

if [[ -z "$USER_ID" ]]; then
  echo "No user id found. Set TEST_USER_ID or create a profile."
  exit 1
fi

echo "Using user_id: $USER_ID"

THREAD_RES=$(curl -sS -X POST "$API/threads?select=id" \
  -H "$AUTH_HEADER" -H "$APIKEY_HEADER" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "[{\"user_id\":\"$USER_ID\",\"title\":\"Sequence Test\",\"content\":\"curl sequence test\",\"tags\":[\"News\"],\"hashtags\":[],\"images\":[],\"is_map_alert\":true,\"is_public\":true}]")
THREAD_ID=$(json_first_value id "$THREAD_RES")

if [[ -z "$THREAD_ID" ]]; then
  echo "Thread insert failed."
  echo "Response: $THREAD_RES"
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

ALERT_ID=$(json_first_value id "$ALERT_RES")

if [[ -z "$ALERT_ID" ]]; then
  echo "Map alert insert failed; rolling back thread: $THREAD_ID"
  echo "Response: $ALERT_RES"
  curl -sS -X DELETE "$API/threads?id=eq.$THREAD_ID" -H "$AUTH_HEADER" -H "$APIKEY_HEADER" >/dev/null
  echo "Rollback complete."
  exit 1
fi

echo "Map alert created: $ALERT_ID"

# Cleanup
curl -sS -X DELETE "$API/map_alerts?id=eq.$ALERT_ID" -H "$AUTH_HEADER" -H "$APIKEY_HEADER" >/dev/null
curl -sS -X DELETE "$API/threads?id=eq.$THREAD_ID" -H "$AUTH_HEADER" -H "$APIKEY_HEADER" >/dev/null

echo "Sequence OK: thread -> map_alerts -> cleanup"
