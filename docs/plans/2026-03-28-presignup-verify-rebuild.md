# Pre-Signup Email Verification Rebuild — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace broken localStorage-based pre-signup email verification with a DB-backed token flow, fix the unregistered /signup/verify-email route, rebuild the verify UX (remove Open Mail button, add GlassSheet, compact resend), and eliminate all dead code.

**Architecture:** New `presignup_tokens` table with RLS enabled but zero public policies — accessible only via service-role inside edge functions. Two new edge functions (`confirm-pre-signup-verify`, `get-pre-signup-verify-status`) return `{ verified, expired }` only. Client polls via `get-pre-signup-verify-status` using the anon key (no direct table access). All invocations are awaited with explicit failure UI. sessionStorage stores token+email for drop-off resumption.

**Tech Stack:** React 18 + TypeScript, Supabase Edge Functions (Deno), Supabase Postgres, Brevo SMTP, GlassSheet, react-hook-form, sonner toasts.

---

### Task 1: SQL Migration — presignup_tokens

**Files:**
- Create: `supabase/migrations/20260328100000_presignup_tokens.sql`

**Step 1: Write migration**

```sql
-- supabase/migrations/20260328100000_presignup_tokens.sql

create table if not exists public.presignup_tokens (
  token       uuid        primary key,
  email       text        not null,
  verified    boolean     not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- RLS enabled; zero policies = zero public access.
-- All reads/writes go through service-role edge functions only.
alter table public.presignup_tokens enable row level security;

comment on table public.presignup_tokens is
  'Pre-signup email verification tokens. No public RLS policies — service-role only.';
```

**Step 2: Apply migration via MCP**

Use `mcp__2e2b9a1b__apply_migration` with project_id `ztrbourwcnhrpmzwlrcn`.

**Step 3: Verify table exists**

```sql
select table_name, row_security
from information_schema.tables t
join pg_class c on c.relname = t.table_name
where t.table_schema = 'public' and t.table_name = 'presignup_tokens';
```

Expected: 1 row, `row_security = true`.

**Step 4: Verify zero RLS policies**

```sql
select count(*) from pg_policies where tablename = 'presignup_tokens';
```

Expected: `0`.

---

### Task 2: New Edge Function — confirm-pre-signup-verify

**Files:**
- Create: `supabase/functions/confirm-pre-signup-verify/index.ts`

**Step 1: Write function**

```typescript
// supabase/functions/confirm-pre-signup-verify/index.ts
// Marks a presignup token verified in DB.
// Called from SignupVerifyEmail.tsx (no auth session — anon key only).
// Returns { verified: bool, expired: bool } — never exposes email or internal state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: { token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const { token } = body;
    if (!token) return json({ error: "token_required" }, 400);

    const { data: row, error: fetchErr } = await supabase
      .from("presignup_tokens")
      .select("verified, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr) {
      console.error("[confirm-pre-signup-verify] fetch error", fetchErr.message);
      return json({ error: "server_error" }, 500);
    }
    if (!row) return json({ verified: false, expired: false });

    const expired = new Date(row.expires_at) < new Date();
    if (expired) return json({ verified: false, expired: true });
    if (row.verified) return json({ verified: true, expired: false });

    const { error: updateErr } = await supabase
      .from("presignup_tokens")
      .update({ verified: true })
      .eq("token", token);

    if (updateErr) {
      console.error("[confirm-pre-signup-verify] update error", updateErr.message);
      return json({ error: "server_error" }, 500);
    }

    return json({ verified: true, expired: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
```

---

### Task 3: New Edge Function — get-pre-signup-verify-status

**Files:**
- Create: `supabase/functions/get-pre-signup-verify-status/index.ts`

**Step 1: Write function**

```typescript
// supabase/functions/get-pre-signup-verify-status/index.ts
// Returns { verified, expired } for a presignup token.
// Called by SignupCredentials polling loop (no auth session — anon key only).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: { token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const { token } = body;
    if (!token) return json({ error: "token_required" }, 400);

    const { data: row, error } = await supabase
      .from("presignup_tokens")
      .select("verified, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[get-pre-signup-verify-status] fetch error", error.message);
      return json({ error: "server_error" }, 500);
    }
    if (!row) return json({ verified: false, expired: false });

    const expired = new Date(row.expires_at) < new Date();
    return json({ verified: row.verified, expired });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pre-signup-verify-status] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
```

