import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, Lock, MessagesSquare, MapPin, Briefcase, Bell, Shield, Users, PawPrint } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthRuntimeEnv } from "@/lib/authRuntimeEnv";
import { PageHeader } from "@/layouts/PageHeader";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuControl } from "@/components/ui/NeuControl";
import { FormField } from "@/components/ui";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { GlassModal } from "@/components/ui/GlassModal";
import strayCatImage from "@/assets/Notifications/Stray Cat.jpg";
import strayDogImage from "@/assets/Notifications/Stray dog.jpg";
import { getRemainingStarsFromSnapshot } from "@/lib/starQuota";
import { SettingsProfileSummary } from "@/components/layout/SettingsProfileSummary";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { authChangePassword } from "@/lib/publicAuthApi";

type NotificationPrefs = {
  push_enabled: boolean;
  pets: boolean;
  social: boolean;
  chats: boolean;
  map: boolean;
  services: boolean;
  systems: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  pets: true,
  social: true,
  chats: true,
  map: true,
  services: true,
  systems: true,
};

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [confirmToggleOff, setConfirmToggleOff] = useState<null | "push" | "map">(null);

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

  const p = (profile ?? {}) as Record<string, unknown>;
  const displayName = String(p.display_name || "Profile");
  const isVerified = p.is_verified === true;
  const dob = (p.dob as string | null) ?? null;
  const isAge16Plus = dob
    ? (() => {
        const birth = new Date(dob);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
        return age >= 16;
      })()
    : true;

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    const loadStars = async () => {
      const snapshot = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_quota_snapshot");
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
  const speciesSource = [p.pet_species, p.pet_experience, p.species, p.pets]
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value.flatMap((item) => {
          if (item && typeof item === "object" && "species" in (item as Record<string, unknown>)) {
            return [String((item as Record<string, unknown>).species || "").toLowerCase()];
          }
          return [String(item || "").toLowerCase()];
        });
      }
      if (value && typeof value === "object" && "species" in (value as Record<string, unknown>)) {
        return [String((value as Record<string, unknown>).species || "").toLowerCase()];
      }
      if (typeof value === "string") return [value.toLowerCase()];
      return [];
    })
    .join(" ");
  const hasCatSpecies = /\bcat(s)?\b/.test(speciesSource) || /\bfeline(s)?\b/.test(speciesSource);
  const hasDogSpecies = /\bdog(s)?\b/.test(speciesSource) || /\bcanine(s)?\b/.test(speciesSource);
  const turnOffMapImage = hasDogSpecies && !hasCatSpecies ? strayDogImage : strayCatImage;

  useEffect(() => {
    if (!profile) return;
    const p = profile as Record<string, unknown>;
    const nonSocialValue = typeof p.non_social === "boolean" ? p.non_social : false;
    const hideFromMapValue = typeof p.hide_from_map === "boolean" ? p.hide_from_map : false;
    setNonSocial(nonSocialValue);
    setHideFromMap(hideFromMapValue);
  }, [profile]);

  useEffect(() => {
    if (!user?.id) return;
    if (isAge16Plus) return;

    const enforceMinorSafety = async () => {
      if (!nonSocial || prefs.chats) {
        await Promise.all([
          !nonSocial
            ? supabase
                .from("profiles")
                .update({ non_social: true } as Record<string, unknown>)
                .eq("id", user.id)
            : Promise.resolve({ error: null }),
          prefs.chats
            ? supabase.from("notification_preferences").upsert(
                {
                  user_id: user.id,
                  push_enabled: prefs.push_enabled,
                  pause_all: false,
                  pets: prefs.pets,
                  social: prefs.social,
                  chats: false,
                  map: prefs.map,
                  vet: prefs.services,
                  email_enabled: prefs.systems,
                  email: prefs.systems,
                } as Record<string, unknown>,
                { onConflict: "user_id" },
              )
            : Promise.resolve({ error: null }),
        ]);
        setNonSocial(true);
        setPrefs((prev) => ({ ...prev, chats: false }));
        await refreshProfile();
      }
    };

    void enforceMinorSafety();
  }, [isAge16Plus, nonSocial, prefs.chats, prefs.systems, prefs.map, prefs.services, prefs.push_enabled, prefs.social, prefs.pets, refreshProfile, user?.id]);

  const loadPrefs = async () => {
    if (!user?.id) return;
    setLoadingPrefs(true);

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("push_enabled,pause_all,social,chats,map,pets,vet,email,email_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      toast.error("We couldn't load notification settings.");
      setLoadingPrefs(false);
      return;
    }

    if (!data) {
      const { error: initError } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: user.id,
          push_enabled: DEFAULT_PREFS.push_enabled,
          pause_all: false,
          pets: DEFAULT_PREFS.pets,
          social: DEFAULT_PREFS.social,
          chats: DEFAULT_PREFS.chats,
          map: DEFAULT_PREFS.map,
          vet: DEFAULT_PREFS.services,
          email_enabled: DEFAULT_PREFS.systems,
          email: DEFAULT_PREFS.systems,
        } as Record<string, unknown>, { onConflict: "user_id" });
      if (initError) toast.error("We couldn't initialize notification settings.");
      setPrefs(DEFAULT_PREFS);
      setLoadingPrefs(false);
      return;
    }

    const row = data as Record<string, unknown>;
    const next: NotificationPrefs = {
      push_enabled: row.push_enabled === true && row.pause_all !== true,
      pets: Boolean(row.pets ?? true),
      social: Boolean(row.social),
      chats: Boolean(row.chats),
      map: Boolean(row.map),
      services: Boolean(row.vet ?? true),
      systems: Boolean(row.email_enabled ?? row.email ?? true),
    };

    setPrefs(next);
    if (row.pause_all === true) {
      await supabase
        .from("notification_preferences")
        .update({ pause_all: false } as Record<string, unknown>)
        .eq("user_id", user.id);
    }
    setLoadingPrefs(false);
  };

  useEffect(() => {
    void loadPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const persistPrefs = async (next: NotificationPrefs) => {
    if (!user?.id) return;
    setPrefs(next);
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        push_enabled: next.push_enabled,
        pause_all: false,
        pets: next.pets,
        social: next.social,
        chats: next.chats,
        map: next.map,
        vet: next.services,
        email_enabled: next.systems,
        email: next.systems,
      } as Record<string, unknown>,
      { onConflict: "user_id" }
    );

    if (error) {
      toast.error("We couldn't save notification settings. Please retry.");
      await loadPrefs();
      return;
    }

    toast.success("Notification settings updated.");
  };

  const persistPrivacy = async (next: { nonSocial: boolean; hideFromMap: boolean }) => {
    if (!user?.id) return;
    setNonSocial(next.nonSocial);
    setHideFromMap(next.hideFromMap);

    const { error } = await supabase
      .from("profiles")
      .update({
        non_social: next.nonSocial,
        hide_from_map: next.hideFromMap,
      } as Record<string, unknown>)
      .eq("id", user.id);

    if (error) {
      toast.error("We couldn’t save privacy settings. Please retry.");
      return;
    }

    await refreshProfile();
    toast.success("Privacy settings updated.");
  };

  const handlePushToggle = async (next: boolean) => {
    if (prefs.push_enabled && !next) {
      setConfirmToggleOff("push");
      return;
    }
    await persistPrefs({ ...prefs, push_enabled: next });
  };

  const handleCategoryToggle = async (key: "pets" | "social" | "chats" | "map" | "services" | "systems", next: boolean) => {
    if (key === "map" && prefs.map && !next) {
      setConfirmToggleOff("map");
      return;
    }
    await persistPrefs({ ...prefs, [key]: next });
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

    if (!changePasswordTurnstile.token) {
      toast.error("Complete human verification first.");
      return;
    }

    setBusy(true);
    const { error } = await authChangePassword({
      password: newPassword,
      turnstile_token: changePasswordTurnstile.token,
      turnstile_action: "change_password",
    });
    setBusy(false);
    changePasswordTurnstile.reset();

    if (error) {
      toast.error("We couldn't update your password. Please retry.");
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
      navigate("/auth", { replace: true });
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
    navigate("/auth", { replace: true });
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
          isVerified={p.is_verified === true}
          tierValue={String((p.effective_tier as string) || (p.tier as string) || "free")}
          starsLabel={String(starsRemaining)}
          onStarsClick={() => navigate("/premium")}
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
                disabled={!isAge16Plus}
                checked={isAge16Plus ? !nonSocial : false}
                onCheckedChange={(value) => {
                  if (!isAge16Plus) return;
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

        {/* ── NOTIFICATIONS ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">NOTIFICATIONS</p>
        <InsetPanel>
          <InsetRow
            label="Push notifications"
            icon={<Bell size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs}
                checked={prefs.push_enabled}
                onCheckedChange={(value) => void handlePushToggle(value)}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Pets"
            icon={<PawPrint size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs || !prefs.push_enabled}
                checked={prefs.pets}
                onCheckedChange={(value) => void handleCategoryToggle("pets", value)}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Social"
            icon={<Users size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs || !prefs.push_enabled}
                checked={prefs.social}
                onCheckedChange={(value) => void handleCategoryToggle("social", value)}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Chats"
            icon={<MessagesSquare size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs || !prefs.push_enabled || !isAge16Plus}
                checked={isAge16Plus ? prefs.chats : false}
                onCheckedChange={(value) => {
                  if (!isAge16Plus) return;
                  void handleCategoryToggle("chats", value);
                }}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Map alerts"
            icon={<MapPin size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs || !prefs.push_enabled}
                checked={prefs.map}
                onCheckedChange={(value) => void handleCategoryToggle("map", value)}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Services"
            icon={<Briefcase size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs || !prefs.push_enabled}
                checked={prefs.services}
                onCheckedChange={(value) => void handleCategoryToggle("services", value)}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Systems"
            icon={<Shield size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs}
                checked={prefs.systems}
                onCheckedChange={(value) => void persistPrefs({ ...prefs, systems: value })}
              />
            }
          />
        </InsetPanel>

        {/* ── SECURITY ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">SECURITY</p>
        <InsetPanel>
          <InsetRow
            label="Change password"
            variant="nav"
            icon={<Lock size={16} strokeWidth={1.75} />}
            onClick={() => setPasswordOpen(true)}
          />
          {/* Extra Security is temporarily hidden in production. */}
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
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuControl size="lg" variant="secondary" className="flex-1 min-w-0" onClick={() => setPasswordOpen(false)}>Cancel</NeuControl>
            <NeuControl size="lg" className="flex-1 min-w-0" disabled={busy} onClick={submitPasswordChange}>Update</NeuControl>
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
              navigate("/auth", { replace: true });
            }}
          >
            Log out
          </NeuControl>
        </div>
      </GlassModal>

      {/* ── Notification toggle-off confirm dialog ── */}
      <Dialog open={confirmToggleOff !== null} onOpenChange={(o) => { if (!o) setConfirmToggleOff(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="space-y-2.5">
            <DialogTitle>Turn off notifications?</DialogTitle>
            <DialogDescription>Keep notifications on so our furry friends can count on you when they go missing.</DialogDescription>
          </DialogHeader>
          {confirmToggleOff !== null ? (
            <div className="px-1 pb-1">
              <img
                src={turnOffMapImage}
                alt="Missing pet alert illustration"
                className="mx-auto w-full max-w-[320px] rounded-2xl object-cover"
              />
            </div>
          ) : null}
          <DialogFooter className="!flex-row gap-2 pt-1">
            <NeuControl size="lg" variant="secondary" className="flex-1 min-w-0" onClick={() => setConfirmToggleOff(null)}>
              Keep on
            </NeuControl>
            <NeuControl
              size="lg"
              className="flex-1 min-w-0"
              onClick={() => {
                const mode = confirmToggleOff;
                setConfirmToggleOff(null);
                if (mode === "push") {
                  void persistPrefs({ ...prefs, push_enabled: false });
                  return;
                }
                if (mode === "map") {
                  void persistPrefs({ ...prefs, map: false });
                }
              }}
            >
              Turn off
            </NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Settings;
