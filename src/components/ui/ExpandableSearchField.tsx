import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ExpandableSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  label: string;
  placeholder?: string;
  className?: string;
};

/** One tokenized, compact search treatment for Social, Groups, and Chats. */
export const ExpandableSearchField = ({
  value,
  onChange,
  onClose,
  label,
  placeholder = "Search",
  className,
}: ExpandableSearchFieldProps) => (
  <label className={cn("form-field-rest flex h-11 w-full items-center rounded-[22px] px-3", className)}>
    <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
    <span className="sr-only">{label}</span>
    <input
      autoFocus
      type="text"
      inputMode="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="field-input-core min-w-0 flex-1 pl-2 text-sm"
    />
    <button type="button" aria-label="Close search" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-muted">
      <X className="h-4 w-4" aria-hidden />
    </button>
  </label>
);
