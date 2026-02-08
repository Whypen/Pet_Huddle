import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Crown, FileText, HelpCircle, LogOut, Shield, User, X, PawPrint, BadgeCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Card = "premium" | "gold";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { profile, signOut, user } = useAuth();

  const [legalOpen, setLegalOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [sending, setSending] = useState(false);

  const isVerified = !!profile?.is_verified || String(profile?.verification_status ?? "").toLowerCase() === "approved";
  const isPending = !isVerified && String(profile?.verification_status ?? "").toLowerCase() === "pending";

  const cardTap = (c: Card) => {
    setActiveCard(c);
    try {
      navigator.vibrate?.(10);
    } catch {
      // ignore
    }
    navigate(c === "gold" ? "/premium?tab=Gold" : "/premium?tab=Premium");
  };

  const initials = useMemo(() => {
    const name = profile?.display_name || "User";
    return name.trim().slice(0, 1).toUpperCase();
  }, [profile?.display_name]);

  const sendSupport = async () => {
    if (!user?.id) return;
    if (!supportMessage.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_requests").insert({
        user_id: user.id,
        subject: supportSubject.trim() || null,
        message: supportMessage.trim(),
        email: user.email ?? null,
      });
      if (error) throw error;
      setSupportSubject("");
      setSupportMessage("");
      setSupportOpen(false);
    } catch (e) {
      console.warn("[Settings] support request failed", e);
    } finally {
      setSending(false);
    }
  };

  const Row = ({ icon: Icon, label, onClick, gold }: { icon: React.ElementType; label: string; onClick: () => void; gold?: boolean }) => (
    <button
      onClick={onClick}
      className={cn(
        "w-full h-10 min-h-[44px] rounded-[12px] border px-4 flex items-center justify-between bg-white",
        gold ? "border-brandGold/50" : "border-brandText/15",
      )}
    >
      <span className="flex items-center gap-3 text-sm font-semibold text-brandText">
        <Icon className={cn("w-5 h-5", gold ? "text-brandGold" : "text-brandText/70")} />
        {label}
      </span>
      <ChevronRight className="w-5 h-5 text-brandText/50" />
    </button>
  );

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />

      <div className="px-4 py-4 space-y-3">
        {/* Next to Avatar: user name + verification badge */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center font-bold text-brandText bg-muted border-2",
              isVerified ? "border-brandGold" : "border-gray-300"
            )}
            aria-label="Avatar"
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-base font-bold text-brandText truncate">{profile?.display_name || "User"}</div>
              <span
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full border-2",
                  isVerified ? "border-brandGold" : "border-gray-300"
                )}
                aria-label={isVerified ? "Verified" : isPending ? "Pending" : "Not verified"}
              >
                <BadgeCheck className={cn("w-3.5 h-3.5", isVerified ? "text-brandGold" : "text-brandText/50")} />
              </span>
            </div>
          </div>
        </div>

        {/* Unlock Premium/Gold blocks between Avatar and Edit User Profile; squeeze within width; shorter height */}
        <div className="flex gap-3 w-full">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => cardTap("premium")}
            className={cn(
              "flex-1 min-w-0 h-[110px] rounded-[16px] border bg-white p-3 shadow-sm text-left",
              activeCard === "premium" ? "border-brandBlue border-2" : "border-brandBlue/40"
            )}
          >
            <div className="text-sm font-extrabold text-brandText">Unlock Premium</div>
            <div className="text-xs text-brandText/70 mt-1 line-clamp-1">Best for Pet Lovers</div>
            <div className="mt-2 w-full rounded-lg bg-brandBlue text-white font-bold py-2 flex items-center justify-center gap-2">
              Explore <ChevronRight className="w-4 h-4" />
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => cardTap("gold")}
            className={cn(
              "relative flex-1 min-w-0 h-[110px] rounded-[16px] border bg-white p-3 shadow-sm text-left",
              activeCard === "gold" ? "border-brandGold border-2" : "border-brandGold/40"
            )}
          >
            <span className="absolute -top-3 left-3 text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-semibold">
              Recommended
            </span>
            <div className="text-sm font-extrabold text-brandText">Unlock Gold</div>
            <div className="text-xs text-brandText/70 mt-1 line-clamp-1">Ultimate Experience</div>
            <div className="mt-2 w-full rounded-lg bg-brandGold text-white font-bold py-2 flex items-center justify-center gap-2">
              Explore <ChevronRight className="w-4 h-4" />
            </div>
          </motion.button>
        </div>

        {/* Remove section sub-headers; keep tight spacing */}
        <div className="space-y-2">
          <Row icon={User} label="Edit User Profile" onClick={() => navigate("/edit-profile")} />
          <Row icon={PawPrint} label="Edit Pet Profile" onClick={() => navigate("/edit-pet-profile")} />
          <Row icon={Shield} label="Account Setting" onClick={() => navigate("/account-settings")} />
          <Row icon={Shield} label="Identity Verification" onClick={() => navigate("/verify-identity")} gold />
          <Row icon={Crown} label="Manage Subscription" onClick={() => navigate("/premium")} gold />
        </div>

        <div className="pt-1">
          <button
            onClick={() => setLegalOpen((v) => !v)}
            className="w-full h-10 min-h-[44px] rounded-[12px] border border-brandText/15 px-4 flex items-center justify-between bg-white"
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-brandText">
              <FileText className="w-5 h-5 text-brandText/70" />
              Legal Information
            </span>
            <ChevronRight className={cn("w-5 h-5 text-brandText/50 transition-transform", legalOpen && "rotate-90")} />
          </button>
          {legalOpen ? (
            <div className="mt-2 space-y-2">
              <Row icon={FileText} label="Terms of Service" onClick={() => navigate("/terms")} />
              <Row icon={FileText} label="Privacy Policy" onClick={() => navigate("/privacy")} />
            </div>
          ) : null}
        </div>

        <div className="pt-1">
          <Row icon={HelpCircle} label="Help & Support" onClick={() => setSupportOpen(true)} />
        </div>

        {/* UAT: Logout destructive */}
        <div className="pt-2">
          <button
            onClick={async () => {
              await signOut();
              navigate("/auth");
            }}
            className="w-full h-10 min-h-[44px] rounded-[12px] border border-brandError/30 px-4 flex items-center justify-between bg-white"
          >
            <span className="flex items-center gap-3 text-sm font-bold text-brandError">
              <LogOut className="w-5 h-5" />
              Logout
            </span>
            <ChevronRight className="w-5 h-5 text-brandError/70" />
          </button>
        </div>
      </div>

      {/* Help & Support Modal */}
      <AnimatePresence>
        {supportOpen ? (
          <>
            <motion.div
              className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSupportOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-sm bg-white rounded-2xl border border-brandText/15 shadow-elevated p-5"
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.98, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-bold text-brandText">Help & Support</div>
                  <button onClick={() => setSupportOpen(false)} className="p-2 rounded-full hover:bg-muted">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  <Input
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="Subject (optional)"
                  />
                  <textarea
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="Describe your issue"
                    className="w-full min-h-[120px] rounded-[12px] border border-brandText/40 bg-white px-3 py-2 text-sm text-brandText placeholder:italic placeholder:text-gray-500/60 focus:outline-none focus:border-brandBlue focus:shadow-sm"
                  />
                  <button
                    disabled={sending || !supportMessage.trim()}
                    onClick={sendSupport}
                    className={cn(
                      "w-full rounded-lg bg-brandBlue text-white font-bold py-2 flex items-center justify-center gap-2",
                      (sending || !supportMessage.trim()) && "opacity-50"
                    )}
                  >
                    {sending ? "Sending..." : "Submit"}
                  </button>
                  <div className="text-[10px] text-brandText/70">
                    Your message is sent to the admin team for review.
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
