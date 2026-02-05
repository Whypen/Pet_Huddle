import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, User, AlertTriangle, Check, Loader2, ChevronRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "pending" | "skipped">("idle");
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idUploading, setIdUploading] = useState(false);

  const handleStartVerification = async () => {
    if (!legalName.trim() || !phone.trim()) {
      toast.error(t("Please fill in your legal name and phone number first"));
      return;
    }

    if (!idFile) {
      toast.error(t("Please upload a valid ID or passport"));
      return;
    }

    if (!user) {
      toast.error(t("auth.errors.session_expired"));
      return;
    }

    setVerificationStatus("verifying");
    setIdUploading(true);

    try {
      const fileExt = idFile.name.split(".").pop() || "jpg";
      const fileName = `${user.id}/id-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("verification")
        .upload(fileName, idFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("verification")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          verification_document_url: publicUrl,
          verification_status: "pending",
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setVerificationStatus("pending");
      onVerificationStatusChange("pending");
      toast.success(t("Verification submitted for review"));
    } catch (error: any) {
      setVerificationStatus("idle");
      toast.error(error.message || t("Upload failed"));
    } finally {
      setIdUploading(false);
    }
  };

  const handleSkip = () => {
    if (!showSkipWarning) {
      setShowSkipWarning(true);
      return;
    }
    setVerificationStatus("skipped");
    onVerificationStatusChange("skipped");
    toast.info(t("Verification skipped - you can complete this later in settings"));
  };

  const canContinue = (legalName.trim() && phone.trim()) && (verificationStatus === "pending" || verificationStatus === "skipped");

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
            onChange={(e) => onLegalNameChange(e.target.value)}
            className="h-12 rounded-xl"
            disabled={verificationStatus === "verified"}
          />
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
            onChange={(value) => onPhoneChange(value || '')}
            className="phone-input-onboarding h-12 rounded-xl border border-border px-3 bg-muted"
            placeholder={t("Enter phone number")}
            disabled={verificationStatus === "verified"}
          />
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
            <label className="block cursor-pointer mb-4">
              <div className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-primary/50 transition-colors">
                <p className="text-sm font-medium mb-1">
                  {idFile ? idFile.name : t("Click to upload ID/Passport")}
                </p>
                <p className="text-xs text-muted-foreground">{t("PNG, JPG, PDF up to 10MB")}</p>
              </div>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            <Button
              onClick={handleStartVerification}
              className="w-full h-11 rounded-xl"
              disabled={!legalName.trim() || !phone.trim() || !idFile || idUploading}
            >
              {idUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Start Verification")}
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

        {canContinue && (
          <Button
            onClick={onContinue}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90"
          >
            {t("Continue to Profile Setup")}
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
};
