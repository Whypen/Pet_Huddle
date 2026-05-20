# Phone Validation Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply a uniform phone validation policy (E.164 normalization + `isPossiblePhoneNumber` country-aware check + duplicate account guard) across every frontend path that writes a user account phone number.

**Architecture:** `isPossiblePhoneNumber` from `react-phone-number-input` (already installed) replaces all structural-regex-only checks. The existing `check_identifier_registered` RPC (checks `auth.users.phone`) is reused for duplicate detection; it correctly skips empty params. No new RPCs or migrations needed.

**Tech Stack:** React + TypeScript, react-phone-number-input ^3.4.14, Zod, Supabase JS client

---

## Audit Summary

| Surface | isPossiblePhoneNumber | Duplicate check | Status |
|---------|----------------------|-----------------|--------|
| SignupCredentials — OAuth path | ✅ already done | ✅ done (phone-only, 400ms debounce) | ✅ complete |
| SignupCredentials — email path | ❌ Zod regex only | ✅ done (email+phone, 400ms debounce) | needs Task 1 |
| EditProfile / SetProfile | ❌ E164_PHONE_REGEX only | ❌ none | needs Task 2 |
| EditPetProfile / SetPetProfile (vet phone_no) | ❌ no validation | N/A (not account phone) | needs Task 3 |
| Edge functions | read-only from profiles | N/A | no change needed |

**RPC contract** (`check_identifier_registered`):
- Params: `p_email text`, `p_phone text`
- Empty string `""` is explicitly skipped (safe to pass for phone-only check)
- Checks `auth.users.phone = p_phone` — matches phones that went through OTP verification
- Returns `{registered: boolean, field: "email"|"phone"|null}`

**Duplicate check timing after all tasks:**

| Path | Debounce on change | On submit/save |
|------|--------------------|----------------|
| Email signup | 400ms (unchanged) | ✅ (unchanged) |
| OAuth signup | 400ms (unchanged) | ✅ (unchanged) |
| EditProfile | 400ms (NEW) | ✅ (NEW) |
| EditPetProfile | N/A — vet, not account phone | ✅ format only on save (NEW) |

---

## Task 1 — `src/lib/authSchemas.ts`: country-aware Zod refinement

**Files:**
- Modify: `src/lib/authSchemas.ts`

**What to change:** Add `isPossiblePhoneNumber` refinement to the `phone` field in `credentialsSchema`, chained after the existing structural E.164 regex. This makes `errors.phone` (and thus `isValid`) country-aware for the email signup path — no changes needed in `SignupCredentials.tsx`.

**Step 1: Add import at top of file**
```ts
import { isPossiblePhoneNumber } from "react-phone-number-input";
```

**Step 2: Replace the phone field in credentialsSchema**

Old:
```ts
phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid phone format"),
```

New:
```ts
phone: z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Invalid phone format")
  // Country-aware digit-count check via libphonenumber.
  // "possible" = correct length for the country. NOT OTP-verified ownership.
  .refine(
    (val) => { try { return isPossiblePhoneNumber(val); } catch { return false; } },
    "Phone number length is not valid for the selected country"
  ),
```

**Step 3: Verify build** — `npm run build` should produce no new type errors.

---

## Task 2 — `src/pages/EditProfile.tsx`: isPossiblePhoneNumber + duplicate check

**Files:**
- Modify: `src/pages/EditProfile.tsx`

### 2a — Add named import
Change:
```ts
import PhoneInput from "react-phone-number-input";
```
To:
```ts
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
```

### 2b — Remove `E164_PHONE_REGEX` constant
The regex `/^\+[1-9]\d{7,14}$/` on line ~45 is no longer needed — replaced by `isPossiblePhoneNumber`.

### 2c — Add phone duplicate state/ref near other phone states (after line ~179)
```ts
const [phoneDuplicate, setPhoneDuplicate] = useState(false);
const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
const phoneDuplicateCheckRef = useRef(0);
```

