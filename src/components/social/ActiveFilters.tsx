import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FilterState, defaultFilters } from "./FilterSheet";

interface ActiveFiltersProps {
  filters: FilterState;
  onRemove: (key: keyof FilterState, value?: string) => void;
}

export const ActiveFilters = ({ filters, onRemove }: ActiveFiltersProps) => {
  const activeFilterChips: { key: keyof FilterState; label: string; value?: string }[] = [];

  // Role (only if different from default)
  if (filters.role !== defaultFilters.role) {
    const roleLabels = { playdates: "Playdates", nannies: "Nannies", "animal-friends": "Animal Friends" };
    activeFilterChips.push({ key: "role", label: roleLabels[filters.role] });
  }

  // Species
  filters.species.forEach(species => {
    const speciesLabels: Record<string, string> = { dogs: "Dogs", cats: "Cats", people: "People Only" };
    activeFilterChips.push({ key: "species", label: speciesLabels[species], value: species });
  });

  // Distance (only if different from default)
  if (filters.distance !== defaultFilters.distance) {
    activeFilterChips.push({ key: "distance", label: `${filters.distance} mi` });
  }

  // Age range (only if different from default)
  if (filters.ageRange[0] !== defaultFilters.ageRange[0] || filters.ageRange[1] !== defaultFilters.ageRange[1]) {
    activeFilterChips.push({ key: "ageRange", label: `Age ${filters.ageRange[0]}-${filters.ageRange[1]}` });
  }

  // Gender
  if (filters.gender) {
    activeFilterChips.push({ key: "gender", label: filters.gender });
  }

  // Pet Height
  if (filters.petHeight) {
    activeFilterChips.push({ key: "petHeight", label: `${filters.petHeight} pets` });
  }

  if (activeFilterChips.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
      <AnimatePresence>
        {activeFilterChips.map((chip, index) => (
          <motion.button
            key={`${chip.key}-${chip.value || index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => onRemove(chip.key, chip.value)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-medium whitespace-nowrap"
          >
            {chip.label}
            <X className="w-3 h-3" />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};
