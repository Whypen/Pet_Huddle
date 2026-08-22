import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircleAlert, Lock, MapPin, Shield, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthRuntimeEnv } from "@/lib/authRuntimeEnv";
import { buildJoinSignInPath } from "@/lib/authIntent";
import { PageHeader } from "@/layouts/PageHeader";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuControl } from "@/components/ui/NeuControl";
import { FormField } from "@/components/ui";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { GlassModal } from "@/components/ui/GlassModal";
import { getRemainingStarsFromSnapshot } from "@/lib/starQuota";
import { SettingsProfileSummary } from "@/components/layout/SettingsProfileSummary";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { authChangePassword } from "@/lib/publicAuthApi";
import { passwordPolicyError } from "@/lib/passwordStrength";
import { isVerifiedProfile } from "@/lib/verification";

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const showTurnstileDiag = useMemo(
    () => new URLSearchParams(location.search).get("turnstile_diag") === "1",
    [location.search],
  );

  const [nonSocial, setNonSocial] = useState(false);
  const [hideFromMap, setHideFromMap] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starsRemaining, setStarsRemaining] = useState<number>(0);
  const changePasswordTurnstile = useTurnstile("change_password");
  const readChangePasswordTurnstileToken = () => {
    const maybeGetToken = (changePasswordTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String((changePasswordTurnstile as { token?: string | null }).token || "").trim();
  };

  const p = (profile ?? {}) as unknown as Record<string, unknown>;
  const displayName = String(p.display_name || "Profile");
  const isVerified = isVerifiedProfile(p);
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    const loadStars = async () => {
      const snapshot = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_quota_snapshot");
      if (snapshot.error) {
        if (!cancelled) setStarsRemaining(0);
        return;
      }
      const row = Array.isArray(snapshot.data) ? snapshot.data[0] : snapshot.data;
      const typed = (row || {}) as { tier?: string; stars_used_cycle?: number; extra_stars?: number };
      if (!cancelled) setStarsRemaining(getRemainingStarsFromSnapshot(profile?.tier as string | null | undefined, typed));
    };

    void loadStars();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.tier]);
  useEffect(() => {
    if (!profile) return;
    const p = profile as unknown as Record<string, unknown>;
    const nonSocialValue = typeof p.non_social === "boolean" ? p.non_social : false;
    const hideFromMapValue = typeof p.hide_from_map === "boolean" ? p.hide_from_map : false;
    setNonSocial(nonSocialValue);
    setHideFromMap(hideFromMapValue);
  }, [profile]);

  useEffect(() => {
    if (!showTurnstileDiag) return;
    setPasswordOpen(true);
  }, [showTurnstileDiag]);

  const persistPrivacy = async (next: { nonSocial: boolean; hideFromMap: boolean }) => {
    if (!user?.id) return;
    setNonSocial(next.nonSocial);
    setHideFromMap(next.hideFromMap);

    const { error } = await supabase
      .from("profiles")
      .update({
        non_social: next.nonSocial,
        hide_from_map: next.hideFromMap,
      } as unknown as Record<string, unknown>)
      .eq("id", user.id);

    if (error) {
      toast.error("We couldn’t save privacy settings. Please retry.");
      return;
    }

    await refreshProfile();
    toast.success("Privacy settings updated.");
  };

  const submitPasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please complete both password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }

    const turnstileToken = readChangePasswordTurnstileToken();
    if (!turnstileToken) {
      toast.error("Complete human verification first.");
      return;
    }

    setBusy(true);
    const { error } = await authChangePassword({
      password: newPassword,
      turnstile_token: turnstileToken,
      turnstile_action: "change_password",
    });
    setBusy(false);
    changePasswordTurnstile.reset();

    if (error) {
      toast.error(error.message || "We couldn't update your password. Please retry.");
      return;
    }

    toast.success("Password updated.");
    setPasswordOpen(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  const submitDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Your session expired. Please log in again.");
      await signOut();
      navigate(buildJoinSignInPath("/social"), { replace: true });
      return;
    }

    setBusy(true);
    const runtimeEnv = getAuthRuntimeEnv();
    if (import.meta.env.DEV) {
      console.info("[settings.delete_account] invoking", {
        userId: session.user.id,
        envMode: runtimeEnv.mode,
        envHost: runtimeEnv.host,
        supabaseUrl: runtimeEnv.supabaseUrl,
      });
    }
    const { error } = await supabase.functions.invoke("delete-account", {
      body: {},
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    setBusy(false);

    if (error) {
      // Extract the actual error body for debugging
      const ctx = (error as { context?: Response }).context;
      if (ctx?.json) {
        ctx.json().then((body: unknown) => {
          console.error("[settings.delete_account.error_body]", body);
        }).catch(() => {});
      }
      console.error("[settings.delete_account.failed]", error);
      toast.error("We couldn't delete your account. Please retry.");
      return;
    }
    if (import.meta.env.DEV) {
      console.info("[settings.delete_account] success", {
        userId: session.user.id,
        envMode: runtimeEnv.mode,
        envHost: runtimeEnv.host,
      });
    }

    await signOut();
    toast.success("Account deleted.");
    navigate(buildJoinSignInPath("/social"), { replace: true });
  };

  return (
    <div className="h-full min-h-0 w-full max-w-full flex flex-col">
      <PageHeader
        title={<h1 className="text-base font-semibold text-[#424965] truncate">Account Settings</h1>}
        titleClassName="justify-start"
        showBack
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="pt-[68px] px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)] space-y-4 max-w-md mx-auto">

        {/* ── UserHeader ── */}
        <SettingsProfileSummary
          displayName={displayName}
          avatarUrl={p.avatar_url ? String(p.avatar_url) : null}
          isVerified={isVerifiedProfile(p)}
          tierValue={String((p.effective_tier as string) || (p.tier as string) || "free")}
          starsLabel={String(starsRemaining)}
          onStarsClick={() => navigate("/member")}
          onPress={() => navigate("/edit-profile")}
          showChevron
        />

        {/* ── VISIBILITY ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">VISIBILITY</p>
        <InsetPanel>
          <InsetRow
            label="Appear in Discovery"
            icon={<Eye size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                checked={!nonSocial}
                onCheckedChange={(value) => {
                  void persistPrivacy({ nonSocial: !value, hideFromMap });
                }}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Incognito on Map"
            icon={<MapPin size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                checked={hideFromMap}
                onCheckedChange={(value) => void persistPrivacy({ nonSocial, hideFromMap: value })}
              />
            }
          />
        </InsetPanel>

        {/* ── SECURITY ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">SECURITY</p>
        <InsetPanel>
          <InsetRow
            label="Security"
            variant="nav"
            icon={<Shield size={16} strokeWidth={1.75} />}
            onClick={() => navigate("/settings/security")}
          />
          <InsetDivider />
          <InsetRow
            label="Change password"
            variant="nav"
            icon={<Lock size={16} strokeWidth={1.75} />}
            onClick={() => setPasswordOpen(true)}
          />
        </InsetPanel>

        {/* ── Log out ── */}
        <InsetPanel className="mt-4">
          <InsetRow
            label="Log out"
            variant="danger"
            onClick={() => setLogoutOpen(true)}
          />
        </InsetPanel>

        {/* ── Delete account ── */}
        <button
          type="button"
          className="w-full text-[11px] font-[400] text-[var(--text-danger,#e53e3e)] text-center mt-3 mb-[calc(env(safe-area-inset-bottom,0px)+20px)] bg-transparent border-0 cursor-pointer"
          onClick={() => setDeleteOpen(true)}
        >
          Delete account
        </button>
      </div>
      </div>

      {/* ── Change Password dialog ── */}
      <Dialog open={passwordOpen} onOpenChange={(o) => {
        if (!o) {
          setPasswordOpen(false);
          changePasswordTurnstile.reset();
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <FormField
              type="password"
              label="New Password"
              leadingIcon={<Lock size={16} strokeWidth={1.75} />}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <FormField
              type="password"
              label="Confirm Password"
              leadingIcon={<Lock size={16} strokeWidth={1.75} />}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <TurnstileWidget
            siteKeyMissing={changePasswordTurnstile.siteKeyMissing}
            setContainer={changePasswordTurnstile.setContainer}
            className="min-h-[65px]"
          />
          <TurnstileDebugPanel visible={showTurnstileDiag} diag={changePasswordTurnstile.diag} />
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuControl size="lg" variant="secondary" className="flex-1 min-w-0" onClick={() => setPasswordOpen(false)}>Cancel</NeuControl>
            <NeuControl size="lg" className="flex-1 min-w-0" disabled={busy || !changePasswordTurnstile.isTokenUsable} onClick={submitPasswordChange}>Update</NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!o) setDeleteOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <CircleAlert className="h-4 w-4" />
              Delete Account
            </DialogTitle>
            <DialogDescription>Type DELETE to confirm permanent deletion.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Confirmation</label>
            <div className="form-field-rest relative flex items-center">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="field-input-core"
              />
            </div>
          </div>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuControl size="lg" variant="secondary" className="flex-1 min-w-0" onClick={() => setDeleteOpen(false)}>Cancel</NeuControl>
            <NeuControl size="lg" variant="danger" className="flex-1 min-w-0" disabled={busy} onClick={submitDeleteAccount}>Delete</NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Logout confirm modal ── */}
      <GlassModal isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out?" hideClose>
        <p className="text-[14px] leading-[1.55] text-[var(--text-secondary)] text-center mb-5">
          You&apos;ll need to sign in again.
        </p>
        <div className="flex gap-3">
          <NeuControl size="lg" variant="secondary" fullWidth onClick={() => setLogoutOpen(false)}>Cancel</NeuControl>
          <NeuControl
            size="lg"
            variant="danger"
            fullWidth
            onClick={async () => {
              await signOut();
              navigate(buildJoinSignInPath("/social"), { replace: true });
            }}
          >
            Log out
          </NeuControl>
        </div>
      </GlassModal>

    </div>
  );
};

export default Settings;
