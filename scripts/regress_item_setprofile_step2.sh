#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EDIT_PROFILE="$ROOT_DIR/src/pages/EditProfile.tsx"
SIGNUP_VERIFY="$ROOT_DIR/src/pages/signup/SignupVerify.tsx"
GLOBAL_CSS="$ROOT_DIR/src/styles/global.css"

fail(){ echo "[FAIL] $1" >&2; exit 1; }

# Legal name required + exact copy rules
rg -q 'placeholder="First Name and Last Name"' "$EDIT_PROFILE" || fail "Legal name placeholder must be exact"
rg -q 'placeholder="First Name and Last Name"' "$SIGNUP_VERIFY" || fail "Signup verify legal name placeholder must be exact"
rg -q 'Legal name should include at least two words - first and last name\.' "$EDIT_PROFILE" || fail "Missing exact legal-name subtext"
rg -q 'Let.s try again with a valid legal name' "$EDIT_PROFILE" "$SIGNUP_VERIFY" || fail "Missing exact legal-name retry error"
rg -q 'split\(/\\s\+/' "$EDIT_PROFILE" "$SIGNUP_VERIFY" || fail "Missing legal-name two-word validation logic"

# Forbidden step-2 generic errors
if rg -qi 'please input a valid display name' "$SIGNUP_VERIFY" "$EDIT_PROFILE"; then
  fail "Forbidden display-name generic error present"
fi
if rg -qi 'please enter a valid date of birth' "$SIGNUP_VERIFY" "$EDIT_PROFILE"; then
  fail "Forbidden DOB generic error present"
fi

# Prefill persistence markers for reload/back-forward
rg -q 'SETPROFILE_PREFILL_KEY = "setprofile_prefill"' "$EDIT_PROFILE" || fail "Missing setprofile prefill key"
rg -q 'localStorage\.setItem\(' "$EDIT_PROFILE" || fail "Missing persisted prefill cache write"
rg -q 'localStorage\.getItem\(SETPROFILE_PREFILL_KEY' "$EDIT_PROFILE" || fail "Missing persisted prefill cache read"
rg -q 'inferCountryCodeFromPhone' "$EDIT_PROFILE" || fail "Missing phone-country fallback"
rg -q 'local_kyc_submissions' "$EDIT_PROFILE" || fail "Missing verification-country fallback"

# Experience validation exact rules + string
rg -q 'Number\.isInteger' "$EDIT_PROFILE" || fail "Missing integer validation for years"
rg -q 'years >= 0' "$EDIT_PROFILE" || fail "Missing lower bound 0 for years"
rg -q 'years <= 99' "$EDIT_PROFILE" || fail "Missing upper bound 99 for years"
rg -q 'Tell us how many years you.ve cared for pets' "$EDIT_PROFILE" || fail "Missing exact experience error copy"
rg -q 'pet_experience\.includes\("None"\)' "$EDIT_PROFILE" || fail "Missing None-experience guard"

# Placeholder rules
rg -q 'placeholder="Street"' "$EDIT_PROFILE" || fail "Country placeholder must be Street"
if rg -q 'Select degree\.\.\.|Select\.\.\.' "$EDIT_PROFILE"; then
  fail "Dropdown placeholders must be normalized to Select"
fi

# Social album add replaced by + icon button
if rg -q '>\s*Add\s*<' "$EDIT_PROFILE"; then
  fail "Social Album Add label still present"
fi
rg -q '<Plus ' "$EDIT_PROFILE" || fail "Missing Plus icon button for Social Album"

# Public toggles present on required fields
rg -q 'show_height' "$EDIT_PROFILE" || fail "Height public toggle missing"
rg -q 'show_languages' "$EDIT_PROFILE" || fail "Languages public toggle missing"
rg -q 'show_location' "$EDIT_PROFILE" || fail "Location public toggle missing"

# No blue focus border/ring on these inputs
if awk '/\\.form-field-focus,/{flag=1} flag{print} /\\.form-field-error/{flag=0}' "$GLOBAL_CSS" | rg -q '33,69,207'; then
  fail "Blue focus border/ring still present"
fi
if rg -q 'ring-\[#2145CF\]|border-\[#2145CF\]' "$EDIT_PROFILE"; then
  fail "Blue focus border/ring utility still present in step2 inputs"
fi

echo "[PASS] setprofile step2 regression checks"
