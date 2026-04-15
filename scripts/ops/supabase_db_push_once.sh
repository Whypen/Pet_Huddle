#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROJECT_REF="${SUPABASE_PROJECT_REF:-ztrbourwcnhrpmzwlrcn}"
DB_USER="${SUPABASE_DB_USER:-postgres.${PROJECT_REF}}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DIRECT_HOST="${SUPABASE_DIRECT_HOST:-db.${PROJECT_REF}.supabase.co}"
POOLER_HOST="${SUPABASE_POOLER_HOST:-aws-1-ap-south-1.pooler.supabase.com}"
POOLER_PORT="${SUPABASE_POOLER_PORT:-5432}"
DIRECT_PORT="${SUPABASE_DIRECT_PORT:-5432}"
ALLOW_POOLER_FALLBACK="${SUPABASE_ALLOW_POOLER_FALLBACK:-false}"
DB_MODE="${SUPABASE_DB_MODE:-auto}"

usage() {
  cat <<'EOF'
Usage:
  SUPABASE_DB_PASSWORD='...' scripts/ops/supabase_db_push_once.sh
  SUPABASE_DB_URL='postgresql://...' scripts/ops/supabase_db_push_once.sh

Behavior:
  1. Chooses a DB connection path without using linked temp-role auth.
  2. Runs one psql preflight.
  3. Runs one supabase migration list against the chosen db url.
  4. Runs one supabase db push against the chosen db url.
  5. Runs one supabase migration list again to prove sync.

Rules:
  - No retries.
  - Exits immediately on the first failure.
  - Defaults to direct-host mode when IPv6 is available.
  - Will only use the pooler when SUPABASE_ALLOW_POOLER_FALLBACK=true
    or SUPABASE_DB_MODE=pooler is set explicitly.
  - If SUPABASE_DB_URL is provided, it is used exactly as-is.

Modes:
  SUPABASE_DB_MODE=auto    auto-detect direct host first, then optional pooler
  SUPABASE_DB_MODE=direct  require direct host; fail if IPv6/direct host unavailable
  SUPABASE_DB_MODE=pooler  require pooler; useful only when direct host is impossible

Examples:
  SUPABASE_DB_PASSWORD='...' scripts/ops/supabase_db_push_once.sh
  SUPABASE_DB_PASSWORD='...' SUPABASE_DB_MODE=direct scripts/ops/supabase_db_push_once.sh
  SUPABASE_DB_PASSWORD='...' SUPABASE_ALLOW_POOLER_FALLBACK=true scripts/ops/supabase_db_push_once.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${SUPABASE_DB_URL:-}" && -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL or SUPABASE_DB_PASSWORD is required." >&2
  usage >&2
  exit 1
fi

if [[ "$DB_MODE" != "auto" && "$DB_MODE" != "direct" && "$DB_MODE" != "pooler" ]]; then
  echo "ERROR: SUPABASE_DB_MODE must be one of: auto, direct, pooler" >&2
  exit 1
fi

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"

urlencode_password() {
  python3 - <<'PY'
import os
from urllib.parse import quote

print(quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))
PY
}

check_direct_ipv6() {
  python3 - "$DIRECT_HOST" "$DIRECT_PORT" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

try:
    infos = socket.getaddrinfo(host, port, socket.AF_INET6, socket.SOCK_STREAM)
except OSError:
    sys.exit(1)

for family, socktype, proto, _canon, sockaddr in infos:
    sock = socket.socket(family, socktype, proto)
    sock.settimeout(3)
    try:
        sock.connect(sockaddr)
        sock.close()
        sys.exit(0)
    except OSError:
        sock.close()

sys.exit(1)
PY
}

build_direct_url() {
  local encoded_password
  encoded_password="$(urlencode_password)"
  printf 'postgresql://%s:%s@%s:%s/%s?sslmode=require' \
    "$DB_USER" \
    "$encoded_password" \
    "$DIRECT_HOST" \
    "$DIRECT_PORT" \
    "$DB_NAME"
}

build_pooler_url() {
  local encoded_password
  encoded_password="$(urlencode_password)"
  printf 'postgresql://%s:%s@%s:%s/%s?sslmode=require' \
    "$DB_USER" \
    "$encoded_password" \
    "$POOLER_HOST" \
    "$POOLER_PORT" \
    "$DB_NAME"
}

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  case "$DB_MODE" in
    direct)
      if ! check_direct_ipv6; then
        echo "ERROR: direct DB host is not reachable from this network." >&2
        echo "Host: ${DIRECT_HOST}:${DIRECT_PORT}" >&2
        echo "This machine needs working IPv6 for direct-host migrations." >&2
        exit 1
      fi
      SUPABASE_DB_URL="$(build_direct_url)"
      ;;
    pooler)
      SUPABASE_DB_URL="$(build_pooler_url)"
      ;;
    auto)
      if check_direct_ipv6; then
        SUPABASE_DB_URL="$(build_direct_url)"
      elif [[ "${ALLOW_POOLER_FALLBACK}" == "true" ]]; then
        echo "WARN: direct DB host unavailable, falling back to pooler." >&2
        SUPABASE_DB_URL="$(build_pooler_url)"
      else
        echo "ERROR: direct DB host is unavailable and pooler fallback is disabled." >&2
        echo "Host: ${DIRECT_HOST}:${DIRECT_PORT}" >&2
        echo "Set SUPABASE_ALLOW_POOLER_FALLBACK=true only if you intentionally want to risk pooler auth breaker failures." >&2
        exit 1
      fi
      ;;
  esac
fi

echo "[conn] mode=${DB_MODE}"
echo "[conn] url=${SUPABASE_DB_URL}"

echo "[1/4] psql preflight"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c 'select 1;'

echo "[2/4] migration list before push"
supabase migration list --workdir "$ROOT_DIR" --db-url "$SUPABASE_DB_URL"

echo "[3/4] db push"
supabase db push --yes --workdir "$ROOT_DIR" --db-url "$SUPABASE_DB_URL"

echo "[4/4] migration list after push"
supabase migration list --workdir "$ROOT_DIR" --db-url "$SUPABASE_DB_URL"
