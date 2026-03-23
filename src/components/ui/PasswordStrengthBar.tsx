// PasswordStrengthBar — 4-segment strength indicator
// Replaces checklist per DESIGN_MASTER_SPEC editorial cadence.
// One helper sentence below. Subtle fill animation. Respects reduced motion.

import { cn } from "@/lib/utils";

interface PasswordStrengthBarProps {
  checks: { length: boolean; upper: boolean; number: boolean; special: boolean };
  className?: string;
}

const barColor = (passed: number, index: number): string => {
  if (index >= passed) return "bg-gray-200";
  if (passed <= 1) return "bg-brandError";
  if (passed === 2) return "bg-brandAmber";
  if (passed === 3) return "bg-brandAmber";
  return "bg-brandSuccess";
};

export function PasswordStrengthBar({ checks, className }: PasswordStrengthBarProps) {
  const passed = [checks.length, checks.upper, checks.number, checks.special].filter(Boolean).length;

  return (
    <div className={cn("space-y-0", className)}>
      {/* 4-segment bar */}
      <div className="flex gap-1.5" role="meter" aria-valuenow={passed} aria-valuemin={0} aria-valuemax={4} aria-label="Password strength">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
              barColor(passed, i),
            )}
          />
        ))}
      </div>
    </div>
  );
}
