import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import type { TurnstileDiagnostics } from "@/hooks/useTurnstile";

type SignupTurnstileControlsProps = {
  siteKeyMissing?: boolean;
  setContainer: (element: HTMLDivElement | null) => void;
  showDiagnostics: boolean;
  diag: TurnstileDiagnostics;
};

const SignupTurnstileControls = ({
  siteKeyMissing,
  setContainer,
  showDiagnostics,
  diag,
}: SignupTurnstileControlsProps) => (
  <>
    <div data-testid="signup-credentials-turnstile">
      <TurnstileWidget
        siteKeyMissing={siteKeyMissing}
        setContainer={setContainer}
        className="min-h-[65px]"
      />
    </div>
    <TurnstileDebugPanel visible={showDiagnostics} diag={diag} />
  </>
);

export default SignupTurnstileControls;
