import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { lightHaptic } from "@/lib/haptics";

export function BackButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        lightHaptic();
        navigate(-1);
      }}
      className={className ?? "p-2 -ml-2 rounded-full hover:bg-muted active:text-brandBlue transition-colors"}
      aria-label="Back"
    >
      <ArrowLeft className="w-6 h-6" />
    </button>
  );
}

