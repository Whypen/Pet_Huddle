# Email Verification Gate — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce email verification as a gate before a user can complete onboarding, while allowing profile fields to be saved as a draft until the email is confirmed.

**Architecture:** Keep Supabase's auto-confirm trigger intact (session always issued on signup). Layer a separate `profiles.email_verified` boolean as the gate. A new edge function generates a token, stores it in the profile row, and sends a custom SES verification email. A second edge function validates the token and sets `email_verified = true`. The SignupCredentials page shows a modal after signup; the new `/signup/email-confirmation` page handles the waiting and success states. `EditProfile` (onboarding mode) gates "Complete Profile" on `email_verified` and adds a read-only email field with inline badge states.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + Edge Functions / Deno), react-router-dom, sonner (toasts), Tailwind + neumorphic design system tokens.

---

## Pre-flight checklist (read before starting)

- **Do NOT drop** `auto_confirm_email_on_signup` trigger — dropping it causes `signUp()` to return `session: null`, breaking all downstream protected routes.
- **Supabase dashboard** has "Confirm email" enabled; the trigger bypasses it. We do not need to change dashboard settings.
- `profiles.email` column already exists and is populated from `auth.users`.
- `send-signup-verify-email` edge function already exists — it will be **modified** in Task 3 to generate the token internally.
- All edge functions are deployed with `--no-verify-jwt` (they validate via service role or the custom token).
- Design system: use `neu-chip` for the badge, `NeuButton` for buttons, `glass-e3` for modals.

---

## Task 1 — DB Migration: `email_verified` + token columns + backfill

**Files:**
- Create: `supabase/migrations/20260327000000_email_verification.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- Email verification gate
-- ============================================================================
-- Adds three columns to profiles:
--   email_verified         — gate for completing onboarding
--   email_verify_token     — short-lived UUID sent in the verification email
--   email_verify_token_expires_at — 24-hour expiry
--
-- Existing users are back-filled as verified so they are not disrupted.
-- New users default to false and must complete verification.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verify_token text,
  ADD COLUMN IF NOT EXISTS email_verify_token_expires_at timestamptz;

-- Back-fill: existing users have already authenticated via other means
-- (phone OTP / identity verification). Mark them as verified so the new gate
-- does not lock out the existing user base.
UPDATE public.profiles
SET email_verified = true
WHERE email_verified = false;

-- RLS: allow the user's own row to be read for email_verified
-- (already covered by existing RLS SELECT policy on profiles)
```

**Step 2: Apply migration to local instance**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
supabase db push
```

Expected: migration applied, no errors.

**Step 3: Apply to remote (production)**

```bash
supabase db push --linked
```

**Step 4: Verify columns exist**

```bash
supabase db execute --linked --sql \
  "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='profiles' AND column_name LIKE 'email_ver%';"
```

Expected output: three rows — `email_verified`, `email_verify_token`, `email_verify_token_expires_at`.

**Step 5: Commit**

```bash
git add supabase/migrations/20260327000000_email_verification.sql
git commit -m "feat(db): add email_verified + token columns to profiles, backfill existing users"
```

---

## Task 2 — New edge function: `confirm-signup-email`

**Files:**
- Create: `supabase/functions/confirm-signup-email/index.ts`

**Step 1: Create the function**

```typescript
// supabase/functions/confirm-signup-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    let body: { token?: string; uid?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { token, uid } = body;
    if (!token || !uid) return json({ error: "token and uid required" }, 400);

    // Fetch and validate the token
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email_verify_token, email_verify_token_expires_at, email_verified")
      .eq("id", uid)
      .single();

    if (error || !profile) {
      console.error("[confirm-signup-email] profile not found", uid);
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (profile.email_verified) {
      // Already verified — idempotent success
      return json({ ok: true, already_verified: true });
    }

    if (
      profile.email_verify_token !== token ||
      !profile.email_verify_token_expires_at ||
      new Date(profile.email_verify_token_expires_at) < new Date()
    ) {
      console.warn("[confirm-signup-email] invalid or expired token", uid);
      return json({ ok: false, error: "invalid_token" }, 400);
    }

    // Mark verified, clear token
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        email_verified: true,
        email_verify_token: null,
        email_verify_token_expires_at: null,
      })
      .eq("id", uid);

    if (updateError) {
      console.error("[confirm-signup-email] update failed", updateError.message);
      return json({ error: "server error" }, 500);
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-signup-email] unexpected error", msg);
    return json({ error: "server error" }, 500);
  }
});
```

**Step 2: Deploy**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
supabase functions deploy confirm-signup-email --no-verify-jwt
```

