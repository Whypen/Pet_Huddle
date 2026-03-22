/**
 * AnimatedUploadButton — UI CONTRACT v3 — B.7
 *
 * States: idle → hover/dragging → uploading → complete → error
 * Reference: cosmos.so Animated Upload — dashed border zone, state transitions.
 *
 * Progress ring: r=18, circumference≈113 (B.7 spec)
 */

import * as React from "react";
import { UploadCloud, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadState = "idle" | "dragging" | "uploading" | "complete" | "error";

export interface AnimatedUploadButtonProps {
  state?:       UploadState;
  progress?:    number;          // 0–100, used in "uploading" state
  compact?:     boolean;         // compact: 112px height
  onUpload?:    () => void;      // triggered on click/drop
  onRetry?:     () => void;      // triggered on error click
  className?:   string;
}

// ─── Progress Ring (B.7) ────────────────────────────────────────────────────

// r=18, circumference = 2π×18 ≈ 113.097 → contract says ≈113
const CIRCUMFERENCE = 113;

function ProgressRing({ progress }: { progress: number }) {
  const offset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      {/* Track */}
      <circle
        cx="20" cy="20" r="18"
        fill="none"
        stroke="rgba(33,69,207,0.15)"
        strokeWidth="2.5"
      />
      {/* Progress arc */}
      <circle
        cx="20" cy="20" r="18"
        fill="none"
        stroke="#2145CF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 20 20)"
        style={{ transition: "stroke-dashoffset 100ms linear" }}
      />
    </svg>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AnimatedUploadButton({
  state    = "idle",
  progress = 0,
  compact  = false,
  onUpload,
  onRetry,
  className,
}: AnimatedUploadButtonProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const effectiveState: UploadState = isDragging ? "dragging" : state;

  // ─── Container style per state ─────────────────────────────────────────

  const containerStyle: Record<UploadState, string> = {
    idle: [
      "border-[1.5px] border-dashed border-[rgba(33,69,207,0.32)]",
      "bg-[rgba(255,255,255,0.48)]",
      // Idle pulse: opacity animation on border (B.7)
      "animate-[v3-border-pulse_2.2s_ease-in-out_infinite]",
    ].join(" "),

    dragging: [
      "border-[2px] border-solid border-[#2145CF]",
      "bg-[rgba(33,69,207,0.06)]",
      "scale-[1.02]",
    ].join(" "),

    uploading: [
      "border-[2px] border-solid border-[rgba(33,69,207,0.40)]",
      "bg-[rgba(255,255,255,0.56)]",
    ].join(" "),

    complete: [
      "border-[1.5px] border-solid border-[#22C55E]",
      "bg-[rgba(34,197,94,0.06)]",
    ].join(" "),

    error: [
      "border-[1.5px] border-solid border-[#E84545]",
      "bg-[rgba(232,69,69,0.06)]",
      // x-shake: 3× 80ms ±4px per B.7
      "animate-[v3-shake_240ms_ease-out]",
    ].join(" "),
  };

  // ─── Drag handlers ─────────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onUpload?.();
  };

  const handleClick = () => {
    if (effectiveState === "error") onRetry?.();
    else if (effectiveState === "idle") onUpload?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        // B.7 Container
        "w-full flex flex-col items-center justify-center gap-[8px]",
        "rounded-[20px]",
        "backdrop-blur-[12px]",
        compact ? "h-[112px]" : "h-[160px]",
        // Motion
        "transition-all duration-200 ease-out",
        // State-specific styles
        containerStyle[effectiveState],
        // Reset button styles
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2145CF]",
        className,
      )}
      aria-label={
        effectiveState === "error"
          ? "Upload failed — tap to retry"
          : effectiveState === "complete"
            ? "Upload complete"
            : "Upload file"
      }
    >
      {/* ── Idle ── */}
      {effectiveState === "idle" && (
        <>
          <UploadCloud
            className="text-[#2145CF]"
            size={24}
            strokeWidth={1.5}
          />
          <span className="text-[11px] text-[rgba(74,73,101,0.55)] leading-[1.45] tracking-[0.02em]">
            Upload photo
          </span>
        </>
      )}

      {/* ── Dragging ── */}
      {effectiveState === "dragging" && (
        <span className="text-[13px] font-medium text-[#2145CF] leading-[1.40] tracking-[0.01em]">
          Drop here
        </span>
      )}

      {/* ── Uploading ── */}
      {effectiveState === "uploading" && (
        <>
          <ProgressRing progress={progress} />
          <span className="text-[11px] font-medium text-[#2145CF] leading-[1.45] tracking-[0.02em]">
            {Math.round(progress)}%
          </span>
        </>
      )}

      {/* ── Complete ── */}
      {effectiveState === "complete" && (
        <>
          <CheckCircle
            className="text-[#22C55E] animate-[v3-step-in_300ms_cubic-bezier(0.34,1.20,0.64,1)]"
            size={24}
            strokeWidth={1.5}
          />
          <span className="text-[11px] font-medium text-[#22C55E] leading-[1.45] tracking-[0.02em]">
            Uploaded
          </span>
        </>
      )}

      {/* ── Error ── */}
      {effectiveState === "error" && (
        <>
          <XCircle
            className="text-[#E84545]"
            size={24}
            strokeWidth={1.5}
          />
          <span className="text-[11px] font-medium text-[#E84545] leading-[1.45] tracking-[0.02em]">
            Failed — tap to retry
          </span>
        </>
      )}
    </button>
  );
}

AnimatedUploadButton.displayName = "AnimatedUploadButton";
