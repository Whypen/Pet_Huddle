import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldCheck, Fingerprint, Copy, Check, Smartphone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/layouts/PageHeader";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { NeuControl } from "@/components/ui/NeuControl";
import { GlassModal } from "@/components/ui/GlassModal";
import { supabase } from "@/integrations/supabase/client";
import {
  challengeAndVerifyTotp,
  clearUnverifiedTotpFactors,
  enrollTotp,
  getAuthenticatorAssurance,
  listTotpFactors,
  mapMfaError,
  unenrollFactor,
} from "@/lib/mfa";
import {
  addPasskeyHint,
  clearUnverifiedPasskeyFactors,
  enrollPasskey,
  isPasskeySupportedBrowser,
  listPasskeyFactors,
  mapPasskeyError,
  removePasskeyHint,
} from "@/lib/passkey";

type MFAPhase = "off" | "setup" | "verifying" | "active";
type PasskeyPhase = "unsupported" | "off" | "enrolling" | "active";

const StatusBadge: React.FC<{ on?: boolean; unavailable?: boolean; label?: string }> = ({ on, unavailable, label }) => (
  <span
    className={cn(
      "shrink-0 text-[11px] font-medium px-2.5 py-[5px] rounded-full",
      unavailable
        ? "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]"
        : on
        ? "bg-emerald-50 text-emerald-600"
        : "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]"
    )}
  >
    {label ?? (unavailable ? "Not available" : on ? "Active" : "Off")}
  </span>
);

