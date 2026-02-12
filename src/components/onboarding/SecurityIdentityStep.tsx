import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, User, AlertTriangle, Check, Loader2, ChevronRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorLabel } from "@/components/ui/ErrorLabel";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface SecurityIdentityStepProps {
  legalName: string;
  phone: string;
  onLegalNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onVerificationStatusChange: (status: "pending" | "skipped") => void;
  onContinue: () => void;
}

export const SecurityIdentityStep = ({
  legalName,
  phone,
  onLegalNameChange,
  onPhoneChange,
  onVerificationStatusChange,
  onContinue,
}: SecurityIdentityStepProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "verified" | "pending" | "skipped">("idle");
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ legalName: "", phone: "" });

  useEffect(() => {
    if (!user) return;
    // If user returns from /verify-identity, allow continue
    if (verificationStatus === "verifying") {
      setVerificationStatus("pending");
      onVerificationStatusChange("pending");
    }
  }, [user, verificationStatus, onVerificationStatusChange]);

  const handleStartVerification = async () => {
    const nextErrors = { legalName: "", phone: "" };
    if (!phone.trim()) {
      nextErrors.phone = t("Phone number is required");
    }
    setFieldErrors(nextErrors);
    if (nextErrors.legalName || nextErrors.phone) {
      return;
    }

    if (!user) {
      toast.error(t("auth.errors.session_expired"));
      return;
    }

    setVerificationStatus("verifying");
    onVerificationStatusChange("pending");
    navigate("/verify-identity");
  };

  const handleSkip = () => {
    if (!showSkipWarning) {
      setShowSkipWarning(true);
      return;
    }
    const nextErrors = { legalName: "", phone: "" };
    if (!phone.trim()) {
      nextErrors.phone = t("Phone number is required");
    }
    setFieldErrors(nextErrors);
    if (nextErrors.phone) {
      return;
    }
    setVerificationStatus("skipped");
    onVerificationStatusChange("skipped");
    toast.info(t("Verification skipped - you can complete this later in settings"));
    onContinue();
  };

  const isValid =
    Boolean(phone.trim()) &&
    (verificationStatus === "pending" || verificationStatus === "skipped");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{t("Security & Identity")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("Verify your identity to unlock full community features")}
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="legalName" className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            {t("Legal Name")}
          </Label>
          <Input
            id="legalName"
            placeholder={t("Enter your full legal name")}
            value={legalName}
            onChange={(e) => {
              onLegalNameChange(e.target.value);
              setFieldErrors((prev) => ({
                ...prev,
                legalName: "",
              }));
            }}
            className={`h-12 rounded-xl ${fieldErrors.legalName ? "border-red-500" : ""}`}
            aria-invalid={Boolean(fieldErrors.legalName)}
            disabled={verificationStatus === "verified"}
          />
          <ErrorLabel message={fieldErrors.legalName} />
          <p className="text-xs text-muted-foreground">
            {t("This is kept private and used only for verification")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            {t("Phone Number")}
          </Label>
          <PhoneInput
            international
            defaultCountry="HK"
            value={phone}
            onChange={(value) => {
              onPhoneChange(value || '');
              setFieldErrors((prev) => ({
                ...prev,
                phone: value?.trim() ? "" : t("Phone number is required"),
              }));
            }}
            className={`phone-input-onboarding h-12 rounded-xl border px-3 bg-muted ${fieldErrors.phone ? "border-red-500" : "border-border"}`}
            placeholder={t("Enter phone number")}
            disabled={verificationStatus === "verified"}
          />
          <ErrorLabel message={fieldErrors.phone} />
        </div>
      </div>

      {/* Stripe Identity Verification Block */}
      <motion.div
        className="rounded-2xl border-2 border-dashed border-border p-6 text-center"
        animate={{
          borderColor: verificationStatus === "verified" 
            ? "hsl(var(--success))" 
            : verificationStatus === "skipped"
            ? "hsl(var(--muted))"
            : "hsl(var(--border))"
        }}
      >
        {verificationStatus === "idle" && (
          <>
            <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
              <Shield className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{t("Identity Verification")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("Submit your ID for review to earn a verified badge")}
            </p>
            <Button
              onClick={handleStartVerification}
              className="w-full h-11 rounded-xl"
              disabled={!phone.trim()}
            >
              {t("Start Verification")}
            </Button>
          </>
        )}

        {verificationStatus === "verifying" && (
          <div className="py-4">
            <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
            <h3 className="font-semibold text-foreground mb-1">{t("Submitting for Review...")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("Processing your verification request")}
            </p>
          </div>
        )}

        {verificationStatus === "pending" && (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-warning/10 mx-auto mb-3 flex items-center justify-center">
              <Check className="w-6 h-6 text-warning" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{t("Verification Submitted")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("Your verification is pending approval")}
            </p>
          </div>
        )}

        {verificationStatus === "skipped" && (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
              <Shield className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{t("Verification Skipped")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("You can complete verification later in Settings")}
            </p>
          </div>
        )}
      </motion.div>

      {/* Skip Warning */}
      {showSkipWarning && verificationStatus === "idle" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-warning/10 border border-warning/30 p-4"
        >
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning-foreground">
                {t("Skipping verification may affect your user journey")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("Unverified users have limited access to certain community features and may appear less trustworthy to others.")}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        {verificationStatus === "idle" && (
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="w-full h-11 text-muted-foreground"
          >
            {showSkipWarning ? t("Yes, Skip Verification") : t("Skip for now")}
          </Button>
        )}

        <Button
          onClick={onContinue}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50"
          disabled={!isValid}
        >
          {t("Continue to Profile Setup")}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
};
