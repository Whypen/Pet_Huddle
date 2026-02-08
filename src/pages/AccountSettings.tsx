import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Prefs = {
  push_notifications_enabled?: boolean;
  email_notifications_enabled?: boolean;
};

export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const r = await supabase.from("profiles").select("prefs").eq("id", user.id).maybeSingle();
      if (!r.error) {
        const p = (r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>).prefs : null) as Prefs | null;
        setPrefs(p ?? {});
      }
    })();
  }, [user?.id]);

  const pushEnabled = !!prefs.push_notifications_enabled;
  const emailEnabled = !!prefs.email_notifications_enabled;

  const savePrefs = async (next: Prefs) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const r = await supabase.from("profiles").update({ prefs: next }).eq("id", user.id);
      if (r.error) throw r.error;
      setPrefs(next);
    } finally {
      setSaving(false);
    }
  };

  const Row = ({
    label,
    right,
  }: {
    label: string;
    right: React.ReactNode;
  }) => (
    <div className="w-full min-h-[44px] rounded-[12px] border border-brandText/15 px-4 py-2 flex items-center justify-between bg-white">
      <div className="text-sm font-semibold text-brandText">{label}</div>
      {right}
    </div>
  );

  const deleteAccount = async () => {
    if (!user?.id) return;
    const ok = window.confirm("Are you sure? This is permanent.");
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
        <div className="text-xs font-bold text-brandText/70">Notifications</div>
        <Row
          label="Push Notifications"
          right={
            <Switch
              checked={pushEnabled}
              disabled={disabled}
              onCheckedChange={(v) => savePrefs({ ...prefs, push_notifications_enabled: v })}
            />
          }
        />
        <Row
          label="Email Notifications"
          right={
            <Switch
              checked={emailEnabled}
              disabled={disabled}
              onCheckedChange={(v) => savePrefs({ ...prefs, email_notifications_enabled: v })}
            />
          }
        />

        <div className="pt-2">
          <div className="text-xs font-bold text-brandError/90">Danger Zone</div>
          <button
            onClick={deleteAccount}
            disabled={disabled}
            className={cn(
              "mt-2 w-full min-h-[44px] rounded-[12px] border border-brandError/30 bg-white px-4 flex items-center justify-between",
              disabled && "opacity-50"
            )}
          >
            <span className="text-sm font-extrabold text-brandError">Delete Account</span>
            <Trash2 className="w-5 h-5 text-brandError/80" />
          </button>
        </div>
      </div>
    </div>
  );
}

