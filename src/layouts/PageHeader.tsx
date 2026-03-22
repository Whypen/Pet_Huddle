/**
 * PageHeader — Phase 4 / Step 23
 * Reusable glass-bar h-[56px] fixed top header.
 * z-[20] per Z-index map (nav shares z-[20], headers are below sheets/modals)
 */

import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title?: React.ReactNode;
  /** Custom left element. If omitted and showBack=true, renders ArrowLeft */
  left?: React.ReactNode;
  /** Custom right element */
  right?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  /** Extra class on the header root */
  className?: string;
  /** Extra class on the center title slot */
  titleClassName?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  left,
  right,
  showBack = false,
  onBack,
  className = "",
  titleClassName = "",
}) => {
  const navigate = useNavigate();

  const leftEl = left ?? (showBack ? (
    <button
      type="button"
      onClick={onBack ?? (() => navigate(-1))}
      className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]"
      aria-label="Back"
    >
      <ArrowLeft size={24} strokeWidth={1.5} />
    </button>
  ) : null);

  return (
    <header
      className={[
        "glass-bar fixed top-0 inset-x-0 z-[20] h-[56px]",
        className,
      ].join(" ")}
    >
      <div className="w-full max-w-md mx-auto h-[56px] flex items-center px-[16px] gap-[12px]">
        {/* Left slot */}
        <div className="flex-shrink-0 flex items-center">
          {leftEl}
        </div>

        {/* Center title */}
        {title && (
          <div className={`flex-1 flex items-center justify-center ${titleClassName}`}>
            {typeof title === "string" ? (
              <h1 className="text-[22px] font-[600] leading-[1.15] tracking-[-0.02em] text-[#424965] truncate">
                {title}
              </h1>
            ) : (
              title
            )}
          </div>
        )}

        {/* Right slot */}
        <div className="flex-shrink-0 flex items-center ml-auto">
          {right}
        </div>
      </div>
    </header>
  );
};

export default PageHeader;