Expected: `Deployed Functions on project ztrbourwcnhrpmzwlrcn: confirm-signup-email`

**Step 3: Smoke test — invalid token returns 400**

```bash
curl -s -X POST \
  "https://ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1/confirm-signup-email" \
  -H "Authorization: Bearer removed_legacy_supabase_jwt" \
  -H "Content-Type: application/json" \
  -d '{"token":"fake-token","uid":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"ok":false,"error":"not_found"}` (404).

**Step 4: Commit**

```bash
git add supabase/functions/confirm-signup-email/
git commit -m "feat(edge): add confirm-signup-email function — validates token, sets email_verified"
```

---

## Task 3 — Modify `send-signup-verify-email`: generate token internally

**Files:**
- Modify: `supabase/functions/send-signup-verify-email/index.ts`

**Context:** Currently this function requires the caller to pass `verify_url`. We change it to generate the token and URL server-side. The caller only passes `user_id`. The `APP_URL` env var provides the base URL.

**Step 1: Replace `index.ts` content**

```typescript
// supabase/functions/send-signup-verify-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendSignupVerifyEmail } from "../_shared/email-service.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const APP_URL = Deno.env.get("APP_URL") ?? "https://huddle.pet";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    let body: { user_id?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { user_id } = body;
    if (!user_id) return json({ error: "user_id required" }, 400);

    // Fetch profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", user_id)
      .single();

    if (error || !profile?.email) {
      console.error("[send-signup-verify-email] profile not found", user_id);
      return json({ ok: true, skipped: true });
    }

    // Generate a one-time token, store it with 24h expiry
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await supabase
      .from("profiles")
      .update({
        email_verify_token: token,
        email_verify_token_expires_at: expiresAt,
      })
      .eq("id", user_id);

    if (tokenError) {
      console.error("[send-signup-verify-email] token store failed", tokenError.message);
      return json({ error: "server error" }, 500);
    }

    const verifyUrl = `${APP_URL}/signup/email-confirmation?token=${token}&uid=${user_id}`;

    const result = await sendSignupVerifyEmail(profile.email, {
      name: profile.display_name || "there",
      verifyUrl,
    });

    if (!result.ok) {
      console.error("[send-signup-verify-email] send failed", user_id);
      return json({ ok: true, skipped: true, reason: "send_failed" });
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-signup-verify-email] unexpected error", msg);
    return json({ error: "server error" }, 500);
  }
});
```

**Step 2: Add `APP_URL` to local `.env`**

Open `supabase/functions/.env` and add:

```
APP_URL=http://localhost:8080
```

**Step 3: Set `APP_URL` as Supabase secret (production)**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
supabase secrets set APP_URL=https://huddle.pet
```

**Step 4: Deploy**

```bash
supabase functions deploy send-signup-verify-email --no-verify-jwt
```

**Step 5: Smoke test with a real user_id**

```bash
curl -s -X POST \
  "https://ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1/send-signup-verify-email" \
  -H "Authorization: Bearer removed_legacy_supabase_jwt" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"2c65cbc4-06bb-482b-8b9c-e98f4ee7f881"}'
```

Expected: `{"ok":true}` and an email lands in fongpoman114@gmail.com with a link to `https://huddle.pet/signup/email-confirmation?token=...&uid=...`.

**Step 6: Commit**

```bash
git add supabase/functions/send-signup-verify-email/index.ts supabase/functions/.env
git commit -m "feat(edge): send-signup-verify-email generates token internally — caller passes user_id only"
```

