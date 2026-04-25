import { FormField, NeuCheckbox } from "@/components/ui";
import { NeuButton } from "@/components/ui/NeuButton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { enablePersistentSession, enableSessionOnlyAuth } from "@/lib/authSessionPersistence";
import { mapAuthFailureMessage } from "@/lib/authErrorMessages";
import { Lock, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type SignupAlreadyRegisteredDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signinEmail: string;
  setSigninEmail: (value: string) => void;
  signinPassword: string;
  setSigninPassword: (value: string) => void;
  signinRemember: boolean;
  setSigninRemember: (value: boolean) => void;
  signinError: string;
  setSigninError: (value: string) => void;
  signinLoading: boolean;
  setSigninLoading: (value: boolean) => void;
  signIn: (email: string, password: string) => Promise<{
    error: Error | null;
    mfaRequired: boolean;
  }>;
  goHome: () => void;
};

const SignupAlreadyRegisteredDialog = ({
  open,
  onOpenChange,
  signinEmail,
  setSigninEmail,
  signinPassword,
  setSigninPassword,
  signinRemember,
  setSigninRemember,
  signinError,
  setSigninError,
  signinLoading,
  setSigninLoading,
  signIn,
  goHome,
}: SignupAlreadyRegisteredDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogTitle className="text-[18px] font-[600] text-[#424965]">
        Already Registered
      </DialogTitle>
      <DialogDescription className="text-[13px] text-[rgba(74,73,101,0.70)]">
        This email or phone number is already registered
      </DialogDescription>

      <div className="space-y-4 mt-4">
        <FormField
          type="email"
          label="Email"
          leadingIcon={<Mail size={16} strokeWidth={1.75} />}
          value={signinEmail}
          onChange={(e) => setSigninEmail(e.target.value)}
          placeholder="Email"
        />

        <FormField
          type="password"
          label="Password"
          leadingIcon={<Lock size={16} strokeWidth={1.75} />}
          value={signinPassword}
          onChange={(e) => setSigninPassword(e.target.value)}
          placeholder="Password"
        />

        <div className="flex items-center justify-between">
          <NeuCheckbox
            checked={signinRemember}
            onCheckedChange={(v) => setSigninRemember(Boolean(v))}
            label="Stay logged in"
          />
          <Link to="/reset-password" className="text-[13px] text-[#2145CF]">
            Forgot password?
          </Link>
        </div>

        {signinError && (
          <p className="text-[12px] text-[#EF4444]">{signinError}</p>
        )}

        <NeuButton
          className="w-full"
          disabled={!signinEmail || !signinPassword || signinLoading}
          onClick={async () => {
            setSigninLoading(true);
            setSigninError("");
            try {
              const result = await signIn(signinEmail, signinPassword);
              if (result.error) {
                throw new Error(mapAuthFailureMessage(result.error.message));
              }
              if (result.mfaRequired) {
                throw new Error("Two-step verification is required. Please continue from the Sign in screen.");
              }

              if (signinRemember) {
                localStorage.setItem("auth_login_identifier", signinEmail);
                enablePersistentSession();
              } else {
                localStorage.removeItem("auth_login_identifier");
                enableSessionOnlyAuth();
              }

              toast.success("Signed in successfully");
              onOpenChange(false);
              goHome();
            } catch (err: unknown) {
              setSigninError(mapAuthFailureMessage(err instanceof Error ? err.message : "Couldn’t sign you in."));
            } finally {
              setSigninLoading(false);
            }
          }}
        >
          {signinLoading ? "Signing in…" : "Sign in"}
        </NeuButton>
      </div>
    </DialogContent>
  </Dialog>
);

export default SignupAlreadyRegisteredDialog;
