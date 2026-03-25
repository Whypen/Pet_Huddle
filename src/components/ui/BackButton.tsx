import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { lightHaptic } from "@/lib/haptics";

export function BackButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button
      type="button"
      onClick={() => {
        lightHaptic();
        // If we arrived from a settings drawer, navigate back to the originating
        // page carrying the openDrawer flag so GlobalHeader re-opens the drawer.
        const state = location.state as Record<string, unknown> | null;
        if (state?.openDrawer && state?.from) {
          navigate(state.from as string, {
            state: { openDrawer: true, drawerView: state.drawerView ?? "legal", from: state.from },
          });
        } else {
          navigate(-1);
        }
      }}
      className={className ?? "p-2 -ml-2 rounded-full hover:bg-muted active:text-brandBlue transition-colors"}
      aria-label="Back"
    >
      <ArrowLeft className="w-6 h-6" />
    </button>
  );
}

