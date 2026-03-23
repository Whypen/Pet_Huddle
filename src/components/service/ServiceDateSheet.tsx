import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { NeuControl } from "@/components/ui/NeuControl";
import { DAY_SHORT_MAP } from "./carerServiceConstants";

interface ServiceDateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDates: string[];
  onApply: (selectedDates: string[], selectedWeekdays: string[]) => void;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ServiceDateSheet({
  isOpen,
  onClose,
  selectedDates,
  onApply,
}: ServiceDateSheetProps) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [draftDates, setDraftDates] = useState<string[]>(selectedDates);
  const weekdayByIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 8 }, (_, index) => currentYear - 2 + index);

  useEffect(() => {
    if (!isOpen) return;
    setDraftDates(selectedDates);
  }, [isOpen, selectedDates]);

  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthIndex = monthDate.getMonth();
  const yearValue = monthDate.getFullYear();

  const calendarDays = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startPadding = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ key: string; iso: string | null; label: string }> = [];
    for (let i = 0; i < startPadding; i += 1) {
      cells.push({ key: `pad-${i}`, iso: null, label: "" });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = toIsoDate(new Date(year, month, day));
      cells.push({ key: iso, iso, label: String(day) });
    }
    return cells;
  }, [monthDate]);

  const toggleDate = (iso: string) => {
    const date = new Date(`${iso}T00:00:00`);
    if (date < today) return;
    setDraftDates((prev) => (prev.includes(iso) ? prev.filter((item) => item !== iso) : [...prev, iso]));
  };

  const handleApply = () => {
    const weekdays = Array.from(
      new Set(
        draftDates
          .map((iso) => {
            const date = new Date(`${iso}T00:00:00`);
            const dayShort = weekdayByIndex[date.getDay()];
            const dayLong = date.toLocaleDateString("en-US", { weekday: "long" });
            return dayShort ?? DAY_SHORT_MAP[dayLong] ?? "";
          })
          .filter(Boolean),
      ),
    );
    onApply(draftDates, weekdays);
    onClose();
  };

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Service date"
      className="pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+30px)]"
      contentClassName="overflow-x-visible"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center text-[var(--text-tertiary)] shrink-0"
            onClick={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              value={monthIndex}
              onChange={(event) =>
                setMonthDate((prev) => new Date(prev.getFullYear(), Number(event.target.value), 1))
              }
              className="form-field-rest !h-9 !rounded-[18px] px-3 pr-9 text-sm min-w-0 flex-1"
              aria-label="Select month"
            >
              {Array.from({ length: 12 }, (_, month) => (
                <option key={month} value={month}>
                  {new Date(2000, month, 1).toLocaleDateString("en-US", { month: "long" })}
                </option>
              ))}
            </select>
            <select
              value={yearValue}
              onChange={(event) =>
                setMonthDate((prev) => new Date(Number(event.target.value), prev.getMonth(), 1))
              }
              className="form-field-rest !h-9 !rounded-[18px] px-3 pr-9 text-sm w-[34%] min-w-[108px] shrink-0"
              aria-label="Select year"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center text-[var(--text-tertiary)] shrink-0"
            onClick={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground -mt-2">{monthLabel}</p>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((cell) => {
            if (!cell.iso) return <div key={cell.key} className="h-9" />;
            const date = new Date(`${cell.iso}T00:00:00`);
            const isPast = date < today;
            const isToday = date.getTime() === today.getTime();
            const selected = draftDates.includes(cell.iso);
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => toggleDate(cell.iso!)}
                disabled={isPast}
                className={selected
                  ? "h-9 rounded-full bg-brandBlue text-white text-sm font-semibold"
                  : `h-9 rounded-full text-sm font-medium ${
                      isPast
                        ? "bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                        : isToday
                          ? "bg-muted/50 text-brandBlue font-semibold"
                          : "bg-muted/50 text-brandText"
                    }`}
              >
                {cell.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <NeuControl
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => setDraftDates([])}
          >
            Clear
          </NeuControl>
          <NeuControl variant="primary" size="md" fullWidth onClick={handleApply}>
            Apply
          </NeuControl>
        </div>
      </div>
    </GlassSheet>
  );
}
