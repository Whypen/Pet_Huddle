import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Prefs = {
  push_notifications_enabled?: boolean;
  email_notifications_enabled?: boolean;
  non_social?: boolean;
  hide_from_map?: boolean;
  pause_all_notifications?: boolean;
  social_notifications?: boolean;
  safety_notifications?: boolean;
  dr_huddle_notifications?: boolean;
  biometric_login?: boolean;
  two_factor_auth?: boolean;
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "zh-CN", label: "简体中文" },
] as const;

export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [language, setLanguage] = useState("en");
  const [familyMember, setFamilyMember] = useState<string | null>(null);

  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isGold = effectiveTier === "gold";

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const r = await (supabase as any)
        .from("profiles")
        .select("prefs, non_social, hide_from_map, language")
        .eq("id", user.id)
        .maybeSingle();
      if (!r.error && r.data) {
        const raw = r.data as Record<string, unknown>;
        const p = (typeof raw.prefs === "object" && raw.prefs !== null ? raw.prefs : {}) as Prefs;
        setPrefs({
          ...p,
          non_social: raw.non_social === true,
          hide_from_map: raw.hide_from_map === true,
        });
        if (typeof raw.language === "string") setLanguage(raw.language);
      }

      // Fetch family member (Gold only)
      const fm = await (supabase as any)
        .from("family_members")
        .select("family_member_id, profiles!family_members_family_member_id_fkey(display_name)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!fm.error && fm.data) {
        const member = fm.data as Record<string, unknown>;
        const memberProfile = member.profiles as Record<string, unknown> | null;
        setFamilyMember(typeof memberProfile?.display_name === "string" ? memberProfile.display_name : "Family Member");
      }
    })();
  }, [user?.id]);

  const savePrefs = async (next: Prefs) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // Separate profile columns from JSON prefs
      const { non_social, hide_from_map, ...jsonPrefs } = next;
      const updatePayload: Record<string, unknown> = { prefs: jsonPrefs };
      if (typeof non_social === "boolean") updatePayload.non_social = non_social;
      if (typeof hide_from_map === "boolean") updatePayload.hide_from_map = hide_from_map;
      const r = await supabase.from("profiles").update(updatePayload).eq("id", user.id);
      if (r.error) throw r.error;
      setPrefs(next);
    } finally {
      setSaving(false);
    }
  };

  const saveLanguage = async (lang: string) => {
    if (!user?.id) return;
    setLanguage(lang);
    await supabase.from("profiles").update({ language: lang } as Record<string, unknown>).eq("id", user.id);
  };

  const deleteAccount = async () => {
    if (!user?.id) return;
    const ok = window.confirm("Are you sure? This is permanent and cannot be undone.");
    if (!ok) return;
    setDeleting(true);
    try {
      const del = await supabase.from("profiles").delete().eq("id", user.id);
      if (del.error) throw del.error;
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const disabled = saving || deleting;

  const ToggleRow = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="w-full min-h-[44px] rounded-[12px] border border-brandText/15 px-4 py-2 flex items-center justify-between bg-white">
      <div className="text-sm font-semibold text-brandText">{label}</div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );

  const NavRow = ({ label, onClick, sub }: { label: string; onClick: () => void; sub?: string }) => (
    <button
      onClick={onClick}
      className="w-full min-h-[44px] rounded-[12px] border border-brandText/15 px-4 py-2 flex items-center justify-between bg-white"
    >
      <div>
        <div className="text-sm font-semibold text-brandText text-left">{label}</div>
        {sub ? <div className="text-xs text-brandText/50 text-left">{sub}</div> : null}
      </div>
      <ChevronRight className="w-5 h-5 text-brandText/50" />
    </button>
  );

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />

      <div className="px-4 pt-3 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl border border-brandText/15 bg-white flex items-center justify-center"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5 text-brandText/70" />
        </button>
        <div className="text-base font-extrabold text-brandText">Account Setting</div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Family Section */}
        <div className="text-xs font-bold text-brandText/70">Family</div>
        <div className="w-full rounded-[12px] border border-brandText/15 px-4 py-3 bg-white space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brandText/70" />
            <span className="text-sm font-semibold text-brandText">Family Sharing</span>
          </div>
          {familyMember ? (
            <div className="text-sm text-brandText/70">{familyMember}</div>
          ) : (
            <div className="text-xs text-brandText/50">No members linked</div>
          )}
          {isGold ? (
            <button
              onClick={() => navigate("/family-invite")}
              className="mt-1 px-4 py-2 rounded-lg bg-brandGold text-white text-sm font-bold"
            >
              Invite
            </button>
          ) : (
            <div className="mt-1 space-y-1">
              <div className="text-xs text-brandText/50">Upgrade to Gold for Family Sharing</div>
              <button
                onClick={() => navigate("/premium?tab=Gold")}
                className="px-4 py-2 rounded-lg bg-brandGold text-white text-sm font-bold"
              >
                Upgrade to Gold
              </button>
            </div>
          )}
        </div>

        {/* Security */}
        <div className="text-xs font-bold text-brandText/70 pt-2">Security</div>
        <NavRow label="Password" onClick={() => navigate("/change-password")} />
        <NavRow label="Identity Verification" sub="Upload ID/Passport" onClick={() => navigate("/verify-identity")} />
        <ToggleRow label="Biometric Login" checked={!!prefs.biometric_login} onChange={(v) => savePrefs({ ...prefs, biometric_login: v })} />
        <ToggleRow label="Two-Factor Auth" checked={!!prefs.two_factor_auth} onChange={(v) => savePrefs({ ...prefs, two_factor_auth: v })} />

        {/* Privacy */}
        <div className="text-xs font-bold text-brandText/70 pt-2">Privacy</div>
        <ToggleRow
          label="Non-Social (Hide from discovery)"
          checked={!!prefs.non_social}
          onChange={(v) => savePrefs({ ...prefs, non_social: v })}
        />
        <ToggleRow
          label="Hide from Map"
          checked={!!prefs.hide_from_map}
          onChange={(v) => savePrefs({ ...prefs, hide_from_map: v })}
        />

        {/* Notifications */}
        <div className="text-xs font-bold text-brandText/70 pt-2">Notifications</div>
        <ToggleRow
          label="Push Notifications"
          checked={prefs.push_notifications_enabled !== false}
          onChange={(v) => savePrefs({ ...prefs, push_notifications_enabled: v })}
        />
        <ToggleRow
          label="Pause All Notifications"
          checked={!!prefs.pause_all_notifications}
          onChange={(v) => savePrefs({ ...prefs, pause_all_notifications: v })}
        />
        <ToggleRow
          label="Social (Waves/Matches)"
          checked={prefs.social_notifications !== false}
          onChange={(v) => savePrefs({ ...prefs, social_notifications: v })}
        />
        <ToggleRow
          label="Safety (Alerts)"
          checked={prefs.safety_notifications !== false}
          onChange={(v) => savePrefs({ ...prefs, safety_notifications: v })}
        />
        <ToggleRow
          label="Dr. Huddle"
          checked={prefs.dr_huddle_notifications !== false}
          onChange={(v) => savePrefs({ ...prefs, dr_huddle_notifications: v })}
        />
        <ToggleRow
          label="Email Notifications"
          checked={!!prefs.email_notifications_enabled}
          onChange={(v) => savePrefs({ ...prefs, email_notifications_enabled: v })}
        />

        {/* Language */}
        <div className="text-xs font-bold text-brandText/70 pt-2">Language</div>
        <div className="flex gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => saveLanguage(lang.code)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                language === lang.code
                  ? "bg-brandBlue text-white border-brandBlue"
                  : "bg-white text-brandText border-brandText/15 hover:border-brandBlue/50"
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Subscription */}
        <div className="pt-2">
          <NavRow label="Manage Subscription" onClick={() => navigate("/premium")} />
        </div>

        {/* Danger Zone */}
        <div className="pt-2 space-y-2">
          <button
            onClick={deleteAccount}
            disabled={disabled}
            className={cn(
              "w-full min-h-[44px] rounded-[12px] border border-brandError/30 bg-white px-4 flex items-center justify-between",
              disabled && "opacity-50"
            )}
          >
            <span className="text-sm font-extrabold text-brandError">Delete Account</span>
            <Trash2 className="w-5 h-5 text-brandError/80" />
          </button>

          <button
            onClick={async () => {
              await signOut();
              navigate("/auth");
            }}
            className="w-full min-h-[44px] rounded-[12px] border border-brandError/30 bg-white px-4 flex items-center justify-between"
          >
            <span className="flex items-center gap-3 text-sm font-bold text-brandError">
              <LogOut className="w-5 h-5" />
              Logout
            </span>
            <ChevronRight className="w-5 h-5 text-brandError/70" />
          </button>
        </div>
      </div>
    </div>
  );
}
