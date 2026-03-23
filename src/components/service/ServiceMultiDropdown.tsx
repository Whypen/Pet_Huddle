import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SERVICE_TYPES } from "./carerServiceConstants";

interface ServiceMultiDropdownProps {
  options?: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  selectedLabelPrefix?: string;
  className?: string;
}

export function ServiceMultiDropdown({
  options = SERVICE_TYPES,
  selected,
  onChange,
  placeholder = "All",
  selectedLabelPrefix = "Select",
  className,
}: ServiceMultiDropdownProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "form-field-rest h-10 !rounded-[20px] px-2.5 min-w-[94px] max-w-[126px] text-[14px] font-normal text-[var(--text-tertiary)] flex items-center justify-between gap-1",
            className,
          )}
        >
          <span className="truncate">{selected.length > 0 ? `${selectedLabelPrefix} (${selected.length})` : placeholder}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[4350] w-[220px] p-2 rounded-[14px] border border-brandText/10 bg-white"
      >
        <div className="max-h-[280px] overflow-y-auto pr-1">
          {options.map((service) => {
            const checked = selected.includes(service);
            return (
              <button
                key={service}
                type="button"
                onClick={() => toggle(service)}
                className="w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-left hover:bg-muted/40"
              >
                <span>{service}</span>
                {checked ? <Check className="w-4 h-4 text-brandBlue" strokeWidth={2} /> : <span className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