---

### Task 4: Modify send-pre-signup-verify

**Files:**
- Modify: `supabase/functions/send-pre-signup-verify/index.ts`

**Step 1: Rewrite**

```typescript
// supabase/functions/send-pre-signup-verify/index.ts — v2
// Creates DB token row then sends Brevo email.
// Cleans up expired tokens on each call.
// Returns { ok: true } or { error: string } — never swallows failures.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const BREVO_API_KEY   = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") ?? "noreply@huddle.pet";
const APP_URL         = Deno.env.get("APP_URL") ?? "https://huddle.pet";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: { email?: string; token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const { email, token } = body;
    if (!email || !token) return json({ error: "email_and_token_required" }, 400);

    // Cleanup expired tokens (best-effort, non-blocking error)
    await supabase
      .from("presignup_tokens")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .then(({ error }) => {
        if (error) console.warn("[send-pre-signup-verify] cleanup error", error.message);
      });

    // Insert token row — fail hard if this fails (no token = no verify path)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from("presignup_tokens").insert({
      token,
      email,
      verified: false,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("[send-pre-signup-verify] DB insert failed", insertError.message);
      return json({ error: "db_error" }, 500);
    }

    const verifyUrl = `${APP_URL}/signup/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender:      { name: "huddle", email: BREVO_FROM_EMAIL },
        to:          [{ email }],
        subject:     "Verify your email to join huddle",
        htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;padding:32px;color:#424965;max-width:480px;margin:0 auto;">
  <h2 style="margin-bottom:8px;">Verify your email</h2>
  <p style="color:rgba(74,73,101,0.70);margin-bottom:24px;">
    Tap the button below to confirm your email address and complete your huddle registration.
  </p>
  <a href="${verifyUrl}"
     style="display:inline-block;background:#2145CF;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;">
    Verify email
  </a>
  <p style="margin-top:24px;color:rgba(74,73,101,0.50);font-size:12px;">
    This link expires in 24 hours. If you didn't create a huddle account, ignore this email.
  </p>
</body>
</html>`,
        textContent: `Verify your email to join huddle\n\nTap the link below:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-pre-signup-verify] Brevo error", res.status, err);
      return json({ error: "email_send_failed" }, 500);
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
```

---

### Task 5: Deploy all three edge functions

**Commands (run sequentially):**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
npx supabase functions deploy send-pre-signup-verify --no-verify-jwt
npx supabase functions deploy confirm-pre-signup-verify --no-verify-jwt
npx supabase functions deploy get-pre-signup-verify-status --no-verify-jwt
```

`--no-verify-jwt` is required because these functions are called before the user has a session (anon key only, no Bearer JWT).

**Verify deployment:**

```bash
npx supabase functions list 2>&1 | grep -E "send-pre-signup|confirm-pre-signup|get-pre-signup"
```

Expected: 3 rows, all ACTIVE.

---

### Task 6: Rewrite SignupVerifyEmail.tsx + register route

**Files:**
- Modify: `src/pages/signup/SignupVerifyEmail.tsx` (full rewrite)
- Modify: `src/App.tsx` (add route + import)

**Step 1: Rewrite SignupVerifyEmail.tsx**

