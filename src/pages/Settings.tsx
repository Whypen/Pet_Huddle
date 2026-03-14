import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, HelpCircle, Lock, Shield, ShieldAlert, ShieldCheck, MessagesSquare, MapPin, Newspaper, Eye, Bell, Mail, FileText, Users, ChevronRight } from "lucide-react";
import { listTotpFactors } from "@/lib/mfa";
import { listPasskeyFactors } from "@/lib/passkey";
import { ManageFamilySheet } from "@/components/monetization/ManageFamilySheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/layouts/PageHeader";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { GlassModal } from "@/components/ui/GlassModal";
import strayCatImage from "@/assets/Notifications/Stray Cat.jpg";
import strayDogImage from "@/assets/Notifications/Stray dog.jpg";

type NotificationPrefs = {
  push_enabled: boolean;
  social: boolean;
  chats: boolean;
  map: boolean;
  news: boolean;
  email: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  social: true,
  chats: true,
  map: true,
  news: true,
  email: true,
};

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [confirmToggleOff, setConfirmToggleOff] = useState<null | "push" | "map">(null);

  const [nonSocial, setNonSocial] = useState(false);
  const [hideFromMap, setHideFromMap] = useState(false);

  const [familySheetOpen, setFamilySheetOpen] = useState(false);
  const [familyUsedCount, setFamilyUsedCount] = useState(0);

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");

  const [hasMfa, setHasMfa] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [carerGateOpen, setCarerGateOpen] = useState(false);

  const p = (profile ?? {}) as Record<string, unknown>;
  const displayName = String(p.display_name || "Profile");
  const avatarUrl = p.avatar_url ? String(p.avatar_url) : "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "U";
  const effectiveTier = (p.effective_tier as string) || (p.tier as string) || "free";
  const verificationStatus = String(p.verification_status ?? "unverified").toLowerCase();
  const isVerified = p.is_verified === true;
  const dob = (p.dob as string | null) ?? null;
  const isAge18Plus = dob
    ? (() => {
        const birth = new Date(dob);
        const now = new Date();
        const age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        return age > 18 || (age === 18 && (m > 0 || (m === 0 && now.getDate() >= birth.getDate())));
      })()
    : false;
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
  const handleCarerProfileRow = () => {
    if (isVerified) {
      navigate("/carerprofile");
    } else {
      setCarerGateOpen(true);
    }
  };
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
                  social: prefs.social,
                  chats: false,
                  map: prefs.map,
                  push_news: prefs.news,
                  email_enabled: prefs.email,
                  email: prefs.email,
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
  }, [isAge16Plus, nonSocial, prefs.chats, prefs.email, prefs.map, prefs.news, prefs.push_enabled, prefs.social, refreshProfile, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("family_members" as never)
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", user.id)
      .neq("status", "declined")
      .then(({ count }) => setFamilyUsedCount(count ?? 0));
  }, [user?.id, familySheetOpen]); // re-query when sheet closes

  const loadPrefs = async () => {
    if (!user?.id) return;
    setLoadingPrefs(true);

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("push_enabled,pause_all,social,chats,map,push_news,email,email_enabled")
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
        .insert({
          user_id: user.id,
          push_enabled: DEFAULT_PREFS.push_enabled,
          pause_all: false,
          social: DEFAULT_PREFS.social,
          chats: DEFAULT_PREFS.chats,
          map: DEFAULT_PREFS.map,
          push_news: DEFAULT_PREFS.news,
          email_enabled: DEFAULT_PREFS.email,
          email: DEFAULT_PREFS.email,
        } as Record<string, unknown>);
      if (initError) toast.error("We couldn't initialize notification settings.");
      setPrefs(DEFAULT_PREFS);
      setLoadingPrefs(false);
      return;
    }

    const row = data as Record<string, unknown>;
    const next: NotificationPrefs = {
      push_enabled: row.push_enabled === true && row.pause_all !== true,
      social: Boolean(row.social),
      chats: Boolean(row.chats),
      map: Boolean(row.map),
      news: Boolean(row.push_news),
      email: Boolean(row.email_enabled ?? row.email),
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

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      listTotpFactors(supabase).then((factors) =>
        setHasMfa(factors.some((f) => f.status === "verified"))
      ).catch(() => {}),
      listPasskeyFactors(supabase).then((factors) =>
        setHasPasskey(factors.some((f) => f.status === "verified"))
      ).catch(() => {}),
    ]);
  }, [user?.id]);

  const persistPrefs = async (next: NotificationPrefs) => {
    if (!user?.id) return;
    setPrefs(next);
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        push_enabled: next.push_enabled,
        pause_all: false,
        social: next.social,
        chats: next.chats,
        map: next.map,
        push_news: next.news,
        email_enabled: next.email,
        email: next.email,
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

  const handleCategoryToggle = async (key: "social" | "chats" | "map" | "news", next: boolean) => {
    if (key === "map" && prefs.map && !next) {
      setConfirmToggleOff("map");
      return;
    }
    await persistPrefs({ ...prefs, [key]: next });
  };

  const submitSupport = async () => {
    if (!user?.id) return;
    if (!supportMessage.trim()) {
      toast.error("Please enter your message.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("support_requests").insert({
      user_id: user.id,
      category: "general",
      subject: supportSubject.trim() || null,
      message: supportMessage.trim(),
    });
    setBusy(false);

    if (error) {
      toast.error("We couldn't submit support request. Please retry.");
      return;
    }

    toast.success("Support request submitted.");
    setSupportOpen(false);
    setSupportSubject("");
    setSupportMessage("");
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

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

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
        <div
          role="button"
          tabIndex={0}
          className="flex items-center gap-3 px-0 py-4 cursor-pointer"
          onClick={() => navigate("/edit-profile")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/edit-profile"); }}
        >
          <div className="flex h-[56px] w-[56px] items-center justify-center overflow-hidden rounded-full bg-[rgba(33,69,207,0.10)] text-sm font-semibold flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[18px] font-[600] text-[var(--text-primary)]">{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-[600] text-[var(--text-primary)] leading-[1.3] truncate">{displayName}</h3>
            <NeuChip as="span" className="mt-1 capitalize text-[11px]">{effectiveTier}</NeuChip>
          </div>
          <ChevronRight size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)] flex-shrink-0" />
        </div>

        {/* ── Subscription ── */}
        <InsetPanel>
          <InsetRow
            label="Manage Membership"
            variant="nav"
            onClick={() => navigate("/premium")}
          />
          <InsetDivider />
          <button
            type="button"
            onClick={() => setFamilySheetOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-[13px] text-left"
          >
            <span className="w-5 flex-shrink-0 flex items-center justify-center text-[var(--text-secondary)]">
              <Users size={16} strokeWidth={1.75} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-[500] text-[var(--text-primary)]">Family Account</span>
              <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">
                {familyUsedCount} of {Math.min(profile?.family_slots ?? 0, 3)} Slots
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)] flex-shrink-0" />
          </button>
        </InsetPanel>

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
            label="Visible on Map"
            icon={<MapPin size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                checked={!hideFromMap}
                onCheckedChange={(value) => void persistPrivacy({ nonSocial, hideFromMap: !value })}
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
            label="News & updates"
            icon={<Newspaper size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs || !prefs.push_enabled}
                checked={prefs.news}
                onCheckedChange={(value) => void handleCategoryToggle("news", value)}
              />
            }
          />
          <InsetDivider />
          <InsetRow
            label="Email"
            icon={<Mail size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                disabled={loadingPrefs}
                checked={prefs.email}
                onCheckedChange={(value) => void persistPrefs({ ...prefs, email: value })}
              />
            }
          />
        </InsetPanel>

        {/* ── COMMUNITY ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">Being a Community Provider</p>
        <InsetPanel>
          <InsetRow
            label="Identity Verification"
            icon={
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${isVerified ? "bg-brandBlue text-white" : "bg-[#A1A4A9] text-white"}`}>
                <Shield size={12} strokeWidth={1.75} />
              </span>
            }
            variant="nav"
            value={
              isVerified ? "Verified"
              : verificationStatus === "pending" ? "Pending"
              : undefined
            }
            onClick={() => navigate("/verify-identity")}
          />
          {isAge18Plus && (
            <>
              <InsetDivider />
              <button
                type="button"
                onClick={handleCarerProfileRow}
                className="w-full flex items-center gap-3 px-4 py-[13px] text-left"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-[500] text-[var(--text-primary)]">Pet-Care Profile</span>
                  <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">Customize how you offer trusted support</span>
                </span>
                <ChevronRight size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)] flex-shrink-0" />
              </button>
            </>
          )}
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
          <InsetDivider />
          <InsetRow
            label="Extra Security"
            variant="nav"
            icon={<ShieldCheck size={16} strokeWidth={1.75} />}
            value={
              hasMfa && hasPasskey ? "Authenticator & Passkey"
              : hasMfa ? "Authenticator"
              : hasPasskey ? "Passkey"
              : undefined
            }
            onClick={() => navigate("/settings/security")}
          />
        </InsetPanel>

        {/* ── ABOUT ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">ABOUT</p>
        <InsetPanel>
          <InsetRow
            label="Privacy Policy"
            variant="nav"
            icon={<ShieldAlert size={16} strokeWidth={1.75} />}
            onClick={() => navigate("/privacy")}
          />
          <InsetDivider />
          <InsetRow
            label="Terms of Service"
            variant="nav"
            icon={<FileText size={16} strokeWidth={1.75} />}
            onClick={() => navigate("/terms")}
          />
          <InsetDivider />
          <InsetRow
            label="Help & support"
            variant="nav"
            icon={<HelpCircle size={16} strokeWidth={1.75} />}
            onClick={() => setSupportOpen(true)}
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

      {/* ── Help & Support dialog ── */}
      <Dialog open={supportOpen} onOpenChange={(o) => { if (!o) setSupportOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Help &amp; Support</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Subject</label>
              <div className="form-field-rest relative flex items-center">
                <input
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="field-input-core"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Message</label>
              <div className="form-field-rest relative h-auto min-h-[96px] py-3">
                <textarea
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="How can we help?"
                  className="field-input-core resize-none min-h-[72px]"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuControl size="lg" variant="secondary" className="flex-1 min-w-0" onClick={() => setSupportOpen(false)}>Cancel</NeuControl>
            <NeuControl size="lg" className="flex-1 min-w-0" disabled={busy} onClick={submitSupport}>Send</NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Password dialog ── */}
      <Dialog open={passwordOpen} onOpenChange={(o) => { if (!o) setPasswordOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">New Password</label>
            <div className="form-field-rest relative flex items-center">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="field-input-core"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Confirm Password</label>
            <div className="form-field-rest relative flex items-center">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="field-input-core"
              />
            </div>
          </div>
          </div>
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

      <ManageFamilySheet isOpen={familySheetOpen} onClose={() => setFamilySheetOpen(false)} />

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

      {/* ── Carer profile gate ── */}
      <Dialog open={carerGateOpen} onOpenChange={(o) => { if (!o) setCarerGateOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Identity verification required</DialogTitle>
            <DialogDescription>
              Finish verification to start offering trusted pet-care services.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuControl size="lg" variant="secondary" className="flex-1 min-w-0" onClick={() => setCarerGateOpen(false)}>
              Not now
            </NeuControl>
            <NeuControl
              size="lg"
              className="flex-1 min-w-0"
              onClick={() => { setCarerGateOpen(false); navigate("/verify-identity"); }}
            >
              Verify now
            </NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
