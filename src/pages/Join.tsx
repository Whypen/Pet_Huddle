/**
 * /join — the whole of signing up, in one place, at one URL.
 *
 * Four states, morphing in place; no wizard, no route change, no step counter:
 *
 *   "welcome"→ one clear choice: create an account or log in.
 *   "form"   → provider buttons, or email / password / full name / date of
 *              birth / district. Submitting sends the verification email.
 *   "signin" → email/password and the app's existing MFA contract.
 *   "verify" → the same container, same URL, cross-faded. Waits for the address
 *              to be confirmed and finishes signup itself the moment it is.
 *
 * ── Where this knowingly departs from WEB_UX_SPEC.md ─────────────────────────
 * The spec's State 2 is a six-box code input. The deployed backend cannot serve
 * one, and building it would mean building a second verification system, which
 * `WEB_BUILD_RULES.md:102` forbids:
 *
 *   send-pre-signup-verify/index.ts:212   const nextToken = crypto.randomUUID();
 *   send-pre-signup-verify/index.ts:245     verify_url: verifyUrl,
 *   confirm-pre-signup-verify/index.ts:51  const token = String(body.token…)
 *   confirm-pre-signup-verify/index.ts:53  if (!token) return json({ error: "token_required" }, 400);
 *
 * A UUID is emailed as a link; there is no code to type and no endpoint that
 * accepts one. So State 2 is "check your email" plus polling of
 * `get-pre-signup-verify-status`, which is what the native flow does. Every
 * other State 2 requirement — morph in place, no URL change, Change email with
 * values intact, 60s resend countdown, inline errors — is implemented as
 * specified. This is flagged for decision; if a code is wanted, it needs an
 * endpoint first.
 *
 * ── Constraints, stated so they are not "simplified" away ────────────────────
 *
 *  • The proof is mandatory server-side. `auth-signup/index.ts:658-660` returns
 *    403 `signup_proof_required` without it, so an account genuinely cannot be
 *    created before the address is verified. Email signups therefore arrive
 *    already verified, per WEB_BUILD_RULES.md:71.
 *
 *  • Turnstile. The token is spent by `send-pre-signup-verify`, so `authSignup`
 *    is called with the proof and NO turnstile token — as SignupName.tsx:150-152.
 *
 *  • Session wait. The session is issued by a trigger, not synchronously with
 *    the signup response. Moving on early lands on a guarded route with none.
 *
 *  • `auth-signup` owns the initial profile seed through its trusted server
 *    client. The browser never writes verification or onboarding state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Circle, Lock, Mail, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useTurnstile } from "@/hooks/useTurnstile";
import { readAuthIntent, resolveAuthReturnTo, takeAuthIntent, takeAuthReturnTo, writeAuthReturnTo } from "@/lib/authIntent";
import { FormField } from "@/components/ui/FormField";
import { credentialsSchema, isAtLeast13, isNotFuture, isValidDate, nameSchema } from "@/lib/authSchemas";
import { resolveAuthWallCopy } from "@/components/auth/authWallCopy";
import { HuddleWordmark } from "@/components/brand/HuddleWordmark";
import { WebBrandMedia } from "@/components/brand/WebBrandMedia";
import { authSignup } from "@/lib/publicAuthApi";
import { readPresignupStatus, sendPresignupVerify } from "@/lib/presignupVerify";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@/lib/handleFromName";
import {
  LOCATION_DEBOUNCE_MS,
  countryOptions,
  extractCountryFromPlaceLabel,
  extractDistrictFromPlaceLabel,
  searchLocations,
  type LocationSuggestion,
} from "@/lib/locationGeocode";
import { buildProfileAreaCity, canonicalProfileCity } from "@/lib/profileLocation";
import { challengeAndVerifyTotp, getAuthenticatorAssurance, mapMfaError } from "@/lib/mfa";
import { FormFieldOtp } from "@/components/ui/FormFieldOtp";
import { enablePersistentSession } from "@/lib/authSessionPersistence";
import { mapAuthFailureMessage } from "@/lib/authErrorMessages";
import { HelpSupportDialog } from "@/components/support/HelpSupportDialog";
import { LegalModal } from "@/components/modals/LegalModal";

type Provider = "apple" | "google";

const TERMS_VERSION = "web_join_v1";

// Matches SignupVerify.tsx's retry budget (12 × 250ms = 3s). Same trigger, same
// propagation delay, so the same tolerance applies.
const SESSION_RETRY_COUNT = 12;
const SESSION_RETRY_DELAY_MS = 250;

// Slow enough not to hammer the function, fast enough that opening the link on a
// phone feels like it lands here immediately.
const VERIFY_POLL_MS = 3000;

// WEB_UX_SPEC.md:81 — resend is disabled while counting.
const RESEND_COUNTDOWN_SECONDS = 60;

const PROVIDER_LABEL: Record<Provider, string> = { apple: "Apple", google: "Google" };

/**
 * Mirrors credentialsSchema (authSchemas.ts:97-102) exactly — 8+, uppercase,
 * number, special. Stated up front and ticked live so a visitor cannot be told
 * their password is fine and then rejected for a rule that was never shown.
 * If the schema changes, this list has to change with it.
 */
