import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, HelpCircle, Lock, ShieldAlert, MessagesSquare, MapPin, Newspaper, Eye, Bell, Mail, FileText, Users, ChevronRight, ShoppingBag } from "lucide-react";
import { ManageFamilySheet } from "@/components/monetization/ManageFamilySheet";
import { SharePerksModal } from "@/components/monetization/SharePerksModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/layouts/PageHeader";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import { FormField, FormTextArea } from "@/components/ui";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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
  const [slotModalOpen, setSlotModalOpen] = useState(false);

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (!profile) return;
    const p = profile as Record<string, unknown>;
    const nonSocialValue = typeof p.non_social === "boolean" ? p.non_social : false;
    const hideFromMapValue = typeof p.hide_from_map === "boolean" ? p.hide_from_map : false;
    setNonSocial(nonSocialValue);
    setHideFromMap(hideFromMapValue);
  }, [profile]);

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

    setBusy(true);
    const { error } = await supabase.functions.invoke("delete-account", { body: {} });
    setBusy(false);

    if (error) {
      toast.error("We couldn't delete your account. Please retry.");
      return;
    }

    await signOut();
    toast.success("Account deleted.");
    navigate("/auth", { replace: true });
  };

  return (
    <div className="h-full min-h-0 w-full max-w-full flex flex-col">
      <PageHeader title="Account Settings" showBack />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
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
          <InsetRow
            label="Family Account"
            icon={<Users size={16} strokeWidth={1.75} />}
            variant="nav"
            trailingSlot={
              (profile?.family_slots ?? 0) > 0 ? (
                <span className="text-[11px] font-[600] px-2 py-0.5 rounded-full bg-[var(--surface-neu)] text-[var(--text-secondary)]">
                  — / {Math.min(profile?.family_slots ?? 0, 3)}
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setSlotModalOpen(true); }}
                  className="flex items-center gap-1 text-[11px] font-[500] text-[var(--text-secondary)]"
                >
                  <ShoppingBag size={12} strokeWidth={1.75} />
                  Member slot
                </button>
              )
            }
            onClick={() => setFamilySheetOpen(true)}
          />
        </InsetPanel>

        {/* ── VISIBILITY ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">VISIBILITY</p>
        <InsetPanel>
          <InsetRow
            label="Appear in Discovery"
            icon={<Eye size={16} strokeWidth={1.75} />}
            trailingSlot={
              <NeuToggle
                checked={!nonSocial}
                onCheckedChange={(value) => void persistPrivacy({ nonSocial: !value, hideFromMap })}
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
                disabled={loadingPrefs || !prefs.push_enabled}
                checked={prefs.chats}
                onCheckedChange={(value) => void handleCategoryToggle("chats", value)}
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

        {/* ── SECURITY ── */}
        <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] px-1 pt-2">SECURITY</p>
        <InsetPanel>
          <InsetRow
            label="Change password"
            variant="nav"
            icon={<Lock size={16} strokeWidth={1.75} />}
            onClick={() => setPasswordOpen(true)}
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
            <FormField
              label="Subject"
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              placeholder="Subject (optional)"
            />
            <FormTextArea
              label="Message"
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="How can we help?"
              style={{ minHeight: "120px" }}
            />
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <NeuControl variant="secondary" className="flex-1" onClick={() => setSupportOpen(false)}>Cancel</NeuControl>
            <NeuControl className="flex-1" disabled={busy} onClick={submitSupport}>Send</NeuControl>
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
            <FormField
              type="password"
              label="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
            />
            <FormField
              type="password"
              label="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
            />
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <NeuControl variant="secondary" className="flex-1" onClick={() => setPasswordOpen(false)}>Cancel</NeuControl>
            <NeuControl className="flex-1" disabled={busy} onClick={submitPasswordChange}>Update</NeuControl>
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
          <FormField
            label="Confirmation"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
          />
          <DialogFooter className="flex gap-2 pt-2">
            <NeuControl variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)}>Cancel</NeuControl>
            <NeuControl variant="danger" className="flex-1" disabled={busy} onClick={submitDeleteAccount}>Delete</NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Logout confirm dialog ── */}
      <Dialog open={logoutOpen} onOpenChange={(o) => { if (!o) setLogoutOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Log out?
            </DialogTitle>
            <DialogDescription>You&apos;ll need to sign in again.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <NeuControl variant="tertiary" className="flex-1" onClick={() => setLogoutOpen(false)}>Cancel</NeuControl>
            <NeuControl variant="danger" className="flex-1" onClick={async () => { await signOut(); navigate("/auth", { replace: true }); }}>Log out</NeuControl>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageFamilySheet isOpen={familySheetOpen} onClose={() => setFamilySheetOpen(false)} />
      <SharePerksModal
        isOpen={slotModalOpen}
        onClose={() => setSlotModalOpen(false)}
        tier={effectiveTier.toLowerCase()}
      />

      {/* ── Notification toggle-off confirm dialog ── */}
      <Dialog open={confirmToggleOff !== null} onOpenChange={(o) => { if (!o) setConfirmToggleOff(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Turn off notifications?</DialogTitle>
            <DialogDescription>Keep notifications on so our furry friends can count on you when they go missing.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <NeuControl variant="secondary" className="flex-1" onClick={() => setConfirmToggleOff(null)}>
              Keep on
            </NeuControl>
            <NeuControl
              className="flex-1"
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
