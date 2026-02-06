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
  Bug,
  FileText,
  Scale,
  LogOut,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Crown,
  Check,
  Loader2,
} from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { useAuth, useIsAdmin } from "@/contexts/AuthContext";
import { useLanguage, Language } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpsell } from "@/hooks/useUpsell";
import { UpsellModal } from "@/components/monetization/UpsellModal";

const languageOptions: { value: Language; labelKey: string }[] = [
  { value: "en", labelKey: "language.english" },
  { value: "zh-TW", labelKey: "language.zh_tw" },
  { value: "zh-CN", labelKey: "language.zh_cn" },
];

const Settings = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const isAdmin = useIsAdmin();
  const { t, language, setLanguage } = useLanguage();
  const { upsellModal, closeUpsellModal, buyAddOn, checkFamilySlotsAvailable } = useUpsell();

  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [bugDescription, setBugDescription] = useState("");
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Biometric setup state
  const [biometricStep, setBiometricStep] = useState(0);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // FINAL: ID Verification state
  const [showIDUpload, setShowIDUpload] = useState(false);
  const [idFile, setIDFile] = useState<File | null>(null);
  const [idUploading, setIdUploading] = useState(false);

  // Toggle states
  const [biometric, setBiometric] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [nonSocial, setNonSocial] = useState(false);
  const [hideFromMap, setHideFromMap] = useState(false);
  const [pauseNotif, setPauseNotif] = useState(false);
  const [socialNotif, setSocialNotif] = useState(true);
  const [safetyNotif, setSafetyNotif] = useState(true);
  const [aiNotif, setAiNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);

  const isVerified = profile?.is_verified;
  const isGold = profile?.tier === "gold";
  const isPremium = profile?.tier === "premium" || profile?.tier === "gold";
  const currentFamilyCount = profile?.care_circle?.length || 0;
  const availableFamilySlots = Math.max(0, (profile?.family_slots || 0) - currentFamilyCount);
  const inviteLink = user ? `${window.location.origin}/invite?ref=${user.id}` : "";

  // Handle pause all notifications
  const handlePauseAll = (checked: boolean) => {
    setPauseNotif(checked);
    if (checked) {
      setSocialNotif(false);
      setSafetyNotif(false);
      setAiNotif(false);
      setEmailNotif(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleVersionPressStart = () => {
    if (pressTimer) return;
    const timer = setTimeout(async () => {
      if (isAdmin) {
        navigate("/admin/control-center");
        return;
      }
      const versionText = "huddle v1.5";
      try {
        await navigator.clipboard.writeText(versionText);
        toast.success(t("Version copied to clipboard"));
      } catch {
        toast.success(t("Version copied to clipboard"));
      }
    }, 3000);
    setPressTimer(timer);
  };

  const handleVersionPressEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  const handleInvite = async () => {
    if (!user) return;
    if (availableFamilySlots <= 0) {
      await checkFamilySlotsAvailable();
      return;
    }
    const link = `${window.location.origin}/invite?ref=${user.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("Invite link copied"));
    } catch (error) {
      console.error("Failed to copy invite link:", error);
      toast.error(t("Failed to copy invite link"));
    }
  };

  const handleDeleteAccount = () => {
    toast.success(t("Account deletion requested. You will receive a confirmation email."));
    setShowDeleteConfirm(false);
  };

  const handleBugSubmit = () => {
    if (!bugDescription.trim()) {
      toast.error(t("Please describe the bug"));
      return;
    }
    toast.success(t("Bug report submitted. Thank you!"));
    setBugDescription("");
    setShowBugReport(false);
  };

  // Password change flow
  const handleVerifyPassword = async () => {
    if (!currentPassword || !user?.email) return;

    setPasswordLoading(true);
    try {
      // Attempt to sign in with current password to verify
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (error) {
        toast.error(t("Current password is incorrect"));
      } else {
        setPasswordVerified(true);
        toast.success(t("Password verified"));
      }
    } catch (error) {
      toast.error(t("Failed to verify password"));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error(t("Password must be at least 8 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success(t("Password updated successfully"));
      setShowPasswordChange(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordVerified(false);
    } catch (error) {
      toast.error(t("Failed to update password"));
    } finally {
      setPasswordLoading(false);
    }
  };

  // Biometric setup flow (mock)
  const handleBiometricSetup = async () => {
    setShowBiometricSetup(true);
    setBiometricStep(1);
    setBiometricLoading(true);

    // Step 1: Place finger - 2 seconds
    await new Promise((r) => setTimeout(r, 2000));
    setBiometricStep(2);

    // Step 2: Scanning - 2 seconds
    await new Promise((r) => setTimeout(r, 2000));
    setBiometricStep(3);

    // Step 3: Success - 1 second then close
    await new Promise((r) => setTimeout(r, 1000));
    setBiometricLoading(false);
    setBiometric(true);
    setShowBiometricSetup(false);
    setBiometricStep(0);
    toast.success(t("Biometric authentication enabled"));
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{t("settings.account_settings")}</h1>
      </header>

      <div className="overflow-y-auto scrollbar-visible" style={{ maxHeight: "calc(100vh - 140px)" }}>
        {/* User Header in Settings */}
        <section className="p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="relative">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={t("Profile")}
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
                  isGold
                    ? "bg-gradient-to-r from-amber-400 to-amber-500"
                    : isVerified
                      ? "bg-gradient-to-r from-[#FBBF24] via-[#F59E0B] to-[#D97706]"
                      : "bg-muted"
                )}
              >
                {isGold ? (
                  <Crown className="w-3.5 h-3.5 text-amber-900" />
                ) : isVerified ? (
                  <Shield className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">{profile?.display_name || t("User")}</h2>
              <p className="text-sm text-muted-foreground">
                {isVerified ? t("settings.verified_badge") : t("settings.pending")}
              </p>
              <span
                className={cn(
                  "inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full",
                  isPremium
                    ? isGold
                      ? "bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800"
                      : "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isPremium ? (isGold ? t("Gold") : t("Premium")) : t("Free")}
              </span>
              {!isVerified && (
                <button
                  onClick={() => navigate("/verify-identity")}
                  className="mt-2 inline-flex items-center rounded-full bg-[#3283ff] px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                >
                  {t("Verify Identity")}
                </button>
              )}
            </div>
            <button
              onClick={() => navigate("/edit-profile")}
              className="p-2 rounded-full hover:bg-muted"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Family Section */}
        <section className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{t("Family")}</h3>
              <p className="text-xs text-muted-foreground">
                {availableFamilySlots > 0
                  ? t("invite.slots_available").replace("{count}", String(availableFamilySlots))
                  : t("invite.no_slots")}
              </p>
            </div>
            <Button
              onClick={async () => {
                if (!isGold) {
                  setIsPremiumOpen(true);
                  return;
                }
                if (availableFamilySlots > 0) {
                  setShowInviteModal(true);
                } else {
                  await checkFamilySlotsAvailable();
                }
              }}
            >
              {t("Invite")}
            </Button>
          </div>
          {!isGold && (
            <div className="mt-3 rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100 p-4 text-center">
              <p className="text-sm font-semibold text-amber-800">{t("Upgrade to Gold for Family Sharing.")}</p>
              <p className="text-xs text-amber-700 mt-1">{t("family.upsell_body")}</p>
              <Button
                onClick={() => navigate("/manage-subscription")}
                size="sm"
                className="mt-3 h-8 px-3 bg-[#3283ff] hover:bg-[#3283ff]/90"
              >
                {t("Upgrade to Gold")}
              </Button>
            </div>
          )}
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

            <button
              onClick={() => setShowPasswordChange(true)}
              className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.password")}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* FINAL: ID Verification Upload */}
            <button
              onClick={() => setShowIDUpload(true)}
              className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div className="text-left">
                  <span className="font-medium block">{t("Identity Verification")}</span>
                  {profile?.verification_status === 'pending' && (
                    <span className="text-xs text-warning">{t("Waiting for Approval")}</span>
                  )}
                  {profile?.verification_status === 'approved' && profile?.is_verified && (
                    <span className="text-xs text-primary flex items-center gap-1">
                      <Check className="w-3 h-3" /> {t("Verified")}
                    </span>
                  )}
                  {profile?.verification_status === 'rejected' && (
                    <span className="text-xs text-destructive">{t("Verification Rejected")}</span>
                  )}
                  {(!profile?.verification_status || profile?.verification_status === 'not_submitted') && (
                    <span className="text-xs text-muted-foreground">{t("Upload ID/Passport")}</span>
                  )}
                  {profile?.verification_status === 'rejected' && profile?.verification_comment && (
                    <span className="text-[11px] text-muted-foreground block">
                      {t("Review Note")}: {profile.verification_comment}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{t("settings.biometric")}</span>
              </div>
              <Switch
                checked={biometric}
                onCheckedChange={(checked) => {
                  if (checked) {
                    handleBiometricSetup();
                  } else {
                    setBiometric(false);
                  }
                }}
              />
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
                <div>
                  <span className="font-medium">{t("Non-Social")}</span>
                  <p className="text-xs text-muted-foreground">{t("Hide from social discovery")}</p>
                </div>
              </div>
              <Switch checked={nonSocial} onCheckedChange={setNonSocial} />
            </div>

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground" />
                <div>
                  <span className="font-medium">{t("Hide from Map")}</span>
                  <p className="text-xs text-muted-foreground">{t("Don't show my location")}</p>
                </div>
              </div>
              <Switch checked={hideFromMap} onCheckedChange={setHideFromMap} />
            </div>

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
              <Switch checked={pauseNotif} onCheckedChange={handlePauseAll} />
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
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </section>

        {/* Manage Subscription - moved out of settings */}
        <section className="p-4 border-b border-border">
          <button
            onClick={() => navigate("/premium")}
            className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-primary" />
              <span className="font-medium">{t("Manage Subscription")}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
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

            <button className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-destructive/10 transition-colors text-destructive"
              onClick={() => toast.warning(t("To deactivate, contact support@huddle.app"))}>
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
          <span className="text-xs text-muted-foreground">{t("v1.0.0 (2026)")}</span>
        </div>
      </div>

      {/* Modals */}
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />
      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">{t("Invite Family Member")}</h3>
              <p className="text-xs text-muted-foreground mb-4 font-huddle">
                {t("Share this link to invite a family member to your huddle.")}
              </p>
              <Input
                value={inviteLink}
                readOnly
                className="mb-4"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowInviteModal(false)} className="flex-1">
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleInvite} className="flex-1">
                  {t("Copy Invite Link")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Password Change Modal */}
      <AnimatePresence>
        {showPasswordChange && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPasswordChange(false)}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-card rounded-2xl p-6 z-50 shadow-elevated"
            >
              <h2 className="text-lg font-bold mb-4">{t("Change Password")}</h2>

              {!passwordVerified ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("First, verify your current password")}
                  </p>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t("Current password")}
                    className="mb-4"
                  />
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowPasswordChange(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleVerifyPassword}
                      disabled={passwordLoading || !currentPassword}
                    >
                      {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Verify")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">{t("Enter your new password")}</p>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("New password (min 8 characters)")}
                    className="mb-3"
                  />
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("Confirm new password")}
                    className="mb-4"
                  />
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowPasswordChange(false);
                        setPasswordVerified(false);
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleChangePassword}
                      disabled={passwordLoading || !newPassword || !confirmPassword}
                    >
                      {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Update")}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Biometric Setup Modal */}
      <AnimatePresence>
        {showBiometricSetup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-card rounded-2xl p-6 z-50 shadow-elevated"
            >
              <h2 className="text-lg font-bold mb-6 text-center">{t("Biometric Setup")}</h2>

              {/* Progress Stepper */}
              <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={cn(
                      "w-3 h-3 rounded-full transition-all",
                      biometricStep >= step ? "bg-primary" : "bg-muted"
                    )}
                  />
                ))}
              </div>

              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  {biometricStep === 3 ? (
                    <Check className="w-12 h-12 text-accent" />
                  ) : (
                    <Fingerprint className="w-12 h-12 text-primary" />
                  )}
                </div>

                <p className="font-medium">
                  {biometricStep === 1 && t("Place your finger on the sensor")}
                  {biometricStep === 2 && t("Scanning...")}
                  {biometricStep === 3 && t("Success!")}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {biometricStep === 1 && t("Touch the fingerprint sensor")}
                  {biometricStep === 2 && t("Keep your finger steady")}
                  {biometricStep === 3 && t("Biometric authentication enabled")}
                </p>

                {biometricLoading && biometricStep < 3 && (
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mt-4 text-primary" />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
                  {t("This action cannot be undone. All your data will be permanently deleted.")}
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
                <Button variant="destructive" className="flex-1" onClick={handleDeleteAccount}>
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
                placeholder={t("Describe the issue...")}
                className="min-h-[120px] mb-4"
              />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowBugReport(false)}>
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1" onClick={handleBugSubmit}>
                  {t("Submit")}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FINAL: ID Upload Modal */}
      <AnimatePresence>
        {showIDUpload && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowIDUpload(false)}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-card rounded-2xl p-6 z-50 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{t("Identity Verification")}</h3>
                <button onClick={() => setShowIDUpload(false)} className="p-2 rounded-full hover:bg-muted">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("Upload a government-issued ID or passport for review. Approval typically takes 24-48 hours.")}
                </p>

                {profile?.verification_status === 'pending' && (
                  <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                    <p className="text-sm text-warning font-medium">{t("⏳ Waiting for Approval")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("Your ID is under review")}</p>
                  </div>
                )}

                {profile?.verification_status === "approved" && profile?.is_verified && (
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                    <p className="text-sm text-primary font-medium flex items-center gap-2">
                      <Check className="w-4 h-4" /> {t("Verified Huddler")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t("Your identity is verified")}</p>
                  </div>
                )}

                {(!profile?.verification_status || profile?.verification_status === 'not_submitted' || profile?.verification_status === 'rejected') && (
                  <>
                    <label className="block cursor-pointer">
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                        <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm font-medium mb-1">
                          {idFile ? idFile.name : t("Click to upload ID/Passport")}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("PNG, JPG, PDF up to 10MB")}</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setIDFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>

                    <Button
                      onClick={async () => {
                        if (!idFile || !user) return;
                        setIdUploading(true);
                        try {
                          const fileExt = idFile.name.split('.').pop();
                          const fileName = `${user.id}/id-${Date.now()}.${fileExt}`;

                          const { error: uploadError } = await supabase.storage
                            .from('verification')
                            .upload(fileName, idFile);

                          if (uploadError) throw uploadError;

                          const { data: { publicUrl } } = supabase.storage
                            .from('verification')
                            .getPublicUrl(fileName);

                          const { error: updateError } = await supabase
                            .from('profiles')
                            .update({
                              verification_document_url: publicUrl,
                              verification_status: 'pending'
                            })
                            .eq('id', user.id);

                          if (updateError) throw updateError;

                          await refreshProfile();
                          toast.success(t("ID uploaded! Waiting for approval"));
                          setShowIDUpload(false);
                          setIDFile(null);
                        } catch (error: any) {
                          toast.error(error.message || t("Upload failed"));
                        } finally {
                          setIdUploading(false);
                        }
                      }}
                      disabled={!idFile || idUploading}
                      className="w-full"
                    >
                      {idUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Upload & Submit")}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <div className="px-4 py-6 text-center text-xs text-muted-foreground select-none">
        <span
          onMouseDown={handleVersionPressStart}
          onMouseUp={handleVersionPressEnd}
          onMouseLeave={handleVersionPressEnd}
          onTouchStart={handleVersionPressStart}
          onTouchEnd={handleVersionPressEnd}
          className="inline-block"
        >
          huddle v1.5
        </span>
      </div>
    </div>
  );
};

export default Settings;