---

## Task 4 — New page: `SignupEmailConfirmation`

**Files:**
- Create: `src/pages/signup/SignupEmailConfirmation.tsx`
- Modify: `src/App.tsx` — add public route
- Modify: `src/lib/signupFlow.ts` — add path to public list
- Modify: `src/components/auth/PublicRoute.tsx` — allow access when on confirmation path

**Step 1: Create `SignupEmailConfirmation.tsx`**

The page has two visual states:

- **Waiting state** (default, no `?token=` in URL): shows "We've sent your verification link", Open Mail, Resend, "I've verified my email" button.
- **Success state** (after `confirm-signup-email` returns `ok: true`): shows "You've verified your email", Continue button → `/set-profile`.
- **Error state** (token invalid/expired): shows message + Resend button.

```tsx
// src/pages/signup/SignupEmailConfirmation.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Mail, CheckCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { NeuButton } from "@/components/ui/NeuButton";
import { SignupShell } from "@/components/signup/SignupShell";

type PageState = "waiting" | "confirming" | "success" | "error";

const SignupEmailConfirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const [pageState, setPageState] = useState<PageState>("waiting");
  const [resending, setResending] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const token = searchParams.get("token");
  const uid = searchParams.get("uid");

  const goTo = (path: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(path, { replace: true }), 180);
  };

  // Auto-confirm when token + uid are present in URL
  useEffect(() => {
    if (!token || !uid) return;
    setPageState("confirming");

    supabase.functions
      .invoke("confirm-signup-email", { body: { token, uid } })
      .then(async ({ data, error }) => {
        if (error || !data?.ok) {
          console.error("[email-confirmation] confirm failed", error ?? data);
          setPageState("error");
          return;
        }
        // Refresh profile so email_verified is up-to-date
        await refreshProfile();
        setPageState("success");
      })
      .catch((err) => {
        console.error("[email-confirmation] unexpected error", err);
        setPageState("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, uid]);

  const handleResend = async () => {
    const userId = uid ?? user?.id;
    if (!userId) {
      toast.error("Please sign in to resend the verification email.");
      return;
    }
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-signup-verify-email",
        { body: { user_id: userId } },
      );
      if (error || !data?.ok) throw new Error("send_failed");
      toast.success("Verification email sent again");
      setPageState("waiting");
    } catch {
      toast.error("Could not resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleOpenMail = () => {
    window.location.href = "mailto:";
  };

  const handleCheckVerified = async () => {
    await refreshProfile();
    // refreshProfile updates AuthContext; if email_verified is now true,
    // the user can proceed. We check the updated profile via the effect below.
  };

  // After refreshProfile, if user is now verified, auto-advance to success
  const { profile } = useAuth();
  useEffect(() => {
    if (profile?.email_verified && pageState === "waiting") {
      setPageState("success");
    }
  }, [profile?.email_verified, pageState]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (pageState === "confirming") {
    return (
      <SignupShell step={3} isExiting={isExiting}>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[15px] text-muted-foreground">Verifying your email…</p>
        </div>
      </SignupShell>
    );
  }

  if (pageState === "success") {
    return (
      <SignupShell
        step={3}
        isExiting={isExiting}
        cta={
          <NeuButton
            variant="primary"
            className="w-full h-12"
            onClick={() => goTo("/set-profile")}
          >
            Continue
          </NeuButton>
        }
      >
        <div className="flex flex-col items-center text-center gap-4 pt-8">
          <div className="w-16 h-16 rounded-full bg-[#c1ff72] flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-[#2b33c6]" />
          </div>
          <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
            You've verified your email
          </h1>
          <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
            Your email is confirmed. You can now continue setting up huddle.
          </p>
        </div>
      </SignupShell>
    );
  }

  // Waiting state (default) + error state
  const isError = pageState === "error";

  return (
    <SignupShell
      step={3}
      isExiting={isExiting}
      cta={
        <div className="space-y-3">
          <NeuButton
            variant="secondary"
            className="w-full h-12"
            onClick={handleOpenMail}
          >
            <Mail size={16} className="mr-2" />
            Open Mail
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11"
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? "Sending…" : "Resend email"}
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11 text-[rgba(74,73,101,0.55)]"
            onClick={handleCheckVerified}
          >
            I've verified my email
          </NeuButton>
        </div>
      }
    >
      <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
        {isError ? "Link expired" : "We've sent your verification link"}
      </h1>
      <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
        {isError
          ? "This verification link has expired or is invalid. Request a new one below."
          : "Open your inbox and click the link to verify your email."}
      </p>
    </SignupShell>
  );
};

export default SignupEmailConfirmation;
```

