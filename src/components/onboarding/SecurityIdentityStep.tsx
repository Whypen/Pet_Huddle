import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Phone, User, AlertTriangle, Check, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SecurityIdentityStepProps {
  legalName: string;
  phone: string;
  onLegalNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onVerificationComplete: (verified: boolean) => void;
  onContinue: () => void;
}

export const SecurityIdentityStep = ({
  legalName,
  phone,
  onLegalNameChange,
  onPhoneChange,
  onVerificationComplete,
  onContinue,
}: SecurityIdentityStepProps) => {
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "verified" | "skipped">("idle");
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  const handleStartVerification = () => {
    if (!legalName.trim() || !phone.trim()) {
      toast.error("Please fill in your legal name and phone number first");
      return;
    }

    setVerificationStatus("verifying");
    
    // Mock Stripe Identity verification
    setTimeout(() => {
      setVerificationStatus("verified");
      onVerificationComplete(true);
      toast.success("Identity verified successfully!");
    }, 2500);
  };

  const handleSkip = () => {
    if (!showSkipWarning) {
      setShowSkipWarning(true);
      return;
    }
    setVerificationStatus("skipped");
    onVerificationComplete(false);
    toast.info("Verification skipped - you can complete this later in settings");
  };

  const canContinue = (legalName.trim() && phone.trim()) && (verificationStatus === "verified" || verificationStatus === "skipped");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Security & Identity</h2>
        <p className="text-muted-foreground text-sm">
          Verify your identity to unlock full community features
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="legalName" className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            Legal Name
          </Label>
          <Input
            id="legalName"
            placeholder="Enter your full legal name"
            value={legalName}
            onChange={(e) => onLegalNameChange(e.target.value)}
            className="h-12 rounded-xl"
            disabled={verificationStatus === "verified"}
          />
          <p className="text-xs text-muted-foreground">
            This is kept private and used only for verification
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            Phone Number
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="h-12 rounded-xl"
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
            <h3 className="font-semibold text-foreground mb-1">Identity Verification</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Complete verification to earn your Gold Badge
            </p>
            <Button
              onClick={handleStartVerification}
              className="w-full h-11 rounded-xl"
              disabled={!legalName.trim() || !phone.trim()}
            >
              Start Verification
            </Button>
          </>
        )}

        {verificationStatus === "verifying" && (
          <div className="py-4">
            <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
            <h3 className="font-semibold text-foreground mb-1">Verifying Identity...</h3>
            <p className="text-sm text-muted-foreground">
              Processing your verification request
            </p>
          </div>
        )}

        {verificationStatus === "verified" && (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-success/20 mx-auto mb-3 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Verified!</h3>
            <p className="text-sm text-muted-foreground">
              You've earned the Gold Verified Badge
            </p>
          </div>
        )}

        {verificationStatus === "skipped" && (
          <div className="py-4">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
              <Shield className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Verification Skipped</h3>
            <p className="text-sm text-muted-foreground">
              You can complete verification later in Settings
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
                Skipping verification may affect your user journey
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Unverified users have limited access to certain community features and may appear less trustworthy to others.
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
            {showSkipWarning ? "Yes, Skip Verification" : "Skip for now"}
          </Button>
        )}

        {canContinue && (
          <Button
            onClick={onContinue}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90"
          >
            Continue to Profile Setup
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
};