```tsx
/**
 * SignupVerifyEmail — /signup/verify-email
 * Reached by clicking the link in the pre-signup verification email.
 * Calls confirm-pre-signup-verify edge function to mark token verified in DB.
 * No auth session required.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State = "confirming" | "success" | "expired" | "error";

const SignupVerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>("confirming");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setState("error"); return; }

    supabase.functions
      .invoke("confirm-pre-signup-verify", { body: { token } })
      .then(({ data, error }) => {
        if (error) { setState("error"); return; }
        if (data?.verified)      setState("success");
        else if (data?.expired)  setState("expired");
        else                     setState("error");
      })
      .catch(() => setState("error"));
  }, [searchParams]);

  const icon = (bg: string, color: string, Icon: typeof CheckCircle) => (
    <div style={{ width: 64, height: 64, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
      <Icon size={32} color={color} />
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "var(--background,#f5f5f7)", fontFamily: "system-ui,sans-serif" }}>
      {state === "confirming" && (
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: "#2b33c6", margin: "0 auto 16px", display: "block", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "rgba(74,73,101,0.60)", fontSize: "15px" }}>Verifying…</p>
        </div>
      )}

      {state === "success" && (
        <div style={{ textAlign: "center", maxWidth: "360px" }}>
          {icon("#c1ff72", "#2b33c6", CheckCircle)}
          <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#424965", marginBottom: "12px", lineHeight: 1.2 }}>Email verified</h1>
          <p style={{ fontSize: "15px", color: "rgba(74,73,101,0.70)", lineHeight: 1.5 }}>
            Your email is confirmed. Return to huddle to continue setting up your account.
          </p>
        </div>
      )}

      {(state === "expired" || state === "error") && (
        <div style={{ textAlign: "center", maxWidth: "360px" }}>
          {icon("#fde8e8", "#e84545", XCircle)}
          <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#424965", marginBottom: "12px" }}>
            {state === "expired" ? "Link expired" : "Invalid link"}
          </h1>
          <p style={{ fontSize: "15px", color: "rgba(74,73,101,0.70)", lineHeight: 1.5 }}>
            {state === "expired"
              ? "This link has expired. Return to huddle and request a new verification email."
              : "This link is invalid. Return to huddle and request a new verification email."}
          </p>
        </div>
      )}
    </div>
  );
};

export default SignupVerifyEmail;
```

**Step 2: Register route in App.tsx**

Add import after the existing signup imports:
```tsx
import SignupVerifyEmail from "./pages/signup/SignupVerifyEmail";
```

Add route after the `email-confirmation` route:
```tsx
<Route path="/signup/verify-email" element={<SignupVerifyEmail />} />
```

Note: No `PublicRoute` wrapper — this page is intentionally accessible without auth, even from an email client's in-app browser.

---

### Task 7: Rewrite verify sub-state in SignupCredentials.tsx

**Files:**
- Modify: `src/pages/signup/SignupCredentials.tsx`

**Changes summary:**
1. Remove `resending` state — replaced by `sendState`
2. Add `sendState`, `tokenExpired`, `showMailSheet` states
3. Lazy-init `verifySubState` + `verifyToken` from sessionStorage
4. Remove localStorage polling `useEffect` (lines 246-258)
5. Add DB polling `useEffect`
6. Add `mailto:` deep link `useEffect` on sheet open
7. Remove `handleOpenMail` function
8. Rewrite `handleResend` — awaited, rotates token, updates sessionStorage
9. Add `handleImmediateCheck` + `handleContinue`
10. Rewrite `onSubmit` — await send, explicit error
11. Rewrite verify sub-state JSX — GlassSheet, compact resend, correct CTAs
12. Add `GlassSheet` + `CheckCircle` imports

**New state declarations (replace `resending` and `verifySubState`/`verifyToken` init):**

```tsx
// Lazy-init from sessionStorage for drop-off resumption
const [verifySubState, setVerifySubState] = useState<"form" | "verifying">(() =>
  sessionStorage.getItem("huddle_presignup_token") ? "verifying" : "form"
);
const [verifyToken, setVerifyToken] = useState<string>(
  () => sessionStorage.getItem("huddle_presignup_token") ?? ""
);
const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
const [tokenExpired, setTokenExpired] = useState(false);
const [showMailSheet, setShowMailSheet] = useState(false);
const [emailVerified, setEmailVerified] = useState(false);
```

**Remove these effects (dead code):**
- The `useEffect` that polls `localStorage` every 2s (currently lines ~246-258)

**Add these effects:**

