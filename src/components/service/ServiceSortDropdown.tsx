import { ArrowDownWideNarrow, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ServiceSortOption } from "./filterProviders";

interface ServiceSortDropdownProps {
  value: ServiceSortOption;
  onChange: (next: ServiceSortOption) => void;
}

const OPTIONS: Array<{ value: ServiceSortOption; label: string }> = [
  { value: "proximity", label: "Proximity" },
  { value: "latest", label: "Latest" },
  { value: "price_low_to_high", label: "Price: Low to high" },
  { value: "price_high_to_low", label: "Price: High to low" },
  { value: "popularity", label: "Popularity" },
];

export function ServiceSortDropdown({ value, onChange }: ServiceSortDropdownProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Sort services"
          className="h-6 w-6 rounded-none text-[var(--text-tertiary)] flex items-center justify-center hover:bg-transparent"
        >
          <ArrowDownWideNarrow className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[4350] w-[208px] p-2 rounded-[14px] border border-brandText/10 bg-white"
      >
        {OPTIONS.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className="w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-left hover:bg-muted/40"
            >
              <span>{option.label}</span>
              {active ? <Check className="w-4 h-4 text-brandBlue" strokeWidth={2} /> : <span className="w-4 h-4" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
