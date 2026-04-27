import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LOCATION_STYLES_LIST } from "./carerServiceConstants";
import type { ServiceFilterState } from "./filterProviders";

interface ServiceFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ServiceFilterState;
  onApply: (next: ServiceFilterState) => void;
}

const PET_TYPES = [
  "Dogs",
  "Cats",
  "Rabbits",
  "Birds",
  "Hamsters / Guinea Pigs",
  "Reptiles",
  "Fish",
  "Small pets",
  "Others",
];

const DOG_SIZES = ["Small", "Medium", "Large", "Giant"];

function toggleMulti(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  return [...list, value];
}

interface MultiSelectDropdownFieldProps {
  label: string;
  placeholder: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}

function MultiSelectDropdownField({
  label,
  placeholder,
  options,
  value,
  onChange,
}: MultiSelectDropdownFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-brandText">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {value.length > 0 ? value.join(", ") : placeholder}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[4350] w-[min(360px,calc(100vw-40px))] p-2 rounded-[14px] border border-brandText/10 bg-white"
        >
          <div className="max-h-[220px] overflow-y-auto pr-1">
            {options.map((option) => {
              const checked = value.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange(toggleMulti(value, option))}
                  className="w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-left hover:bg-muted/40"
                >
                  <span>{option}</span>
                  {checked ? <Check className="w-4 h-4 text-brandBlue" strokeWidth={2} /> : <span className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ServiceFilterSheet({ isOpen, onClose, filters, onApply }: ServiceFilterSheetProps) {
  const [draft, setDraft] = useState<ServiceFilterState>(filters);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(filters);
  }, [filters, isOpen]);

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
      className="pb-4 [--huddle-sheet-bottom-padding:16px] huddle-sheet-bottom-padding"
      contentClassName="pb-2 overflow-x-visible"
    >
      <div className="space-y-4 pb-2 pr-1">
        <div className="grid grid-cols-1 gap-3 pl-1">
          <NeuToggle
            checked={draft.bookmarkedOnly}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, bookmarkedOnly: checked }))}
            label="Bookmark"
            className="shadow-none data-[state=checked]:shadow-none [&>span]:shadow-none"
          />
          <NeuToggle
            checked={draft.verifiedLicensedOnly}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, verifiedLicensedOnly: checked }))}
            label="Certified/ Licensed"
            className="shadow-none data-[state=checked]:shadow-none [&>span]:shadow-none"
          />
          <NeuToggle
            checked={draft.emergencyReadyOnly}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, emergencyReadyOnly: checked }))}
            label="Emergency Ready"
            className="shadow-none data-[state=checked]:shadow-none [&>span]:shadow-none"
          />
        </div>

        <MultiSelectDropdownField
          label="Pet type"
          placeholder="Select pet types"
          options={PET_TYPES}
          value={draft.petTypes}
          onChange={(petTypes) => setDraft((prev) => ({ ...prev, petTypes }))}
        />

        <MultiSelectDropdownField
          label="Dog size"
          placeholder="Select dog sizes"
          options={DOG_SIZES}
          value={draft.dogSizes}
          onChange={(dogSizes) => setDraft((prev) => ({ ...prev, dogSizes }))}
        />

        <MultiSelectDropdownField
          label="Service location"
          placeholder="Select service locations"
          options={LOCATION_STYLES_LIST}
          value={draft.locationStyles}
          onChange={(locationStyles) => setDraft((prev) => ({ ...prev, locationStyles }))}
        />

        <div className="flex gap-2 pt-1">
          <NeuControl
            variant="secondary"
            size="md"
            fullWidth
            onClick={() =>
              setDraft((prev) => ({
                ...prev,
                bookmarkedOnly: false,
                verifiedLicensedOnly: false,
                emergencyReadyOnly: false,
                petTypes: [],
                dogSizes: [],
                locationStyles: [],
              }))
            }
          >
            Reset
          </NeuControl>
          <NeuControl
            variant="primary"
            size="md"
            fullWidth
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </NeuControl>
        </div>
      </div>
    </GlassSheet>
  );
}