```tsx
// DB polling — 3s interval while waiting for verification
useEffect(() => {
  if (verifySubState !== "verifying" || !verifyToken || emailVerified) return;
  const poll = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-pre-signup-verify-status",
        { body: { token: verifyToken } },
      );
      if (error) return; // silent poll failure, retry on next tick
      if (data?.verified) {
        setEmailVerified(true);
        toast.success("Email verified!");
      } else if (data?.expired) {
        setTokenExpired(true);
      }
    } catch {
      // silent poll failure
    }
  };
  const id = setInterval(poll, 3000);
  return () => clearInterval(id);
}, [verifySubState, verifyToken, emailVerified]);

// Attempt mailto: deep link 1s after sheet opens
useEffect(() => {
  if (!showMailSheet) return;
  const id = setTimeout(() => { window.location.href = "mailto:"; }, 1000);
  return () => clearTimeout(id);
}, [showMailSheet]);
```

**Remove `handleOpenMail` function entirely.**

**Add new handlers:**

```tsx
const handleImmediateCheck = async () => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "get-pre-signup-verify-status",
      { body: { token: verifyToken } },
    );
    if (error) throw error;
    if (data?.verified) {
      setEmailVerified(true);
      toast.success("Email verified!");
    } else if (data?.expired) {
      setTokenExpired(true);
    } else {
      toast.message("Not yet verified. Check your inbox and click the link.");
    }
  } catch {
    toast.error("Could not check status. Please try again.");
  }
};

const handleContinue = async () => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "get-pre-signup-verify-status",
      { body: { token: verifyToken } },
    );
    if (error) throw error;
    if (data?.verified) {
      sessionStorage.removeItem("huddle_presignup_token");
      sessionStorage.removeItem("huddle_presignup_email");
      goTo("/signup/name");
    } else {
      setEmailVerified(false);
      toast.message("Not yet verified. Check your inbox and click the link.");
    }
  } catch {
    toast.error("Could not verify. Please try again.");
  }
};

const handleResend = async () => {
  if (sendState === "sending") return;
  setSendState("sending");
  const newToken = crypto.randomUUID();
  try {
    const { data, error } = await supabase.functions.invoke(
      "send-pre-signup-verify",
      { body: { email: email.trim(), token: newToken } },
    );
    if (error || !data?.ok) throw new Error("send_failed");
    setVerifyToken(newToken);
    sessionStorage.setItem("huddle_presignup_token", newToken);
    setTokenExpired(false);
    setEmailVerified(false);
    setSendState("sent");
    toast.success("Verification email sent");
  } catch {
    setSendState("error");
    toast.error("Couldn't send. Please try again.");
  }
};
```

**Replace `onSubmit` email-path section** (the block after duplicate check that currently does fire-and-forget):

```tsx
// Replace this block (fire-and-forget):
//   update({ ... });
//   setFlowState("signup");
//   const token = crypto.randomUUID();
//   setVerifyToken(token);
//   void supabase.functions.invoke(...).catch(...);
//   setVerifySubState("verifying");
//   return;

// With:
update({ email: email.trim(), password, phone: phone.trim(), email_opt_in: emailOptIn });
setFlowState("signup");
const newToken = crypto.randomUUID();
const { data: sendData, error: sendError } = await supabase.functions.invoke(
  "send-pre-signup-verify",
  { body: { email: email.trim(), token: newToken } },
);
if (sendError || !sendData?.ok) {
  setFlowState("idle");
  toast.error("Couldn't send verification email. Please try again.");
  return;
}
setVerifyToken(newToken);
sessionStorage.setItem("huddle_presignup_token", newToken);
sessionStorage.setItem("huddle_presignup_email", email.trim());
setSendState("sent");
setVerifySubState("verifying");
return;
```

**Replace verify sub-state JSX block** (the entire `if (verifySubState === "verifying") { return (...) }` block):

