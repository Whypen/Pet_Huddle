#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CREDENTIALS_FILE="$ROOT_DIR/src/pages/signup/SignupCredentials.tsx"
OTP_FILE="$ROOT_DIR/src/lib/phoneOtp.ts"

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

# OTP shortcut: only in testing mode and fixed code
rg -q 'const TEST_OTP_SHORTCUT_CODE = "498005";' "$OTP_FILE" || fail "OTP shortcut code must be 498005"
rg -q 'const isTestingMode =' "$OTP_FILE" || fail "OTP shortcut must be gated by explicit testing mode"
rg -q 'import\.meta\.env\.PROD === false && isTestingMode' "$OTP_FILE" || fail "OTP shortcut must never run in prod"

# Remove verification error banner in credentials UI
if rg -q 'duplicateCheckError && \(' "$CREDENTIALS_FILE"; then
  fail "Duplicate verification error banner must be removed from UI"
fi

# Phone field must reuse standard field shell and keep Send Code clickable
rg -q 'form-field-rest relative flex items-center' "$CREDENTIALS_FILE" || fail "Phone field shell must match standard input styling"
rg -q 'absolute right-3 z-10 h-8 px-2\.5' "$CREDENTIALS_FILE" || fail "Send Code button clickable hit area layout missing"

# Password helper text removal requirement
if rg -q 'Almost: use at least 8 characters' "$ROOT_DIR/src/components/ui/PasswordStrengthBar.tsx"; then
  fail "Large password helper text must be removed"
fi
if rg -q 'Enter a password to get started' "$ROOT_DIR/src/components/ui/PasswordStrengthBar.tsx"; then
  fail "Old password helper text must be removed"
fi

# Safe-area bottom spacer to avoid CTA clipping (tight spacing)
rg -q 'h-\[calc\(env\(safe-area-inset-bottom, ?0px\)\+8px\)\]' "$CREDENTIALS_FILE" || fail "Tight bottom safe-area spacer missing"

echo "[PASS] signup credentials regression checks"