**Step 2: Add route to `src/App.tsx`**

Find the block of public signup routes (lines ~131–134) and add one line:

```tsx
// After: <Route path="/signup/verify" element={<PublicRoute><SignupVerify /></PublicRoute>} />
<Route path="/signup/email-confirmation" element={<PublicRoute><SignupEmailConfirmation /></PublicRoute>} />
```

Also add the import at the top of the file with the other signup imports:

```tsx
import SignupEmailConfirmation from "./pages/signup/SignupEmailConfirmation";
```

**Step 3: Add path to `src/lib/signupFlow.ts`**

```typescript
// In SIGNUP_PUBLIC_PATHS array, add:
"/signup/email-confirmation",
```

Full updated constant:

```typescript
export const SIGNUP_PUBLIC_PATHS = [
  "/auth",
  "/signup/dob",
  "/signup/credentials",
  "/signup/name",
  "/signup/verify",
  "/signup/email-confirmation",
] as const;
```

**Step 4: Allow confirmation page access in `src/components/auth/PublicRoute.tsx`**

The `PublicRoute` redirects authenticated users away from public paths if they're not in the signup flow. The email confirmation link arrives from an inbox — flowState may be "idle" by then. Add an explicit bypass for this path.

Find the condition inside `PublicRoute` where it checks whether to redirect an authenticated user (look for logic that redirects to `/` or `/set-profile`). Add a check:

```typescript
// At the top of the redirect logic block, before any redirect:
const isEmailConfirmationPath = location.pathname === "/signup/email-confirmation";
if (isEmailConfirmationPath) {
  // Always allow — token in URL is the auth; user may arrive from inbox days later
  return <>{children}</>;
}
```

This must be placed before any redirect logic that would send authenticated users away.

**Step 5: Verify navigation works**

Run dev server:

```bash
npm run dev
```

Navigate to `http://localhost:8080/signup/email-confirmation` — should render the waiting state without redirect.
Navigate to `http://localhost:8080/signup/email-confirmation?token=fake&uid=fake` — should show spinner then error state.

**Step 6: Commit**

```bash
git add src/pages/signup/SignupEmailConfirmation.tsx src/App.tsx src/lib/signupFlow.ts src/components/auth/PublicRoute.tsx
git commit -m "feat: add /signup/email-confirmation page — waiting + success + error states"
```

---

## Task 5 — `SignupCredentials`: show verify-email modal after signup

**Files:**
- Modify: `src/pages/signup/SignupCredentials.tsx` (lines 281–309 — the `onSubmit` happy path)

**Context:** After `supabase.auth.signUp()` succeeds, currently the code calls `goTo("/signup/name")`. We change it to:
1. Fire `send-signup-verify-email` (fire-and-forget — never blocks navigation)
2. Show a modal asking the user what to do

**Step 1: Add modal state and handler**

Inside the `SignupCredentials` component body, add these state variables and the modal handler (place them with the other `useState` declarations near lines 66–80):

```typescript
const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(false);
```

Add a helper to fire the edge function (also in component body):

```typescript
const sendVerifyEmail = (userId: string) => {
  // Fire-and-forget — never block navigation on email send failure
  void supabase.functions
    .invoke("send-signup-verify-email", { body: { user_id: userId } })
    .catch((err) => console.warn("[signup] send-signup-verify-email failed silently", err));
};
```

**Step 2: Modify the `onSubmit` happy path**

Find lines ~308–309:

