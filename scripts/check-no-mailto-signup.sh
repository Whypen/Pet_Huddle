#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="src/pages/signup"
PATTERN="mailto:"

if grep -Rni "${PATTERN}" "${TARGET_DIR}" >/tmp/signup_mailto_hits.txt; then
  echo "Forbidden '${PATTERN}' usage found in ${TARGET_DIR}:"
  cat /tmp/signup_mailto_hits.txt
  exit 1
fi

echo "No '${PATTERN}' usage found in ${TARGET_DIR}."