const PASSWORD_RULES: Array<{ label: string; test: (value: string) => boolean }> = [
  { label: "8+ characters", test: (v) => v.length >= 8 },
  { label: "Uppercase", test: (v) => /[A-Z]/.test(v) },
  { label: "Number", test: (v) => /[0-9]/.test(v) },
  { label: "Special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const Spinner = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] animate-spin" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const AppleMark = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
    <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.83-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.52zM14.9 5.6c.6-.74 1.01-1.75.9-2.77-.87.04-1.94.59-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.6-1.25z" />
  </svg>
);

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.57-5.17 3.57-8.87z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

const Join = () => {
  const navigate = useNavigate();
  const { user, hydrating, refreshProfile, signIn } = useAuth();

  const [stage, setStage] = useState<"welcome" | "form" | "signin" | "verify">(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "signin") return "signin";
    return readAuthIntent() ? "form" : "welcome";
  });
  const [oauthBusy, setOauthBusy] = useState<Provider | null>(null);
  const [oauthError, setOauthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [socialId, setSocialId] = useState("");
  const [dob, setDob] = useState("");

  const [district, setDistrict] = useState("");
  const [districtSuggestions, setDistrictSuggestions] = useState<LocationSuggestion[]>([]);
  const [districtLoading, setDistrictLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [biasPoint, setBiasPoint] = useState<{ lat: number; lng: number } | null>(null);
  // The country is not a visible field (it is not in the spec's layout). It
  // scopes the area search and is replaced by the geocoded country once an area
  // is chosen — the area is the more specific signal.
  const [country, setCountry] = useState("");
  // The whole suggestion, not just its district — a district on its own is
  // meaningless and the app stores four fields together.
  const [chosenLocation, setChosenLocation] = useState<LocationSuggestion | null>(null);

  const [resendKey, setResendKey] = useState("");
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Inline, never a toast — WEB_UX_SPEC.md:17.
  const [formError, setFormError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [emailTaken, setEmailTaken] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState("");
  const [verifyExpired, setVerifyExpired] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [pendingLoginReturn, setPendingLoginReturn] = useState<string | null | undefined>(undefined);
  const loginReturnInFlightRef = useRef(false);

  // Errors show on blur, never on keystroke — nobody wants to be told their
  // email is invalid while typing the first character of it.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (fieldName: string) => setTouched((prev) => ({ ...prev, [fieldName]: true }));

  const turnstile = useTurnstile("signup");
  const emailRef = useRef<HTMLInputElement>(null);

  const intent = useMemo(() => readAuthIntent(), []);
  const copy = resolveAuthWallCopy(intent?.type);

  /**
   * `?next=` from the auth wall, so someone who was mid-task lands back where
   * they were. Same guard as lib/authIntent.ts: a path only, and never a
   * protocol-relative "//evil.com", which the browser treats as absolute. An
   * attacker-supplied query param is an open redirect otherwise.
   */
  const nextPath = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("next") || "";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  }, []);
  const [supportOpen, setSupportOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState<"terms" | "privacy" | "cookies" | null>(null);

  useEffect(() => {
    document.title = "Join huddle";
  }, []);

  // WEB_UX_SPEC.md:13 — autofocus the first field on open.
  useEffect(() => {
    if (stage === "form") emailRef.current?.focus();
  }, [stage]);

  const resolveReturnTo = useCallback(() => {
    const resumed = takeAuthIntent();
    return resolveAuthReturnTo(resumed?.returnTo, takeAuthReturnTo(), nextPath);
  }, [nextPath]);

  const finishLoginNavigation = useCallback(() => {
    setPendingLoginReturn(resolveReturnTo());
  }, [resolveReturnTo]);

  useEffect(() => {
    if (pendingLoginReturn === undefined || !user?.id || hydrating || loginReturnInFlightRef.current) return;
    loginReturnInFlightRef.current = true;
    void refreshProfile().finally(() => {
      const destination = pendingLoginReturn;
      setPendingLoginReturn(undefined);
      loginReturnInFlightRef.current = false;
      navigate(resolveAuthReturnTo(destination), { replace: true });
    });
  }, [hydrating, navigate, pendingLoginReturn, refreshProfile, user?.id]);

  const returnFromAuth = useCallback(() => {
    setMfaFactorId(null);
    setMfaCode("");
    const resumed = takeAuthIntent();
    navigate(resolveAuthReturnTo(resumed?.returnTo, takeAuthReturnTo(), nextPath), { replace: true });
  }, [navigate, nextPath]);

  const handleLogin = async () => {
    if (!loginEmail.trim() || loginPassword.length < 8 || loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const result = await signIn(loginEmail.trim().toLowerCase(), loginPassword);
      if (result.error) {
        setLoginError(mapAuthFailureMessage(result.error.message));
        return;
      }
      localStorage.setItem("auth_login_identifier", loginEmail.trim().toLowerCase());
      enablePersistentSession();
      if (result.mfaRequired && result.mfaFactorId) {
        setMfaFactorId(result.mfaFactorId);
        setMfaCode("");
        return;
      }
      finishLoginNavigation();
    } finally {
      setLoginBusy(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaFactorId || mfaCode.length < 6 || mfaBusy) return;
    setMfaBusy(true);
    setMfaError("");
    try {
      await challengeAndVerifyTotp(supabase, mfaFactorId, mfaCode);
      const assurance = await getAuthenticatorAssurance(supabase);
      if (assurance.currentLevel !== "aal2") throw new Error("aal_not_upgraded");
      finishLoginNavigation();
    } catch (error) {
      setMfaError(mapMfaError(error as { message?: string }, "Couldn’t verify your 2FA code."));
      setMfaCode("");
    } finally {
      setMfaBusy(false);
    }
  };

  /**
   * District pre-fill, from Vercel's own edge geo headers via `api/geo.ts`.
   * No third-party geolocation vendor is involved and the IP never leaves the
   * edge.
   *
   * Never blocking, per WEB_UX_SPEC.md:55 — if the lookup fails or the headers
   * are absent (local dev), the field stays empty for them to type. It also
   * yields to anything already typed, so a slow response cannot overwrite input.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/geo");
        if (!response.ok) return;
        const geo = (await response.json()) as { city?: string; country?: string };
        if (cancelled) return;
        const resolvedCountry = String(geo?.country || "").trim().toUpperCase();
        if (resolvedCountry && countryOptions.some((option) => option.code === resolvedCountry)) {
          setCountry((current) => current || resolvedCountry);
        }
        const resolvedCity = String(geo?.city || "").trim();
        // Only ever a prefill: never clobber what someone has already typed.
        if (resolvedCity) setDistrict((current) => current || resolvedCity);
      } catch {
        // Offline or no edge headers — leave the field empty and let them type.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // WEB_UX_SPEC.md:81 — 60s countdown, disabled while counting.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const fieldIssues = useMemo(() => {
    const result = credentialsSchema.safeParse({
      email: email.trim(),
      // Phone is not asked for at signup; satisfy the shape so the email and
      // password rules can be evaluated on their own.
      phone: "+10000000000",
      password,
      confirmPassword,
    });
    if (result.success) return {} as Record<string, string>;
    const issues: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] || "");
      if (key && !issues[key]) issues[key] = issue.message;
    }
    return issues;
  }, [email, password, confirmPassword]);

  const nameIssue = nameSchema.safeParse({ display_name: name.trim() });
  const dobValid = Boolean(dob) && isValidDate(dob) && isNotFuture(dob) && isAtLeast13(dob);
  const districtValid = district.trim().length > 0;
  const socialIdValid = new RegExp(`^[a-z0-9._]{${HANDLE_MIN_LENGTH},${HANDLE_MAX_LENGTH}}$`).test(socialId.trim().toLowerCase());

  const emailError = emailTaken
    ? "That email already has an account."
    : touched.email
      ? fieldIssues.email || null
      : null;
  const passwordError = touched.password ? fieldIssues.password || null : null;
  const confirmPasswordError = touched.confirmPassword ? fieldIssues.confirmPassword || null : null;
  const socialIdError = touched.socialId && !socialIdValid ? `Use ${HANDLE_MIN_LENGTH}–${HANDLE_MAX_LENGTH} lowercase letters, numbers, dots or underscores.` : null;
  const nameError =
    touched.name && !nameIssue.success
      ? nameIssue.error.issues[0]?.message || "Enter your name."
      : null;
  const dobError = (() => {
    if (!touched.dob || !dob) return null;
    if (!isValidDate(dob) || !isNotFuture(dob)) return "Enter a valid date of birth.";
    // WEB_UX_SPEC.md:54 — exact wording.
    if (!isAtLeast13(dob)) return "You must be 13 or older to join huddle.";
    return null;
  })();
  const districtError = touched.district && !districtValid ? "Add the area you're in." : null;

  const allValid =
    Object.keys(fieldIssues).length === 0 && nameIssue.success && socialIdValid && dobValid && districtValid;
  const canSubmit = allValid && !submitting && !emailTaken;

  // The latest date that satisfies the thirteen-year floor, so the picker cannot
  // offer a date the form will then reject.
  const maxDob = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear() - 13, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  }, []);

  // EditProfile.tsx:1134-1175 — debounced, abortable, country-scoped search.
  useEffect(() => {
    if (stage !== "form") return;
    const query = district.trim();
    if (!query || chosenLocation) {
      setDistrictSuggestions([]);
      setDistrictLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDistrictLoading(true);
      try {
        const countryName = countryOptions.find((option) => option.code === country)?.label || "";
        const results = await searchLocations(query, {
          countryCode: country,
          countryName,
          biasPoint,
          signal: controller.signal,
        });
        setDistrictSuggestions(results);
      } finally {
        setDistrictLoading(false);
      }
    }, LOCATION_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [stage, district, chosenLocation, country, biasPoint]);

  // EditProfile.tsx:1348-1378 — resolve the current position, fill the field.
  // Never blocking: a refusal or a failure leaves the field typed-in, per
  // WEB_UX_SPEC.md:55.
  const handleCurrentLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location isn't available here — type your area instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setBiasPoint({ lat, lng });
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?language=en&access_token=${MAPBOX_ACCESS_TOKEN}`;
          const response = await fetch(url);
          const data = await response.json();
          const first = Array.isArray(data?.features) && data.features.length > 0 ? data.features[0] : null;
          if (first?.place_name) {
            const resolvedDistrict = extractDistrictFromPlaceLabel(first.place_name);
            const resolvedCountry = extractCountryFromPlaceLabel(first.place_name);
            setDistrict(resolvedDistrict);
            setChosenLocation({
              label: first.place_name,
              lat,
              lng,
              district: resolvedDistrict,
              country: resolvedCountry,
              city: null,
            });
            const matchedCode = countryOptions.find(
              (option) => option.label.toLowerCase() === resolvedCountry.toLowerCase(),
            )?.code;
            if (matchedCode) setCountry(matchedCode);
            return;
          }
          setLocationError("We couldn't match that location. Search your area instead.");
        } catch {
          setLocationError("Location lookup is unavailable. Search your area instead.");
        }
      },
      (error) => setLocationError(
        error.code === error.PERMISSION_DENIED
          ? "Location is blocked for this site. Allow it in your browser, or search your area."
          : "We couldn't get your location. Search your area instead."
      ),
    );
  };

  const waitForSession = async () => {
    for (let attempt = 0; attempt < SESSION_RETRY_COUNT; attempt += 1) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) return data.session;
      await new Promise((resolve) => window.setTimeout(resolve, SESSION_RETRY_DELAY_MS));
    }
    return null;
  };

  const continueWithProvider = async (provider: Provider) => {
    setOauthError("");
    setOauthBusy(provider);
    const providerReturnTo = intent?.returnTo || nextPath;
    if (providerReturnTo) writeAuthReturnTo(providerReturnTo);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setOauthBusy(null);
      // WEB_UX_SPEC.md:88 — a cancel is not an error and says nothing. Only a
      // genuine failure speaks up.
      const message = String(error.message || "").toLowerCase();
      const cancelled =
        message.includes("cancel") || message.includes("closed") || message.includes("abort");
      if (!cancelled) {
        setOauthError(`Couldn't connect to ${PROVIDER_LABEL[provider]}. Try again or use email.`);
      }
    }
  };

  /**
   * Runs once the address is confirmed and a proof comes back: creates the
   * account, then writes the profile. Guarded by a ref because the poll can fire
   * again while the first run is still in flight, and creating the account twice
   * is not a recoverable mistake.
   */
  const completedRef = useRef(false);
  const finishSignup = useCallback(
    async (signupProof: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      setFinishing(true);
      try {
        const cleanEmail = email.trim().toLowerCase();
        const displayName = name.trim();
        const cleanSocialId = socialId.trim().toLowerCase();

        // No turnstile token here: it was spent by send-pre-signup-verify. The
        // proof replaces it, exactly as SignupName.tsx:150-152 does.
        const { error: signupError } = await authSignup({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              display_name: displayName,
              social_id: cleanSocialId,
              dob,
              location_country: chosenLocation?.country || undefined,
              location_city: chosenLocation
                ? canonicalProfileCity(chosenLocation.city, chosenLocation.country)
                : undefined,
              location_district: chosenLocation?.district || district.trim(),
              location_name: chosenLocation
                ? buildProfileAreaCity(
                    chosenLocation.district,
                    chosenLocation.city,
                    chosenLocation.country,
                  )
                : district.trim(),
              onboarding_completed: true,
              consent_terms_privacy_at: new Date().toISOString(),
              consent_version: TERMS_VERSION,
            },
          },
          signup_proof: signupProof,
        });
        if (signupError) {
          completedRef.current = false;
          setVerifyNotice(signupError.message || "Couldn't create your account. Try again.");
          return;
        }

        const session = await waitForSession();
        if (!session) {
          setLoginEmail(cleanEmail);
          setLoginError("Your account is ready. Sign in to continue.");
          setStage("signin");
          return;
        }

        // auth-signup seeds the verified profile through its service-role path.
        // Do not duplicate that write from the browser: profiles now expose only
        // ordinary owner-editable columns, never verification/onboarding state.
        await refreshProfile();
        navigate(resolveReturnTo(), { replace: true });
      } catch (err) {
        completedRef.current = false;
        console.error("[join] finish failed", err);
        setVerifyNotice("Something went wrong. Try sending the link again.");
      } finally {
        setFinishing(false);
      }
    },
    [email, name, socialId, password, dob, district, chosenLocation, navigate, refreshProfile, resolveReturnTo],
  );

  // The waiting half of the page. Polls until the address is confirmed, then
  // hands off to finishSignup.
  useEffect(() => {
    if (stage !== "verify" || !resendKey) return;
    let cancelled = false;

    const check = async () => {
      const status = await readPresignupStatus(email, resendKey);
      if (cancelled || !status) return;
      if (status.expired) {
        setVerifyExpired(true);
        setResendIn(0);
        return;
      }
      if (status.signupProof) void finishSignup(status.signupProof);
    };

    void check();
    const timer = window.setInterval(() => void check(), VERIFY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [stage, resendKey, email, finishSignup]);

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setFormError("");
    setEmailTaken(false);
    setSubmitting(true);
    try {
      const { data: socialTaken, error: socialCheckError } = await supabase.rpc("is_social_id_taken", { p_social_id: socialId.trim().toLowerCase() });
      if (socialCheckError) {
        setFormError("Couldn't check that Social ID right now. Try again.");
        return;
      }
      if (socialTaken) {
        setTouched((current) => ({ ...current, socialId: true }));
        setFormError("That Social ID is already taken.");
        return;
      }
      const { data: gate, error: gateError } = await supabase.rpc("check_identifier_registered", {
        p_email: cleanEmail,
        p_phone: "",
      });

      // Fail CLOSED: if the block/duplicate check itself failed we do not know
      // whether this email is blocked, and proceeding would route around it.
      if (gateError) {
        console.error("[join] duplicate check failed", gateError);
        setFormError("Couldn't check those details right now. Try again.");
        return;
      }

      const gateStatus = gate as {
        registered?: boolean;
        blocked?: boolean;
        review_required?: boolean;
        public_message?: string | null;
      } | null;

      if (gateStatus?.blocked) {
        setFormError(
          String(gateStatus.public_message || "").trim() ||
            "This account is unavailable. Contact support@huddle.pet if that seems wrong.",
        );
        return;
      }
      if (gateStatus?.review_required) {
        setFormError("Signup is temporarily unavailable. Please try again later.");
        return;
      }
      if (gateStatus?.registered) {
        // WEB_UX_SPEC.md:94 — inline under the email field, with a Log in link,
        // never a silent switch to the login form.
        setEmailTaken(true);
        return;
      }

      const token = turnstile.getToken?.() || turnstile.token || "";
      if (!token) {
        setFormError("Human verification is still loading. Give it a moment and try again.");
        return;
      }

      const sent = await sendPresignupVerify(cleanEmail, token);
      if (!sent) {
        turnstile.reset?.();
        // Everything stays filled — WEB_UX_SPEC.md:96.
        setFormError("Couldn't send your link. Check your connection and try again.");
        return;
      }
      turnstile.consumeToken?.();
      setResendKey(sent.resendKey);
      setVerifyExpired(false);
      setVerifyNotice("");
      setResendIn(RESEND_COUNTDOWN_SECONDS);
      setStage("verify");
    } catch (err) {
      console.error("[join] signup failed", err);
      setFormError("Something went wrong. Your details are safe — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setVerifyNotice("");
    try {
      // The resend key stands in for a fresh Turnstile token, which is why the
      // widget is not re-challenged here.
      const sent = await sendPresignupVerify(email.trim().toLowerCase(), "", resendKey);
      if (!sent) {
        setVerifyNotice("Couldn't send that again. Try once more in a moment.");
        return;
      }
      setResendKey(sent.resendKey || resendKey);
      setVerifyExpired(false);
      setVerifyNotice("New link sent.");
      setResendIn(RESEND_COUNTDOWN_SECONDS);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="relative min-h-[100svh] w-full overflow-hidden bg-background px-5 py-10">
      <button type="button" onClick={() => setSupportOpen(true)} className="absolute right-5 top-5 z-10 min-h-11 min-w-12 text-right text-[15px] font-semibold leading-6 text-[rgba(66,73,101,0.45)]">
        Help
      </button>
      <HelpSupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
      <LegalModal isOpen={legalOpen !== null} onClose={() => setLegalOpen(null)} type={legalOpen || "terms"} />
      {/* Warmth. A signup page on flat white reads like a form, not a place. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(33,69,207,0.10),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-[38%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(191,255,0,0.14),transparent_70%)]"
      />

      <div className="relative mx-auto flex w-full max-w-[420px] flex-col">
        {stage !== "welcome" && stage !== "signin" ? (
          <button type="button" onClick={returnFromAuth} aria-label="Return" className="self-start">
            <HuddleWordmark size={30} />
          </button>
        ) : null}

        {stage === "welcome" ? (
          <div className="join-morph mt-2 flex min-h-[calc(100svh-5rem)] flex-col justify-center">
            <div className="flex flex-col items-center text-center">
              <WebBrandMedia size={96} />
              <HuddleWordmark size={25} className="mt-1" />
            </div>

            <div className="mt-8 rounded-[24px] border border-border/70 bg-white/80 p-4 shadow-[0_18px_60px_rgba(33,69,207,0.10)] backdrop-blur-xl sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setStage("form")}
                className="neu-primary flex h-12 w-full items-center justify-center rounded-[14px] text-[15px] font-bold"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setStage("signin")}
                className="flex h-12 w-full items-center justify-center rounded-[14px] border border-border bg-white/75 text-[15px] font-bold text-brandText shadow-sm transition-transform active:scale-[0.985]"
              >
                Sign in
              </button>
            </div>

            <div className="my-6 flex items-center gap-3.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70">
              <span className="h-px flex-1 bg-border" aria-hidden />
              or
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={oauthBusy !== null}
                onClick={() => void continueWithProvider("apple")}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] bg-black text-[15px] font-bold text-white transition-transform active:scale-[0.985] disabled:opacity-60"
              >
                {oauthBusy === "apple" ? <Spinner /> : <AppleMark />}
                Continue with Apple
              </button>
              <button
                type="button"
                disabled={oauthBusy !== null}
                onClick={() => void continueWithProvider("google")}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-border bg-white text-[15px] font-bold text-[#1f2328] shadow-sm transition-transform active:scale-[0.985] disabled:opacity-60"
              >
                {oauthBusy === "google" ? <Spinner /> : <GoogleMark />}
                Continue with Google
              </button>
            </div>
            {oauthError ? <p className="mt-2 text-[12px] font-medium text-[var(--color-error,#E84545)]" role="alert">{oauthError}</p> : null}

            <p className="mt-8 text-center text-[12px] font-medium leading-5 text-brandText/[0.72]">
              By continuing, you agree to our <button type="button" onClick={() => setLegalOpen("terms")} className="font-semibold text-brandBlue">Terms of Service</button>. Learn how we process your data in <button type="button" onClick={() => setLegalOpen("privacy")} className="font-semibold text-brandBlue">Privacy Policy</button> and <button type="button" onClick={() => setLegalOpen("cookies")} className="font-semibold text-brandBlue">Cookies Policy</button>.
            </p>
            </div>
          </div>
        ) : stage === "form" ? (
          <div className="join-morph">
            <div className="mt-10">
              {intent ? (
                <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em] text-brandBlue">
                  <span
                    className="h-[5px] w-[5px] rounded-full bg-[#BFFF00] shadow-[0_0_0_3px_rgba(191,255,0,0.3)]"
                    aria-hidden
                  />
                  {copy.eyebrow}
                </p>
              ) : null}
              <h1 className="mt-2.5 text-[26px] md:text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-brandText text-balance">
                {intent ? copy.title : "Join huddle"}
              </h1>
              <p className="mt-2 text-[15px] font-medium leading-relaxed text-muted-foreground text-pretty">
                Find pets, people and help nearby.
              </p>
            </div>

            <div className="mt-7 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={oauthBusy !== null || submitting}
                onClick={() => void continueWithProvider("apple")}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] bg-black text-[15px] font-bold text-white transition-transform active:scale-[0.985] disabled:opacity-60 dark:border dark:border-white/15 dark:bg-white dark:text-black"
              >
                {oauthBusy === "apple" ? <Spinner /> : <AppleMark />}
                Continue with Apple
              </button>

              <button
                type="button"
                disabled={oauthBusy !== null || submitting}
                onClick={() => void continueWithProvider("google")}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-border bg-white text-[15px] font-bold text-[#1f2328] shadow-sm transition-transform active:scale-[0.985] disabled:opacity-60 dark:border-white/25"
              >
                {oauthBusy === "google" ? <Spinner /> : <GoogleMark />}
                Continue with Google
              </button>
              {oauthError ? (
                <p className="pl-1 text-[12px] font-medium text-[var(--color-error,#E84545)]" role="alert">
                  {oauthError}
                </p>
              ) : null}
            </div>

            <div className="my-5 flex items-center gap-3.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70">
              <span className="h-px flex-1 bg-border" aria-hidden />
              or
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            {/* Enter submits, because it is a real form with a submit button. */}
            <form
              className="flex flex-col gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void handleSubmit();
              }}
            >
              <FormField
                ref={emailRef}
                label="Email"
                id="join-email"
                type="email"
                inputMode="email"
                placeholder="you@example.com"
                autoComplete="email"
                reserveMessageSpace
                error={emailError || undefined}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailTaken(false);
                }}
                onBlur={() => markTouched("email")}
              />
              {emailTaken ? (
                <p className="-mt-1 mb-1 pl-1 text-[12px] font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail(email.trim().toLowerCase());
                      setStage("signin");
                    }}
                    className="font-bold text-brandBlue"
                  >
                    Sign in
                  </button>{" "}
                  instead.
                </p>
              ) : null}

              <div>
                <FormField
                  label="Password"
                  id="join-password"
                  type="password"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  aria-describedby="join-password-rules"
                  error={undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => markTouched("password")}
                />
                {/* The rules are stated up front and tick live, rather than
                    being revealed one rejection at a time after submitting.
                    The old placeholder said "At least 8 characters", which is
                    only the first of four — eight lowercase letters looked
                    accepted and then failed. */}
                <ul
                  id="join-password-rules"
                  className="mb-3 mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-1"
                >
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(password);
                    return (
                      <li
                        key={rule.label}
                        className={[
                          "inline-flex items-center gap-1 text-[11.5px] font-semibold transition-colors",
                          met ? "text-success" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {met ? (
                          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                        ) : (
                          <Circle className="h-2.5 w-2.5 opacity-45" strokeWidth={2} aria-hidden />
                        )}
                        {/* Screen readers get the state in words, not colour. */}
                        <span className="sr-only">{met ? "met:" : "not met:"}</span>
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <FormField
                label="Confirm password"
                id="join-confirm-password"
                type="password"
                placeholder="Type your password again"
                autoComplete="new-password"
                reserveMessageSpace
                error={confirmPasswordError || undefined}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onBlur={() => markTouched("confirmPassword")}
              />

              <FormField
                label="Full name"
                id="join-name"
                placeholder="Priya Ramesh"
                autoComplete="name"
                reserveMessageSpace
                error={nameError || undefined}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => markTouched("name")}
              />

              <FormField
                label="Social ID"
                id="join-social-id"
                placeholder="your.name"
                autoComplete="username"
                reserveMessageSpace
                error={socialIdError || undefined}
                value={socialId}
                onChange={(event) => setSocialId(event.target.value.toLowerCase())}
                onBlur={() => markTouched("socialId")}
              />

              <FormField
                label="Date of birth"
                id="join-dob"
                type="date"
                autoComplete="bday"
                max={maxDob}
                reserveMessageSpace
                error={dobError || undefined}
                value={dob}
                onChange={(event) => setDob(event.target.value)}
                onBlur={() => markTouched("dob")}
              />

              <div className="relative">
                <FormField
                  label="District"
                  id="join-district"
                  type="search"
                  placeholder="Search your area"
                  autoComplete="address-level2"
                  reserveMessageSpace
                  error={districtError || locationError || undefined}
                  hint={districtLoading ? "Finding areas…" : undefined}
                  trailingSlot={
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestionsOpen(true);
                        handleCurrentLocation();
                      }}
                      className="text-muted-foreground p-1"
                      aria-label="Use current location"
                    >
                      <MapPin className="w-4 h-4" />
                    </button>
                  }
                  value={district}
                  onChange={(event) => {
                    setDistrict(event.target.value);
                    setLocationError("");
                    setChosenLocation(null);
                    setSuggestionsOpen(true);
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => {
                    markTouched("district");
                    // EditProfile.tsx:2851-2853 — 120ms so a click on a
                    // suggestion lands before the list unmounts.
                    window.setTimeout(() => setSuggestionsOpen(false), 120);
                  }}
                />
                {suggestionsOpen && districtSuggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[14px] border border-border bg-white shadow-[0_16px_48px_-8px_hsl(220_20%_20%/.18)]">
                    {districtSuggestions.map((suggestion) => (
                      <li key={`${suggestion.label}:${suggestion.lat},${suggestion.lng}`}>
                        <button
                          type="button"
                          className="w-full px-4 py-2.5 text-left text-[15px] font-medium text-brandText transition-colors hover:bg-muted"
                          onClick={() => {
                            // EditProfile.tsx:2874-2890. The field shows the
                            // DISTRICT (the full label is only the list's display
                            // text), and the geocoded country replaces the locale
                            // guess — the area is the more specific signal.
                            setDistrict(suggestion.district);
                            setChosenLocation(suggestion);
                            setDistrictSuggestions([]);
                            const matchedCode = countryOptions.find(
                              (option) => option.label.toLowerCase() === suggestion.country.toLowerCase(),
                            )?.code;
                            if (matchedCode) setCountry(matchedCode);
                          }}
                        >
                          {suggestion.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="min-h-[65px]">
                <div ref={turnstile.setContainer} />
                {turnstile.siteKeyMissing ? (
                  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)]">
                    Human verification is unavailable right now. Please try again later.
                  </p>
                ) : null}
              </div>

              {formError ? (
                <p className="mb-1 pl-1 text-[12px] font-medium text-[var(--color-error,#E84545)]" role="alert">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="neu-primary flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold disabled:opacity-60"
              >
                {submitting ? <Spinner /> : null}
                {submitting ? "Creating account…" : "Create account"}
              </button>

            </form>

            <p className="mt-4 text-center text-[13px] font-medium text-muted-foreground">
              Already have an account?{" "}
              <button type="button" onClick={() => setStage("signin")} className="font-bold text-brandBlue">
                Sign in
              </button>
            </p>

            <p className="mt-7 text-center text-[12px] font-medium leading-5 text-brandText/70">
              By continuing, you agree to our{" "}
              <button
                type="button"
                onClick={() => setLegalOpen("terms")}
                className="font-semibold text-brandBlue no-underline"
              >
                Terms of Service
              </button>
              . Learn how we process your data in{" "}
              <button
                type="button"
                onClick={() => setLegalOpen("privacy")}
                className="font-semibold text-brandBlue no-underline"
              >
                Privacy Policy
              </button>{" "}
              and{" "}
              <button type="button" onClick={() => setLegalOpen("cookies")} className="font-semibold text-brandBlue no-underline">
                Cookies Policy
              </button>.
            </p>
          </div>
        ) : stage === "signin" ? (
          <div className="join-morph mt-2">
            <button type="button" onClick={returnFromAuth} className="text-[13px] font-bold text-muted-foreground">← Return</button>
            <div className="mt-3 flex flex-col items-center text-center">
              <WebBrandMedia size={88} />
              <HuddleWordmark size={24} className="mt-1" />
              <p className="mt-2 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">noun — /ˈhʌd.əl/</p>
              <p className="mt-1 text-[14px] font-semibold text-brandText/75">a circle that knows first, acts fast.</p>
            </div>
            <div className="mt-8 rounded-[24px] border border-border/70 bg-white/80 p-4 shadow-[0_18px_60px_rgba(33,69,207,0.10)] backdrop-blur-xl">
              <h1 className="sr-only">Sign in to huddle</h1>
              {mfaFactorId ? (
              <div>
                <p className="mb-4 text-[14px] font-medium text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
                <FormFieldOtp value={mfaCode} onChange={setMfaCode} error={mfaError} disabled={mfaBusy} />
                <button type="button" disabled={mfaCode.length < 6 || mfaBusy} onClick={() => void handleMfaVerify()} className="neu-primary mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold disabled:opacity-60">
                  {mfaBusy ? <Spinner /> : null}{mfaBusy ? "Verifying…" : "Verify"}
                </button>
              </div>
            ) : (
              <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void handleLogin(); }}>
                <FormField type="email" autoComplete="email" placeholder="Email" leadingIcon={<Mail size={17} strokeWidth={1.75} />} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
                <FormField type="password" autoComplete="current-password" placeholder="Password" leadingIcon={<Lock size={17} strokeWidth={1.75} />} error={loginError || undefined} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                <div className="mb-3 flex items-center justify-end gap-3 text-[12px] font-semibold">
                  <Link to="/reset-password" className="text-brandBlue no-underline">Forgot password?</Link>
                </div>
                <button type="submit" disabled={!loginEmail.trim() || loginPassword.length < 8 || loginBusy} className="neu-primary flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold disabled:opacity-60">
                  {loginBusy ? <Spinner /> : null}{loginBusy ? "Signing in…" : "Sign in"}
                </button>
                <div className="my-4 flex items-center gap-3.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/70"><span className="h-px flex-1 bg-border" aria-hidden />or<span className="h-px flex-1 bg-border" aria-hidden /></div>
                <button type="button" disabled={oauthBusy !== null} onClick={() => void continueWithProvider("apple")} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] bg-black text-[15px] font-bold text-white disabled:opacity-60">{oauthBusy === "apple" ? <Spinner /> : <AppleMark />}Continue with Apple</button>
                <button type="button" disabled={oauthBusy !== null} onClick={() => void continueWithProvider("google")} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-border bg-white text-[15px] font-bold text-[#1f2328] shadow-sm disabled:opacity-60">{oauthBusy === "google" ? <Spinner /> : <GoogleMark />}Continue with Google</button>
                {oauthError ? <p className="text-[12px] font-medium text-[var(--color-error,#E84545)]" role="alert">{oauthError}</p> : null}
                <p className="mt-4 text-center text-[13px] font-medium text-muted-foreground">New to huddle? <button type="button" onClick={() => setStage("form")} className="font-bold text-brandBlue">Create account</button></p>
                <p className="mt-5 text-center text-[12px] font-medium leading-5 text-brandText/[0.72]">
                  By continuing, you agree to our{" "}
                  <button type="button" onClick={() => setLegalOpen("terms")} className="font-semibold text-brandBlue">
                    Terms of Service
                  </button>
                  . Learn how we process your data in{" "}
                  <button type="button" onClick={() => setLegalOpen("privacy")} className="font-semibold text-brandBlue">
                    Privacy Policy
                  </button>{" "}
                  and{" "}
                  <button type="button" onClick={() => setLegalOpen("cookies")} className="font-semibold text-brandBlue">
                    Cookies Policy
                  </button>.
                </p>
              </form>
              )}
            </div>
          </div>
        ) : (
          <div className="join-morph mt-14" aria-live="polite">
            <h1 className="text-[26px] md:text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-brandText text-balance">
              Check your email
            </h1>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-muted-foreground text-pretty">
              We sent a link to{" "}
              <span className="font-bold text-brandText">{email.trim().toLowerCase()}</span>.{" "}
              <button
                type="button"
                disabled={finishing}
                onClick={() => {
                  // Every value stays exactly as it was — nothing is cleared here.
                  setStage("form");
                  setResendKey("");
                  setVerifyExpired(false);
                  setVerifyNotice("");
                  setResendIn(0);
                  turnstile.reset?.();
                }}
                className="font-bold text-brandBlue underline-offset-2 hover:underline disabled:opacity-60"
              >
                Change
              </button>
            </p>
            <p className="mt-3 text-[15px] font-medium leading-relaxed text-muted-foreground text-pretty">
              Open it and this page finishes on its own — your phone works too.
            </p>

            <div className="mt-7 flex items-center gap-3 rounded-[14px] border border-border bg-white/60 px-4 py-3.5">
              {finishing ? (
                <>
                  <span className="text-brandBlue"><Spinner /></span>
                  <span className="text-[14px] font-bold text-brandText">Setting things up…</span>
                </>
              ) : verifyExpired ? (
                <span className="text-[14px] font-medium text-[var(--color-error,#E84545)]">
                  That link expired. Send a new one.
                </span>
              ) : (
                <>
                  <span className="join-pulse h-2 w-2 shrink-0 rounded-full bg-brandBlue" aria-hidden />
                  <span className="text-[14px] font-medium text-muted-foreground">
                    Waiting for you to open the link…
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              disabled={resending || finishing || (resendIn > 0 && !verifyExpired)}
              onClick={() => void handleResend()}
              className="neu-primary mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold disabled:opacity-60"
            >
              {resending ? <Spinner /> : null}
              {resending
                ? "Sending…"
                : resendIn > 0 && !verifyExpired
                  ? `Resend link (${resendIn}s)`
                  : "Resend link"}
            </button>

            <p className="mt-2 min-h-[16px] text-center text-[12px] font-medium text-muted-foreground" role="status">
              {verifyNotice}
            </p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Join;