```tsx
if (verifySubState === "verifying") {
  return (
    <>
      <SignupShell
        step={2}
        onBack={() => {
          setVerifySubState("form");
          setEmailVerified(false);
          setVerifyToken("");
          setTokenExpired(false);
          setSendState("idle");
          sessionStorage.removeItem("huddle_presignup_token");
          sessionStorage.removeItem("huddle_presignup_email");
        }}
        isExiting={isExiting}
        cta={
          emailVerified ? (
            <NeuButton variant="primary" className="w-full h-12" onClick={handleContinue}>
              Continue
            </NeuButton>
          ) : (
            <NeuButton
              variant="primary"
              className="w-full h-12"
              onClick={() => setShowMailSheet(true)}
            >
              Check your email
            </NeuButton>
          )
        }
      >
        <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
          Verify your email
        </h1>
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
          We sent a link to{" "}
          <strong className="font-[600] text-[#424965]">{email}</strong>.
          Tap the button in the email to verify.
        </p>

        {emailVerified && (
          <div className="mt-4 flex items-center gap-2 text-[14px] font-[500] text-green-700">
            <CheckCircle size={16} />
            Email verified
          </div>
        )}

        {tokenExpired && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[13px] text-[#e84545]">
              Your verification link has expired. Tap Resend below.
            </p>
          </div>
        )}

        {sendState === "error" && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[13px] text-[#e84545]">
              We couldn't send the email. Tap Resend to try again.
            </p>
          </div>
        )}

        <div className="mt-8">
          <p className="text-[15px] font-[600] text-[#424965]">Didn't receive it?</p>
          <p className="text-[14px] text-[rgba(74,73,101,0.70)] mt-1">
            Check your spam and promotions folder.
          </p>
          <button
            type="button"
            className="mt-2 text-[14px] font-[500] text-[#2145CF] disabled:opacity-50"
            onClick={handleResend}
            disabled={sendState === "sending"}
          >
            {sendState === "sending" ? "Sending…" : "Resend email"}
          </button>
        </div>

        <p className="mt-6 text-[11px] text-[rgba(74,73,101,0.50)]">
          Wrong email?{" "}
          <Link
            to="/auth"
            className="text-[#2145CF] underline"
            onClick={() => {
              setFlowState("idle");
              sessionStorage.removeItem("huddle_presignup_token");
              sessionStorage.removeItem("huddle_presignup_email");
            }}
          >
            Start over
          </Link>
        </p>
      </SignupShell>

      <GlassSheet
        isOpen={showMailSheet}
        onClose={() => setShowMailSheet(false)}
        title="Check your email"
        className="pb-[max(env(safe-area-inset-bottom,0px),24px)]"
      >
        <p className="text-[14px] text-[rgba(74,73,101,0.70)] leading-relaxed mb-5">
          We'll try to open your mail app. If it doesn't open, return here after verifying.
        </p>
        <div className="space-y-3">
          <NeuButton
            variant="secondary"
            className="w-full h-12"
            onClick={() => {
              window.location.href = "mailto:";
              setShowMailSheet(false);
            }}
          >
            Open Mail App
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11"
            onClick={() => {
              setShowMailSheet(false);
              handleImmediateCheck();
            }}
          >
            I've already verified
          </NeuButton>
        </div>
      </GlassSheet>

      <LegalModal isOpen={legalModal === "terms"}   onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />
    </>
  );
}
```

**Add imports at top of SignupCredentials.tsx:**

```tsx
import { CheckCircle } from "lucide-react";        // add to existing lucide import line
import { GlassSheet } from "@/components/ui/GlassSheet";
```

---

### Task 8: Proof Commands

Run all of these and capture output:

```bash
# Route registration
grep -Rni "/signup/verify-email" src supabase
grep -Rni "SignupVerifyEmail" src

# Edge function references
grep -Rni "send-pre-signup-verify" src supabase
grep -Rni "confirm-pre-signup-verify" src supabase
grep -Rni "get-pre-signup-verify-status" src supabase

# Dead code removal
grep -Rni "localStorage" src
grep -Rni "sessionStorage" src
grep -Rni "verifyToken" src
grep -Rni "mailto:" src

# Build proof
npm run lint 2>&1
npm run build 2>&1
```

**DB proof commands:**

```sql
-- Table exists with RLS
select table_name, row_security::text
from information_schema.tables t
join pg_class c on c.relname = t.table_name
where t.table_schema = 'public' and t.table_name = 'presignup_tokens';

-- Zero policies
select count(*) as policy_count from pg_policies where tablename = 'presignup_tokens';

-- Columns correct
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'presignup_tokens'
order by ordinal_position;
```