```typescript
      // existing code after signUp() succeeds:
      goTo("/signup/name");
```

Replace with:

```typescript
      // After successful signUp, get the new user's id then fire the verification email
      const { data: sessionData } = await supabase.auth.getSession();
      const newUserId = sessionData.session?.user?.id;
      if (newUserId) {
        sendVerifyEmail(newUserId);
      }
      setShowVerifyEmailModal(true);
      return; // modal handles navigation — do NOT call goTo here
```

Also update the "already registered → sign in" happy path at ~lines 293–303 similarly (after `goTo("/signup/name")` there — those cases are existing users re-entering signup, so we don't re-send the verification email; just navigate normally).

**Step 3: Add the modal JSX**

At the end of the component's JSX (before the closing `</>` at line 614), add:

```tsx
{/* Email verification modal — shown after successful signUp() */}
<Dialog
  open={showVerifyEmailModal}
  onOpenChange={setShowVerifyEmailModal}
>
  <DialogContent className="max-w-sm">
    <DialogTitle className="text-[18px] font-[600] text-[#424965]">
      Check your inbox to verify your email
    </DialogTitle>
    <DialogDescription className="text-[13px] text-[rgba(74,73,101,0.70)] leading-relaxed">
      We've sent a verification link to your email. You can continue filling in
      your profile now, but you'll need to verify your email before completing
      setup.
    </DialogDescription>

    <div className="space-y-3 mt-4">
      <NeuButton
        variant="primary"
        className="w-full h-11"
        onClick={() => {
          setShowVerifyEmailModal(false);
          goTo("/signup/email-confirmation");
        }}
      >
        Verify now
      </NeuButton>

      <NeuButton
        variant="secondary"
        className="w-full h-11"
        onClick={async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData.session?.user?.id;
          if (userId) sendVerifyEmail(userId);
          toast.success("Verification email sent again");
        }}
      >
        Resend email
      </NeuButton>

      <NeuButton
        variant="ghost"
        className="w-full h-11 text-[rgba(74,73,101,0.55)]"
        onClick={() => {
          setShowVerifyEmailModal(false);
          goTo("/signup/name");
        }}
      >
        I'll do it later
      </NeuButton>
    </div>
  </DialogContent>
</Dialog>
```

**Step 4: Verify modal renders**

Run dev server, go through signup flow to the credentials step. Submit with valid data. Modal should appear.

**Step 5: Commit**

```bash
git add src/pages/signup/SignupCredentials.tsx
git commit -m "feat: show email verification modal after signup in SignupCredentials"
```

---

## Task 6 — `AuthContext` + `signupFlow`: wire `email_verified` into Profile

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- (signupFlow.ts already updated in Task 4)

**Step 1: Add `email_verified` to Profile interface**

In `AuthContext.tsx` at line 58 (after `onboarding_completed`), add:

```typescript
  email_verified: boolean;
```

**Step 2: Add `email_verified` to `profileColumns`**

In `AuthContext.tsx` around line 161 (after `"onboarding_completed"`), add:

```typescript
"email_verified",
```

That's all — the existing `fetchProfile` and `refreshProfile` functions use `profileColumns` to build the SELECT query, so `email_verified` will now be fetched automatically.

**Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no type errors for `email_verified`. If you see "Property 'email_verified' does not exist", check that the column was added to both the interface AND profileColumns.

**Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): add email_verified to Profile interface and profile SELECT columns"
```

---

## Task 7 — `EditProfile` (onboarding mode): email field + gate + focus refresh

**Files:**
- Modify: `src/pages/EditProfile.tsx`

This task has four sub-changes. Make them one at a time.

### 7a — Window-focus refresh

**Step 1: Add focus handler to `EditProfile`**

Inside the component, near the other `useEffect` blocks, add:

```typescript
// Refresh profile on window focus so email_verified updates if user verified
// in another tab (e.g., clicked the link in their inbox).
useEffect(() => {
  if (!onboardingMode) return;
  const onFocus = () => { void refreshProfile(); };
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}, [onboardingMode, refreshProfile]);
```

`refreshProfile` is available from `useAuth()` — already destructured at line ~153.

### 7b — Read-only email field with inline badge

**Step 1: Locate the phone field section**

Search for `phoneEditMode` in `EditProfile.tsx` — the phone field block starts there (around line 1700+). The email field will be inserted **above** the phone field.

**Step 2: Add the email field with badge**

In the `profileMode === "edit"` form area, immediately before the phone field block, add:

```tsx
{/* ── Email field (read-only + verification badge) ── */}
{onboardingMode && (
  <div className="flex flex-col" style={{ gap: "var(--field-gap-lc, 6px)" }}>
    <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">
      Email
    </label>
    <div className="form-field-rest relative flex items-center justify-between px-4">
      <div className="flex items-center gap-2 min-w-0">
        <Mail className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        <span className="text-[15px] text-[var(--text-primary,#424965)] truncate">
          {user?.email ?? profile?.email ?? signupData.email ?? "—"}
        </span>
      </div>

      {profile?.email_verified ? (
        <span className="neu-chip text-[11px] font-semibold text-[rgba(74,73,101,0.45)] shrink-0 ml-2">
          Verified
        </span>
      ) : (
        <button
          type="button"
          className="neu-chip text-[11px] font-semibold text-[#2145CF] shrink-0 ml-2"
          onClick={async () => {
            const userId = user?.id;
            if (!userId) return;
            // Trigger resend then navigate to confirmation page
            void supabase.functions
              .invoke("send-signup-verify-email", { body: { user_id: userId } })
              .catch(() => {/* silent */});
            navigate("/signup/email-confirmation");
          }}
        >
          Resend
        </button>
      )}
    </div>
  </div>
)}
```

Note: `Mail` icon must be imported from `lucide-react` — check existing imports at the top of the file.

### 7c — Gate `handleSave` on `email_verified`

**Step 1: Find `handleSave` (line ~1190)**

At the very top of `handleSave`, after the session/user checks and before the missing-fields check, add:

```typescript
// Gate: email must be verified before completing onboarding
if (onboardingMode && !profile?.email_verified) {
  toast.error("Please verify your email before completing your profile.");
  return;
}
```

### 7d — Add CTA footer for onboarding mode

Currently onboarding mode has only the Save icon in the header. We need two explicit CTAs: "Complete Profile" (gated) and "Save Draft" (always available).

**Step 1: Add `handleSaveDraft` function** (place after `handleSave`, around line ~1552):

```typescript
const handleSaveDraft = async () => {
  // Same as handleSave but does NOT set onboarding_completed = true.
  // Silently saves all form data to the profile row.
  const { data: sessionData } = await supabase.auth.getSession();
  const activeUser = user ?? sessionData.session?.user ?? null;
  if (!activeUser?.id) return;

  setLoading(true);
  try {
    await supabase
      .from("profiles")
      .upsert(
        {
          id: activeUser.id,
          display_name: formData.display_name || null,
          bio: formData.bio || null,
          gender_genre: formData.gender_genre || null,
          dob: formData.dob || null,
          phone: formData.phone || null,
          location_name: formData.location_name || null,
          location_country: formData.location_country || null,
          legal_name: formData.legal_name || null,
          social_id: formData.social_id || null,
          // onboarding_completed intentionally NOT set here
        },
        { onConflict: "id" },
      );
    toast.success("Draft saved");
    await refreshProfile();
  } catch (err) {
    console.warn("[EditProfile.saveDraft]", err);
    toast.error("Could not save draft. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

**Step 2: Add the CTA footer**

Find the end of the form/edit area (just before `<PremiumUpsell ...>` at line ~2588). Add the onboarding-mode CTA footer:

```tsx
{/* Onboarding CTA footer */}
{onboardingMode && (
  <div className="sticky bottom-0 left-0 right-0 bg-background border-t border-border/20 px-4 py-3 space-y-2"
       style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 12px)" }}>
    <NeuButton
      variant="primary"
      className="w-full h-12"
      disabled={loading || !profile?.email_verified}
      onClick={handleSave}
    >
      {loading ? "Saving…" : "Complete profile"}
    </NeuButton>

    {!profile?.email_verified && (
      <p className="text-[11px] text-[rgba(74,73,101,0.55)] text-center">
        Please verify your email before completing your profile.
      </p>
    )}

    <NeuButton
      variant="ghost"
      className="w-full h-11"
      disabled={loading}
      onClick={handleSaveDraft}
    >
      Save draft
    </NeuButton>
  </div>
)}
```

**Step 3: Build check**

```bash
npm run build 2>&1 | head -20
```

Expected: clean build (pre-existing chunk-size advisory is acceptable).

**Step 4: Commit**

```bash
git add src/pages/EditProfile.tsx
git commit -m "feat(onboarding): email verified gate in EditProfile — field badge, complete gate, save draft, focus refresh"
```

---

## Task 8 — `ProtectedRoute`: defense-in-depth gate for `/home`

**Files:**
- Modify: `src/components/auth/ProtectedRoute.tsx`

**Purpose:** Even if somehow `onboarding_completed = true` but `email_verified = false` (shouldn't happen via normal flow, but defense-in-depth), bounce user back to `/set-profile`.

**Step 1: Modify `ProtectedRoute.tsx`**

Find the `onboardingComplete` check (line ~76):

```typescript
if (!onboardingComplete && !allowOnboardingRoutes) {
  return <Navigate to="/set-profile" replace />;
}
```

Add directly after it:

```typescript
// Defense-in-depth: if profile is loaded and email not verified,
// user cannot leave onboarding routes.
const emailVerified = (profile as { email_verified?: boolean } | null)?.email_verified ?? true;
if (!emailVerified && !allowOnboardingRoutes) {
  return <Navigate to="/set-profile" replace />;
}
```

Note: `?? true` defaults to "allow" when the field is absent (existing users before migration, or edge hydration states) to avoid accidentally locking out the user base.

**Step 2: Build + lint**

```bash
npm run lint && npm run build 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/components/auth/ProtectedRoute.tsx
git commit -m "feat(guard): ProtectedRoute bounces email-unverified users to /set-profile"
```

---

## Task 9 — End-to-end smoke test

**Sequence:**

1. Clear all local storage and sign out any existing session.
2. Go to `/signup/dob` → fill DOB → Continue.
3. Fill credentials (use a fresh email address) → Continue.
4. **Expected:** Verify email modal appears.
5. Click "I'll do it later" → lands on `/signup/name`.
6. Fill display name + social ID → Continue → `/signup/verify` → skip → `/set-profile`.
7. **Expected:** Email field shows the email address with "Resend" badge. "Complete profile" button is visible but disabled.
8. Click "Resend" badge → email arrives; "Complete profile" still disabled.
9. Open the email link (`/signup/email-confirmation?token=...&uid=...`) → spinner → "You've verified your email" success state.
10. Click "Continue" → `/set-profile`.
11. **Expected:** Email field now shows "Verified" badge. "Complete profile" button is enabled.
12. Fill required fields → click "Complete profile" → navigates to `/set-pet` or `/`.

**Verify the guard:**

13. Manually set `email_verified = false` for a completed user in the DB and reload `/` (home).
14. **Expected:** Redirected to `/set-profile`.

---

## Summary table

| Task | Files changed | Risk |
|---|---|---|
| 1 DB migration | 1 migration | Low — backfill runs as UPDATE |
| 2 confirm-signup-email | 1 new edge fn | Low |
| 3 send-signup-verify-email | 1 edge fn modified | Low — interface simplified |
| 4 SignupEmailConfirmation | 1 new page + 3 modified | Medium — PublicRoute bypass |
| 5 SignupCredentials modal | 1 modified | Low |
| 6 AuthContext | 1 modified | Low |
| 7 EditProfile | 1 modified | Medium — gate + new CTA |
| 8 ProtectedRoute | 1 modified | Low — default allows when absent |

**Total:** 2 new files, 7 modified files, 2 new edge functions.
