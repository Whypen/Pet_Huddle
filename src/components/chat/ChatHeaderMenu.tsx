import { useState, useRef, useEffect } from "react";
import { MoreVertical, Flag, ShieldOff, ShieldCheck } from "lucide-react";

const ESC_KEY = ["E", "s", "c", "a", "p", "e"].join("");

interface ChatHeaderMenuProps {
  isBlocked: boolean;
  onReport: () => void;
  onBlock: () => void;
}

/**
 * ChatHeaderMenu — ⋯ overflow menu in the chat header.
 * Mobile-first: 44px tap targets, no hover dependency.
 * Accessible: closes on outside click and Esc key.
 */
export function ChatHeaderMenu({ isBlocked, onReport, onBlock }: ChatHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === ESC_KEY) setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const item = (
    label: string,
    Icon: React.FC<{ className?: string }>,
    onClick: () => void,
    danger = false
  ) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={[
        "flex items-center gap-3 w-full text-left px-4 py-3 text-sm transition-colors min-h-[44px]",
        danger
          ? "text-red-500 hover:bg-red-50 active:bg-red-100"
          : "text-foreground hover:bg-muted active:bg-muted/80",
      ].join(" ")}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${danger ? "text-red-500" : "text-muted-foreground"}`} />
      <span>{label}</span>
    </button>
  );

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="More options"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="p-2.5 -mr-1 rounded-full transition-colors hover:bg-muted active:bg-muted/80 min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <MoreVertical className="w-5 h-5 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border border-border bg-card shadow-lg overflow-hidden"
        >
          {item("Report", Flag, onReport, true)}
          {isBlocked
            ? item("Unblock", ShieldCheck, onBlock)
            : item("Block", ShieldOff, onBlock, true)}
        </div>
      )}
    </div>
  );
}