### 2d — Add debounced duplicate check useEffect
Add after the existing phone-related effects:
```ts
// Phone duplicate check — only when user is editing AND phone has changed from
// the original saved value AND the format is country-valid.
// Passes p_email:"" so the RPC checks phone uniqueness only (skips email).
// NOT the user's own phone: phoneOriginalValue is excluded by the !== guard.
useEffect(() => {
  const phone = formData.phone.trim();
  if (!phoneEditMode || phone === phoneOriginalValue.trim() || !isPossiblePhoneNumber(phone)) {
    setPhoneDuplicate(false);
    setPhoneDuplicateChecking(false);
    return;
  }
  const checkId = ++phoneDuplicateCheckRef.current;
  const timer = setTimeout(async () => {
    setPhoneDuplicateChecking(true);
    try {
      const { data, error } = await supabase.rpc("check_identifier_registered", {
        p_email: "",
        p_phone: phone,
      });
      if (checkId !== phoneDuplicateCheckRef.current) return;
      setPhoneDuplicate(!error && Boolean(data?.registered));
    } catch {
      if (checkId !== phoneDuplicateCheckRef.current) return;
      setPhoneDuplicate(false);
    } finally {
      if (checkId === phoneDuplicateCheckRef.current) setPhoneDuplicateChecking(false);
    }
  }, 400);
  return () => clearTimeout(timer);
}, [formData.phone, phoneEditMode, phoneOriginalValue]);
```

### 2e — Patch `requestPhoneOtp`
Replace:
```ts
if (!E164_PHONE_REGEX.test(formData.phone.trim())) {
  setFieldErrors((prev) => ({ ...prev, phone: t("Phone number must include country code, e.g. +85212345678") }));
  return;
}
```
With:
```ts
if (!isPossiblePhoneNumber(formData.phone.trim())) {
  setFieldErrors((prev) => ({ ...prev, phone: t("Phone number length is not valid for the selected country") }));
  return;
}
if (phoneDuplicate) {
  setFieldErrors((prev) => ({ ...prev, phone: t("This phone number is already used by another account") }));
  return;
}
```

### 2f — Patch save handler (handleSave)
Replace:
```ts
if (!E164_PHONE_REGEX.test(formData.phone.trim())) {
  setFieldErrors((prev) => ({
    ...prev,
    phone: t("Phone number must include country code, e.g. +85212345678"),
  }));
  return;
}
```
With:
```ts
if (!isPossiblePhoneNumber(formData.phone.trim())) {
  setFieldErrors((prev) => ({
    ...prev,
    phone: t("Phone number length is not valid for the selected country"),
  }));
  return;
}
if (phoneDuplicate) {
  setFieldErrors((prev) => ({ ...prev, phone: t("This phone number is already used by another account") }));
  return;
}
```

### 2g — Patch OTP button JSX to disable when duplicate or impossible
Change:
```tsx
disabled={otpCountdown > 0}
className={cn(
  "...",
  otpCountdown > 0
    ? "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
    : "bg-brandBlue text-white active:opacity-80"
)}
```
To:
```tsx
disabled={otpCountdown > 0 || phoneDuplicate || (Boolean(formData.phone) && !isPossiblePhoneNumber(formData.phone))}
className={cn(
  "...",
  (otpCountdown > 0 || phoneDuplicate || (Boolean(formData.phone) && !isPossiblePhoneNumber(formData.phone)))
    ? "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
    : "bg-brandBlue text-white active:opacity-80"
)}
```

### 2h — Add inline duplicate error in phone field JSX
After the `</div>` that contains the PhoneInput + OTP button, add inside the `phoneEditMode` branch:
```tsx
{phoneDuplicate && (
  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
    This phone number is already used by another account
  </p>
)}
```

---

## Task 3 — `src/pages/EditPetProfile.tsx`: format check for vet clinic phone

**Files:**
- Modify: `src/pages/EditPetProfile.tsx`

**Context:** `phone_no` is the vet clinic contact number — not a user account identifier. Uniqueness check does NOT apply (a vet clinic can be shared by many users). Format check (`isPossiblePhoneNumber`) applies only when non-empty, because the field is optional.

### 3a — Add named import
Change:
```ts
import PhoneInput from "react-phone-number-input";
```
To:
```ts
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
```

### 3b — Add phone_no field error state
Find existing error state declarations. Add:
```ts
const [phoneNoError, setPhoneNoError] = useState("");
```

### 3c — Add format check in save handler (both insert and update paths)
Before each Supabase `.insert()` / `.update()` call for the pets table, add:
```ts
if (formData.phone_no && !isPossiblePhoneNumber(formData.phone_no)) {
  setPhoneNoError(t("Phone number length is not valid for the selected country"));
  return;
}
setPhoneNoError("");
```

### 3d — Show field error in JSX
After the PhoneInput for `phone_no`, add:
```tsx
{phoneNoError && (
  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1 mt-1" aria-live="polite">
    {phoneNoError}
  </p>
)}
```

---

## Task 4 — Verify

Run:
```bash
npm run lint
npm run build
```

Expected: 0 new lint errors, build succeeds (pre-existing chunk-size advisory only).
