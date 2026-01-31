import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User,
  Shield,
  Lock,
  Fingerprint,
  Smartphone,
  Eye,
  EyeOff,
  MapPin,
  Bell,
  BellOff,
  Globe,
  HelpCircle,
  Bug,
  FileText,
  Scale,
  LogOut,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Crown,
  Check,
} from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { LegalModal } from "@/components/modals/LegalModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, Language } from "@/contexts/LanguageContext";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const languageOptions: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "zh-CN", label: "简体中文" },
];

const Settings = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugDescription, setBugDescription] = useState("");

  // Toggle states
  const [biometric, setBiometric] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [mapVisibility, setMapVisibility] = useState(true);
  const [pauseNotif, setPauseNotif] = useState(false);
  const [socialNotif, setSocialNotif] = useState(true);
  const [safetyNotif, setSafetyNotif] = useState(true);
  const [aiNotif, setAiNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);

  const isVerified = profile?.is_verified;
  const isPremium = profile?.user_role === "premium";

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleDeleteAccount = () => {
    // Would integrate with backend
    toast.success("Account deletion requested. You will receive a confirmation email.");
    setShowDeleteConfirm(false);
  };

  const handleBugSubmit = () => {
    if (!bugDescription.trim()) {
      toast.error("Please describe the bug");
      return;
    }
    toast.success("Bug report submitted. Thank you!");
    setBugDescription("");
    setShowBugReport(false);
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{t("settings.title")}</h1>
      </header>

      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
        {/* User Header in Settings */}
        <section className="p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="relative">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              {/* Badge */}
              <div
                className={cn(
                  "absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center",
                  isVerified ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-muted"
                )}
              >
                {isVerified ? (
                  <Crown className="w-3.5 h-3.5 text-amber-900" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">{profile?.display_name || "User"}</h2>
              <p className="text-sm text-muted-foreground">
                {isVerified ? t("settings.verified_badge") : t("settings.pending")}
              </p>
              <span
                className={cn(
                  "inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full",
                  isPremium
                    ? "bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isPremium ? t("header.premium") : t("header.free")}
              </span>
            </div>
            <button
              onClick={() => navigate("/edit-profile")}
              className="p-2 rounded-full hover:bg-muted"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Account & Security */}
        <section className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {t("settings.account_security")}
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => navigate("/edit-profile")}
              className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.personal_info")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.password")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.biometric")}</span>
              </div>
              <Switch checked={biometric} onCheckedChange={setBiometric} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.2fa")}</span>
              </div>
              <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {t("settings.privacy")}
          </h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <EyeOff className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.private_account")}</span>
              </div>
              <Switch checked={privateAccount} onCheckedChange={setPrivateAccount} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.map_visibility")}</span>
              </div>
              <Switch checked={mapVisibility} onCheckedChange={setMapVisibility} />
            </div>

            <button className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.trusted_locations")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {t("settings.notifications")}
          </h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl mb-2">
              <div className="flex items-center gap-3">
                <BellOff className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.pause_all")}</span>
              </div>
              <Switch checked={pauseNotif} onCheckedChange={setPauseNotif} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.social_notif")}</span>
              </div>
              <Switch checked={socialNotif} onCheckedChange={setSocialNotif} disabled={pauseNotif} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.safety_notif")}</span>
              </div>
              <Switch checked={safetyNotif} onCheckedChange={setSafetyNotif} disabled={pauseNotif} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.ai_notif")}</span>
              </div>
              <Switch checked={aiNotif} onCheckedChange={setAiNotif} disabled={pauseNotif} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.email_notif")}</span>
              </div>
              <Switch checked={emailNotif} onCheckedChange={setEmailNotif} disabled={pauseNotif} />
            </div>
          </div>
        </section>

        {/* Language */}
        <section className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {t("settings.language")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {languageOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setLanguage(option.value)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2",
                  language === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {language === option.value && <Check className="w-4 h-4" />}
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* Help & Support */}
        <section className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {t("settings.help_support")}
          </h3>
          <div className="space-y-1">
            <button className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.help_support")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => setShowBugReport(true)}
              className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bug className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.report_bug")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => setShowPrivacy(true)}
              className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.privacy_policy")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => setShowTerms(true)}
              className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Scale className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.terms")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="p-4 border-b border-border">
          <div className="space-y-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <LogOut className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">{t("settings.logout")}</span>
            </button>

            <button className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-destructive/10 transition-colors text-amber-600">
              <EyeOff className="w-5 h-5" />
              <span className="font-medium">{t("settings.deactivate")}</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-destructive/10 transition-colors text-destructive"
            >
              <Trash2 className="w-5 h-5" />
              <span className="font-medium">{t("settings.delete")}</span>
            </button>
          </div>
        </section>

        {/* Footer */}
        <div className="p-6 text-center">
          <span className="text-xs text-muted-foreground">v1.0.0 (2026)</span>
        </div>
      </div>

      {/* Modals */}
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <LegalModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} type="privacy" />
      <LegalModal isOpen={showTerms} onClose={() => setShowTerms(false)} type="terms" />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-card rounded-2xl p-6 z-50 shadow-elevated"
            >
              <div className="text-center mb-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <h2 className="text-lg font-bold mb-2">{t("settings.delete")}?</h2>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. All your data will be permanently deleted.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeleteAccount}
                >
                  {t("common.delete")}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bug Report Modal */}
      <AnimatePresence>
        {showBugReport && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBugReport(false)}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-card rounded-2xl p-6 z-50 shadow-elevated"
            >
              <h2 className="text-lg font-bold mb-4">{t("settings.report_bug")}</h2>
              <Textarea
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                placeholder="Describe the issue..."
                className="min-h-[120px] mb-4"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowBugReport(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1" onClick={handleBugSubmit}>
                  Submit
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Settings;
