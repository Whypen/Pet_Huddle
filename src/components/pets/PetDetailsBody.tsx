/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { BellRing, CakeSlice, ChevronDown, Cpu, Pill, Stethoscope, Weight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import { InsetDivider } from "@/components/ui/InsetPanel";

export type PetDetailReminder = {
  reason: string;
  customReason?: string | null;
  reminderDate: string;
};

export type PetDetailVisit = {
  reason: string;
  customReason?: string | null;
  visitDate: string;
  vaccine?: string | null;
};

export type PetDetailMedication = {
  name: string;
  dose_amount: number | null;
  dose_unit: string | null;
  frequency_value: number | null;
  frequency_unit: string | null;
  dosage?: string | null;
  frequency?: string | null;
};

export type PetDetailsBodyData = {
  dob?: string | null;
  weight?: string | number | null;
  weightUnit?: string | null;
  microchipId?: string | null;
  bio?: string | null;
  routine?: string | null;
  temperament?: string[] | null;
  reminder?: PetDetailReminder | null;
  vetVisits?: PetDetailVisit[] | null;
  medications?: PetDetailMedication[] | null;
  clinicName?: string | null;
  preferredVet?: string | null;
  phoneNo?: string | null;
};

export const toTitleCase = (value: string) =>
  value
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export const getSterilizedLabel = (gender: string | null | undefined) => {
  if (!gender) return "Sterilized";
  return gender.toLowerCase() === "female" ? "Spayed" : "Neutered";
};

export const formatBirthdayDisplay = (dob: string) => {
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const formatPetMedicationSummary = (medication: PetDetailMedication) => {
  const dose = medication.dose_amount != null && medication.dose_unit ? `${medication.dose_amount}${medication.dose_unit}` : medication.dosage || "";
  const frequency =
    medication.frequency_value != null && medication.frequency_unit
      ? `Every ${medication.frequency_value} ${medication.frequency_unit}`
      : medication.frequency || "";

  return [dose, frequency].filter(Boolean).join(" • ");
};

export function PetDetailsBody({
  data,
  className = "",
}: {
  data: PetDetailsBodyData;
  className?: string;
}) {
  const [showHealth, setShowHealth] = useState(false);
  const [showTempRoutine, setShowTempRoutine] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showAllVetVisits, setShowAllVetVisits] = useState(false);
  const [showAllMeds, setShowAllMeds] = useState(false);

  const hasHealthData =
    Boolean(data.reminder) ||
    Boolean(data.vetVisits && data.vetVisits.length > 0) ||
    Boolean(data.medications && data.medications.length > 0);
  const hasTempRoutine =
    Boolean(data.temperament && data.temperament.length > 0) ||
    Boolean(data.routine && data.routine.trim());
  const visibleVetVisits = showAllVetVisits ? data.vetVisits || [] : (data.vetVisits || []).slice(0, 3);
  const visibleMeds = showAllMeds ? data.medications || [] : (data.medications || []).slice(0, 3);
  const weightLabel = data.weight != null && String(data.weight).trim() ? `${data.weight} ${data.weightUnit || ""}`.trim() : "";

  return (
    <div className={cn("space-y-4", className)}>
      {(data.dob || weightLabel || data.microchipId) && (
        <div className="flex gap-3">
          {data.dob && (
            <div className="card-e1 flex flex-1 min-w-0 flex-col items-center rounded-xl p-3 text-center">
              <CakeSlice size={18} strokeWidth={1.75} className="mb-1.5 text-primary" />
              <p className="mb-1 text-[11px] leading-none text-[var(--text-tertiary)]">Birthday</p>
              <p className="text-[12px] font-[600] leading-tight text-[var(--text-primary)]">
                {formatBirthdayDisplay(data.dob)}
              </p>
            </div>
          )}
          {weightLabel && (
            <div className="card-e1 flex flex-1 min-w-0 flex-col items-center rounded-xl p-3 text-center">
              <Weight size={18} strokeWidth={1.75} className="mb-1.5 text-primary" />
              <p className="mb-1 text-[11px] leading-none text-[var(--text-tertiary)]">Weight</p>
              <p className="text-[12px] font-[600] leading-tight text-[var(--text-primary)]">{weightLabel}</p>
            </div>
          )}
          {data.microchipId && (
            <div className="card-e1 flex flex-1 min-w-0 flex-col items-center rounded-xl p-3 text-center">
              <Cpu size={18} strokeWidth={1.75} className="mb-1.5 text-primary" />
              <p className="mb-1 text-[11px] leading-none text-[var(--text-tertiary)]">Microchip</p>
              <p className="break-all text-[12px] font-[600] leading-tight text-[var(--text-primary)]">{data.microchipId}</p>
            </div>
          )}
        </div>
      )}

      {data.bio?.trim() && (
        <div className="card-e1 rounded-xl p-4">
          <p className={cn("text-[14px] leading-[1.55] text-[var(--text-secondary)]", !bioExpanded && "line-clamp-3")}>
            {data.bio}
          </p>
          {data.bio.length > 120 && (
            <NeuControl size="sm" variant="tertiary" className="mt-2 -ml-1" onClick={() => setBioExpanded((value) => !value)}>
              <ChevronDown
                size={14}
                strokeWidth={1.75}
                className={cn("mr-1 transition-transform", bioExpanded && "rotate-180")}
                aria-hidden
              />
              {bioExpanded ? "Show less" : "Show more"}
            </NeuControl>
          )}
        </div>
      )}

      {hasHealthData && (
        <div className="card-e1 overflow-hidden rounded-[22px]">
          <button
            type="button"
            onClick={() => setShowHealth((value) => !value)}
            className="flex h-[56px] w-full items-center gap-3 px-4"
            aria-expanded={showHealth}
          >
            <span className="flex-1 text-left text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
              Health
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className={cn("text-[var(--text-secondary)] transition-transform", showHealth && "rotate-180")}
            />
          </button>

          {showHealth && (
            <>
              <InsetDivider />
              <div className="flex items-start gap-3 px-4 py-3">
                <BellRing size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-[var(--text-secondary)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-[500] text-[var(--text-primary)]">
                    {data.reminder
                      ? data.reminder.reason === "Others"
                        ? data.reminder.customReason || "Reminder"
                        : data.reminder.reason
                      : "No reminder set"}
                  </p>
                  {data.reminder && <p className="text-[11px] text-[var(--text-tertiary)]">{data.reminder.reminderDate}</p>}
                </div>
              </div>

              <InsetDivider />
              {visibleVetVisits.length === 0 ? (
                <div className="px-4 py-3">
                  <p className="text-[13px] text-[var(--text-tertiary)]">No vet visit records.</p>
                </div>
              ) : (
                <>
                  {visibleVetVisits.map((record, idx) => (
                    <div key={`${record.visitDate}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                      <Stethoscope size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-[var(--text-secondary)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-[500] text-[var(--text-primary)]">
                          {record.reason === "Others" ? record.customReason || "Visit" : record.reason}
                          {record.vaccine ? ` · ${record.vaccine}` : ""}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{record.visitDate}</p>
                      </div>
                    </div>
                  ))}
                  {(data.vetVisits || []).length > 3 && (
                    <div className="px-4 pb-2">
                      <NeuControl size="sm" variant="tertiary" onClick={() => setShowAllVetVisits((value) => !value)}>
                        {showAllVetVisits ? "Show less" : `Show ${(data.vetVisits || []).length - 3} more`}
                      </NeuControl>
                    </div>
                  )}
                </>
              )}

              {(data.medications || []).length > 0 && (
                <>
                  <InsetDivider />
                  {visibleMeds.map((medication, idx) => (
                    <div key={`${medication.name}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                      <Pill size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-[var(--text-secondary)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-[500] text-[var(--text-primary)]">{medication.name}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{formatPetMedicationSummary(medication) || "Details pending"}</p>
                      </div>
                    </div>
                  ))}
                  {(data.medications || []).length > 3 && (
                    <div className="px-4 pb-2">
                      <NeuControl size="sm" variant="tertiary" onClick={() => setShowAllMeds((value) => !value)}>
                        {showAllMeds ? "Show less" : `Show ${(data.medications || []).length - 3} more`}
                      </NeuControl>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {hasTempRoutine && (
        <div className="card-e1 overflow-hidden rounded-[22px]">
          <button
            type="button"
            onClick={() => setShowTempRoutine((value) => !value)}
            className="flex h-[56px] w-full items-center gap-3 px-4"
            aria-expanded={showTempRoutine}
          >
            <span className="flex-1 text-left text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
              Temperament &amp; Routine
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className={cn("text-[var(--text-secondary)] transition-transform", showTempRoutine && "rotate-180")}
            />
          </button>

          {showTempRoutine && (
            <>
              <InsetDivider />
              {Boolean(data.temperament && data.temperament.length > 0) && (
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {(data.temperament || []).map((item) => (
                      <NeuChip key={item} as="span">{item}</NeuChip>
                    ))}
                  </div>
                </div>
              )}
              {Boolean(data.temperament && data.temperament.length > 0) && Boolean(data.routine?.trim()) && <InsetDivider />}
              {data.routine?.trim() && (
                <div className="px-4 py-3">
                  <p className="mb-2 text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                    Daily Routine
                  </p>
                  <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                    {data.routine}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {Boolean(data.clinicName || data.preferredVet || data.phoneNo) && (
        <div className="card-e1 rounded-[22px] p-4">
          <div className="space-y-2">
            {data.clinicName && (
              <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                <span className="font-[500] text-[var(--text-primary)]">Clinic:</span> {data.clinicName}
              </p>
            )}
            {data.preferredVet && (
              <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                <span className="font-[500] text-[var(--text-primary)]">Preferred vet:</span> {data.preferredVet}
              </p>
            )}
            {data.phoneNo && (
              <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                <span className="font-[500] text-[var(--text-primary)]">Phone:</span> {data.phoneNo}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