const SecuritySettings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaPhase, setMfaPhase] = useState<MFAPhase>("off");
  const [otpCode, setOtpCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [disableMfaOpen, setDisableMfaOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUri, setSetupUri] = useState("");

  const [passkeyPhase, setPasskeyPhase] = useState<PasskeyPhase>("off");
  const [passkeyLoading, setPasskeyLoading] = useState(true);
  const [passkeyError, setPasskeyError] = useState("");
  const [passkeyFactorId, setPasskeyFactorId] = useState<string | null>(null);
  const [passkeyDeviceLabel, setPasskeyDeviceLabel] = useState("This device");
  const [removePasskeyOpen, setRemovePasskeyOpen] = useState(false);

  const loadMfaState = useCallback(async () => {
    setMfaLoading(true);
    setMfaError("");
    try {
      const factors = await listTotpFactors(supabase);
      const verified = factors.find((factor) => factor.status === "verified") || null;
      if (verified) {
        setTotpFactorId(verified.id);
        setMfaPhase("active");
      } else {
        if (factors.some((factor) => factor.status !== "verified")) {
          await clearUnverifiedTotpFactors(supabase);
        }
        setTotpFactorId(null);
        setMfaPhase("off");
        setSetupSecret("");
        setSetupUri("");
      }
    } catch {
      setMfaError("Couldn't load two-factor status. Please retry.");
      setMfaPhase("off");
    } finally {
      setMfaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMfaState();
  }, [loadMfaState]);

  const loadPasskeyState = useCallback(async () => {
    setPasskeyLoading(true);
    setPasskeyError("");
    try {
      const supported = await isPasskeySupportedBrowser();
      if (!supported) {
        setPasskeyPhase("unsupported");
        setPasskeyFactorId(null);
        setPasskeyDeviceLabel("This device");
        return;
      }
      const factors = await listPasskeyFactors(supabase);
      const verified = factors.find((factor) => factor.status === "verified") || null;
      if (verified) {
        setPasskeyPhase("active");
        setPasskeyFactorId(verified.id);
        setPasskeyDeviceLabel(verified.friendlyName || "This device");
      } else {
        setPasskeyPhase("off");
        setPasskeyFactorId(null);
        setPasskeyDeviceLabel("This device");
      }
    } catch (error) {
      setPasskeyPhase("off");
      setPasskeyError(mapPasskeyError(error as { message?: string }, "Couldn't load passkey status."));
    } finally {
      setPasskeyLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPasskeyState();
  }, [loadPasskeyState]);

  const handleOpenAuthApp = () => {
    if (!setupUri) {
      toast.error("Authenticator link not available. Use setup key manually.");
      return;
    }
    window.location.href = setupUri;
  };

  const handleCopySecret = async () => {
    if (!setupSecret) {
      toast.error("Setup key unavailable. Restart setup.");
      return;
    }
    try {
      await navigator.clipboard.writeText(setupSecret.replace(/\s/g, ""));
      setCopied(true);
      toast.success("Setup key copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically. Please copy the key manually.");
    }
  };

  const handleStartMfaSetup = async () => {
    setMfaError("");
    try {
      await clearUnverifiedTotpFactors(supabase);
      const enrollment = await enrollTotp(supabase);
      setTotpFactorId(enrollment.factorId);
      setSetupSecret(enrollment.secret || "");
      setSetupUri(enrollment.uri || "");
      if (!enrollment.secret || !enrollment.uri) {
        throw new Error("totp_setup_payload_missing");
      }
      setMfaPhase("setup");
    } catch (error) {
      toast.error(mapMfaError(error as { message?: string }, "Couldn't start two-factor setup."));
    }
  };

  const handleVerifyCode = async () => {
    const code = otpCode.trim();
    if (code.length < 6 || !totpFactorId) return;
    setMfaPhase("verifying");
    setMfaError("");
    try {
      await challengeAndVerifyTotp(supabase, totpFactorId, code);
      const aal = await getAuthenticatorAssurance(supabase);
      if (aal.currentLevel !== "aal2") {
        throw new Error("aal_not_upgraded");
      }
      setOtpCode("");
      setMfaPhase("active");
      toast.success("Two-factor authentication enabled.");
    } catch (error) {
      setMfaPhase("setup");
      setMfaError(mapMfaError(error as { message?: string }, "Could not verify code. Please try again."));
    }
  };

  const handleDisableMfa = async () => {
    if (!totpFactorId) {
      setDisableMfaOpen(false);
      return;
    }
    try {
      await unenrollFactor(supabase, totpFactorId);
      setMfaPhase("off");
      setTotpFactorId(null);
      setOtpCode("");
      setMfaError("");
      setSetupSecret("");
      setSetupUri("");
      toast.success("Authenticator app removed.");
    } catch (error) {
      toast.error(mapMfaError(error as { message?: string }, "Couldn't remove authenticator app right now."));
    } finally {
      setDisableMfaOpen(false);
    }
  };

  const handleSetupPasskey = async () => {
    setPasskeyError("");
    setPasskeyPhase("enrolling");
    try {
      await clearUnverifiedPasskeyFactors(supabase);
      await enrollPasskey(supabase, `huddle ${new Date().toLocaleDateString()}`);
      if (user?.email) addPasskeyHint(user.email);
      await loadPasskeyState();
      toast.success("Passkey enabled.");
    } catch (error) {
      setPasskeyPhase("off");
      setPasskeyError(mapPasskeyError(error as { message?: string }, "Couldn't set up passkey."));
    }
  };

  const handleRemovePasskey = async () => {
    if (!passkeyFactorId) {
      setRemovePasskeyOpen(false);
      return;
    }
    try {
      await unenrollFactor(supabase, passkeyFactorId);
      if (user?.email) removePasskeyHint(user.email);
      toast.success("Passkey removed.");
      setRemovePasskeyOpen(false);
      await loadPasskeyState();
    } catch (error) {
      toast.error(mapPasskeyError(error as { message?: string }, "Couldn't remove passkey right now."));
    }
  };

  return (
    <div className="h-full min-h-0 w-full max-w-full flex flex-col">
      <PageHeader
        title={<h1 className="text-base font-semibold text-[#424965] truncate">Extra Security</h1>}
        titleClassName="justify-start"
        showBack
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-[68px] px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)] space-y-4 max-w-md mx-auto">
          <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">PASSKEY</p>
          <InsetPanel>
            <div className="flex items-center gap-3 px-4 min-h-[52px] py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 flex items-center",
                      passkeyPhase === "active" ? "text-emerald-500" : passkeyPhase === "unsupported" ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"
                    )}
                  >
                    <Fingerprint size={16} strokeWidth={1.75} />
                  </span>
                  <span className="text-[15px] font-medium leading-snug text-[var(--text-primary,#424965)]">Passkey</span>
                </div>
                <span className="block text-[12px] text-[var(--text-tertiary)] mt-0.5 leading-[1.4]">
                  Use Face ID, Touch ID, or your screen lock PIN
                </span>
              </div>
              <StatusBadge on={passkeyPhase === "active"} unavailable={passkeyPhase === "unsupported"} />
            </div>

            {passkeyPhase === "unsupported" && (
              <>
                <InsetDivider />
                <div className="px-4 pt-2 pb-4">
                  <p className="text-[13px] leading-[1.55] text-[var(--text-tertiary)]">
                    Passkeys aren't available on this device. Try signing in on a compatible phone or tablet.
                  </p>
                </div>
              </>
            )}

            {passkeyPhase === "off" && (
              <>
                <InsetDivider />
                <div className="px-4 pt-3 pb-4 space-y-3">
                  <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">Sign in faster and more securely — no password needed.</p>
                  <NeuControl size="lg" fullWidth disabled={passkeyLoading} onClick={() => void handleSetupPasskey()}>
                    Set Up Passkey
                  </NeuControl>
                  {passkeyError ? <p className="text-[12px] text-[var(--color-error,#E84545)]">{passkeyError}</p> : null}
                </div>
              </>
            )}

            {passkeyPhase === "enrolling" && (
              <>
                <InsetDivider />
                <div className="px-4 pt-3 pb-4">
                  <NeuControl size="lg" fullWidth loading disabled>
                    Setting up…
                  </NeuControl>
                </div>
              </>
            )}

            {passkeyPhase === "active" && (
              <>
                <InsetDivider />
                <div className="flex items-center gap-3 px-4 py-[13px]">
                  <span className="shrink-0 text-[var(--text-secondary)] flex items-center">
                    <Smartphone size={16} strokeWidth={1.75} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[14px] font-[500] text-[var(--text-primary,#424965)] truncate">{passkeyDeviceLabel}</span>
                    <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">Registered passkey</span>
                  </div>
                </div>
                <InsetDivider />
                <InsetRow label="Remove Passkey" variant="danger" onClick={() => setRemovePasskeyOpen(true)} />
              </>
            )}
          </InsetPanel>

          <div className="px-1 pt-1">
            <p className="text-[13px] leading-[1.6] text-[var(--text-tertiary)]">
              Huddle supports passkeys and authenticator codes for added security. If you've set up a passkey, you can sign in with it instead of using an authenticator code.
            </p>
          </div>

          <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">AUTHENTICATOR APP</p>
          <InsetPanel>
            <div className="flex items-center gap-3 px-4 min-h-[52px] py-3">
              <span className={cn("shrink-0 flex items-center", mfaPhase === "active" ? "text-emerald-500" : "text-[var(--text-secondary)]")}>
                <ShieldCheck size={16} strokeWidth={1.75} />
              </span>
              <span className="flex-1 text-[15px] font-medium leading-snug text-[var(--text-primary,#424965)]">Authenticator App</span>
              <StatusBadge on={mfaPhase === "active"} />
            </div>

            {mfaPhase === "off" && (
              <>
                <InsetDivider />
                <div className="px-4 pt-3 pb-4 space-y-3">
                  <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                    Require a one-time code from your authenticator app each time you sign in.
                  </p>
                  <NeuControl size="lg" fullWidth disabled={mfaLoading} onClick={() => void handleStartMfaSetup()}>
                    Set Up Authenticator App
                  </NeuControl>
                </div>
              </>
            )}

            {(mfaPhase === "setup" || mfaPhase === "verifying") && (
              <>
                <InsetDivider />
                <div className="px-4 pt-4 pb-5 space-y-5">
                  <div className="space-y-2">
                    <p className="text-[13px] font-semibold text-[var(--text-primary,#424965)]">Step 1 — Add huddle to your authenticator app</p>
                    <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                      Tap the button below to open your authenticator app and add huddle automatically.
                    </p>
                    <NeuControl size="lg" fullWidth onClick={handleOpenAuthApp}>
                      <ExternalLink size={16} strokeWidth={1.75} />
                      Open Authenticator App
                    </NeuControl>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[rgba(163,168,190,0.25)]" />
                    <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">or enter key manually</span>
                    <div className="flex-1 h-px bg-[rgba(163,168,190,0.25)]" />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[13px] font-semibold text-[var(--text-primary,#424965)]">Setup Key</p>
                    <div className="form-field-rest flex w-full min-w-0 items-center gap-2 px-3 py-[11px]">
                      <span
                        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] font-medium tracking-[0.02em] text-[var(--text-primary,#424965)] leading-none"
                        title={setupSecret || "—"}
                      >
                        {setupSecret || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        aria-label="Copy setup key"
                        className={cn(
                          "shrink-0 flex items-center justify-center h-8 w-8 rounded-[10px]",
                          "transition-[background,color] duration-150",
                          "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/40"
                        )}
                      >
                        {copied ? <Check size={16} strokeWidth={2.5} className="text-emerald-500" /> : <Copy size={16} strokeWidth={1.75} />}
                      </button>
                    </div>
                    <p className="text-[12px] text-[var(--text-tertiary)] px-1 leading-[1.45]">
                      In your authenticator app, choose "Enter a setup key" and paste this code.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[13px] font-semibold text-[var(--text-primary,#424965)]">Step 2 — Enter the 6-digit code</p>
                    <div>
                      <div className={cn("form-field-rest relative flex items-center", mfaError && "form-field-error")}>
                        <input
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6-digit code"
                          autoComplete="one-time-code"
                          disabled={mfaPhase === "verifying"}
                          className="field-input-core pl-4 pr-4 focus:outline-none tracking-[0.18em] w-full"
                          value={otpCode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setOtpCode(val);
                            if (mfaError) setMfaError("");
                          }}
                        />
                      </div>
                      {mfaError ? (
                        <p role="alert" className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1 mt-1.5">{mfaError}</p>
                      ) : (
                        <p className="text-[12px] text-[var(--text-tertiary)] pl-1 mt-1.5">The code refreshes every 30 seconds.</p>
                      )}
                    </div>
                    <NeuControl
                      size="lg"
                      fullWidth
                      loading={mfaPhase === "verifying"}
                      disabled={otpCode.length < 6 || !totpFactorId}
                      onClick={() => void handleVerifyCode()}
                    >
                      Verify Code
                    </NeuControl>
                  </div>

                  <button
                    type="button"
                    className="w-full text-center text-[13px] text-[var(--text-tertiary)] py-1 bg-transparent border-0 cursor-pointer"
                    onClick={() => {
                      setMfaPhase("off");
                      setOtpCode("");
                      setMfaError("");
                      setSetupSecret("");
                      setSetupUri("");
                      setTotpFactorId(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {mfaPhase === "active" && (
              <>
                <InsetDivider />
                <InsetRow label="Remove Authenticator App" variant="danger" onClick={() => setDisableMfaOpen(true)} />
              </>
            )}
          </InsetPanel>
        </div>
      </div>

      <GlassModal isOpen={disableMfaOpen} onClose={() => setDisableMfaOpen(false)} title="Remove Authenticator App?">
        <p className="text-[14px] leading-[1.55] text-[var(--text-secondary)] mb-5">
          You'll no longer need a code to sign in. This reduces your account security.
        </p>
        <div className="flex gap-3">
          <NeuControl size="lg" variant="secondary" fullWidth onClick={() => setDisableMfaOpen(false)}>
            Cancel
          </NeuControl>
          <NeuControl size="lg" variant="danger" fullWidth onClick={() => void handleDisableMfa()}>
            Remove
          </NeuControl>
        </div>
      </GlassModal>

      <GlassModal isOpen={removePasskeyOpen} onClose={() => setRemovePasskeyOpen(false)} title="Remove Passkey?">
        <p className="text-[14px] leading-[1.55] text-[var(--text-secondary)] mb-5">
          You'll need to use your password to sign in.
        </p>
        <div className="flex gap-3">
          <NeuControl size="lg" variant="secondary" fullWidth onClick={() => setRemovePasskeyOpen(false)}>
            Cancel
          </NeuControl>
          <NeuControl size="lg" variant="danger" fullWidth onClick={handleRemovePasskey}>
            Remove
          </NeuControl>
        </div>
      </GlassModal>
    </div>
  );
};

export default SecuritySettings;
