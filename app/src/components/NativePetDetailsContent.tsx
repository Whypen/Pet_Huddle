import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { nativeFreshImageKey, nativeFreshImageUri, nativeMutableImageVersion } from "../lib/nativeImageFreshness";
import { NativePetImage } from "./NativePetImage";
import {
  huddleColors,
  huddleFormFields,
  huddleImageDefaults,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

export type VetVisitRecord = {
  reason: string;
  customReason?: string | null;
  visitDate: string;
  vaccine?: string | null;
};

export type SetReminder = {
  reason: string;
  customReason?: string | null;
  reminderDate: string;
};

export type MedicationRecord = {
  name: string;
  dose_amount: number | null;
  dose_unit: string | null;
  frequency_value: number | null;
  frequency_unit: string | null;
  dosage?: string | null;
  frequency?: string | null;
};

export type NativePetDetailsData = {
  id: string;
  owner_id: string | null;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  neutered_spayed: boolean;
  dob: string | null;
  age_years?: number | null;
  weight: number | string | null;
  weight_unit: string;
  bio: string | null;
  routine: string | null;
  vet_contact: string | null;
  microchip_id: string | null;
  temperament: string[] | null;
  vet_visit_records: VetVisitRecord[] | null;
  set_reminder: SetReminder | null;
  medications: MedicationRecord[] | null;
  photo_url: string | null;
  photo_presentation?: { home?: { centerX?: number; centerY?: number; widthPct?: number; sourceAspect?: number } } | null;
  is_active: boolean;
  updated_at?: string | null;
};

type HealthRow = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
};

type StatIcon =
  | { family?: "feather"; name: keyof typeof Feather.glyphMap }
  | { family: "material"; name: keyof typeof MaterialCommunityIcons.glyphMap };

type StatRow = {
  icon: StatIcon;
  label: string;
  value: string;
};

const formatDateOnly = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.slice(0, 10);
};

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const hasDisplayText = (value: unknown) => cleanText(value).length > 0;

const isPresent = <T,>(value: T | null): value is T => value !== null;

const toTitleCase = (value: string) =>
  value
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const getSterilizedLabel = (gender: string | null | undefined) => {
  if (!gender) return "Sterilized";
  return gender.toLowerCase() === "female" ? "Spayed" : "Neutered";
};

export const formatBirthdayDisplay = (dob: string | null) => {
  if (!dob) return "";
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const formatPetAge = (dob: string | null) => {
  if (!dob) return "";
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) return `${Math.max(months, 0)} mo`;
  if (months <= 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
};

export const parseLegacyVaccinations = (vaccinations: unknown, vaccinationDates: unknown): VetVisitRecord[] => {
  const out: VetVisitRecord[] = [];
  const dates = Array.isArray(vaccinationDates)
    ? vaccinationDates.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];

  if (!Array.isArray(vaccinations)) {
    return dates.map((visitDate) => ({ reason: "Vaccination", visitDate: formatDateOnly(visitDate) })).filter((row) => row.visitDate);
  }

  vaccinations.forEach((item, index) => {
    if (typeof item === "string") {
      const visitDate = formatDateOnly(dates[index] ?? "");
      if (visitDate) out.push({ reason: "Vaccination", vaccine: item, visitDate });
      return;
    }
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const visitDate = formatDateOnly(record.visitDate ?? record.date ?? dates[index] ?? "");
    if (!visitDate) return;
    out.push({
      reason: "Vaccination",
      vaccine: typeof record.vaccine === "string" ? record.vaccine : typeof record.name === "string" ? record.name : null,
      visitDate,
    });
  });

  return out;
};

export const parseReminder = (setReminder: unknown, legacyDate: unknown): SetReminder | null => {
  const normalize = (raw: Record<string, unknown>): SetReminder | null => {
    const reminderDate = formatDateOnly(raw.reminderDate);
    if (!reminderDate) return null;
    return {
      reason: typeof raw.reason === "string" ? raw.reason : "Vaccination",
      customReason: typeof raw.customReason === "string" ? raw.customReason : null,
      reminderDate,
    };
  };

  if (Array.isArray(setReminder)) {
    const parsed = setReminder
      .map((row) => (row && typeof row === "object" ? normalize(row as Record<string, unknown>) : null))
      .filter((row): row is SetReminder => Boolean(row))
      .sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime());
    if (parsed.length > 0) return parsed[0];
  } else if (setReminder && typeof setReminder === "object") {
    const single = normalize(setReminder as Record<string, unknown>);
    if (single) return single;
  }

  const fallbackDate = formatDateOnly(legacyDate);
  return fallbackDate ? { reason: "Vaccination", reminderDate: fallbackDate, customReason: null } : null;
};

export const parseMedication = (item: unknown): MedicationRecord | null => {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  return {
    name,
    dose_amount: typeof raw.dose_amount === "number" ? raw.dose_amount : null,
    dose_unit: typeof raw.dose_unit === "string" ? raw.dose_unit : null,
    frequency_value: typeof raw.frequency_value === "number" ? raw.frequency_value : null,
    frequency_unit: typeof raw.frequency_unit === "string" ? raw.frequency_unit : null,
    dosage: typeof raw.dosage === "string" ? raw.dosage : null,
    frequency: typeof raw.frequency === "string" ? raw.frequency : null,
  };
};

export const formatMedicationSummary = (medication: MedicationRecord) => {
  const dose = medication.dose_amount != null && medication.dose_unit ? `${medication.dose_amount}${medication.dose_unit}` : medication.dosage || "";
  const frequency =
    medication.frequency_value != null && medication.frequency_unit
      ? `Every ${medication.frequency_value} ${medication.frequency_unit}`
      : medication.frequency || "";
  return [dose, frequency].filter(Boolean).join(" • ");
};

export const mapPetRow = (row: Record<string, unknown>): NativePetDetailsData => {
  const vetVisits = Array.isArray(row.vet_visit_records)
    ? (row.vet_visit_records as VetVisitRecord[])
    : parseLegacyVaccinations(row.vaccinations, row.vaccination_dates);
  const medications = Array.isArray(row.medications)
    ? (row.medications.map(parseMedication).filter(Boolean) as MedicationRecord[])
    : [];

  return {
    id: String(row.id || ""),
    owner_id: typeof row.owner_id === "string" ? row.owner_id : null,
    name: typeof row.name === "string" ? row.name : "",
    species: typeof row.species === "string" ? row.species : "",
    breed: typeof row.breed === "string" ? row.breed : null,
    gender: typeof row.gender === "string" ? row.gender : null,
    neutered_spayed: row.neutered_spayed === true,
    dob: typeof row.dob === "string" ? row.dob : null,
    age_years: typeof row.age_years === "number" && row.age_years >= 0 ? row.age_years : null,
    weight: typeof row.weight === "number" || typeof row.weight === "string" ? row.weight : null,
    weight_unit: typeof row.weight_unit === "string" ? row.weight_unit : "kg",
    bio: typeof row.bio === "string" ? row.bio : null,
    routine: typeof row.routine === "string" ? row.routine : null,
    vet_contact: typeof row.vet_contact === "string" ? row.vet_contact : null,
    microchip_id: typeof row.microchip_id === "string" ? row.microchip_id : null,
    temperament: Array.isArray(row.temperament) ? row.temperament.filter((entry): entry is string => typeof entry === "string") : null,
    vet_visit_records: vetVisits,
	    set_reminder: parseReminder(row.set_reminder, row.next_vaccination_reminder),
	    medications,
	    photo_url: typeof row.photo_url === "string" ? row.photo_url : null,
	    photo_presentation: row.photo_presentation && typeof row.photo_presentation === "object" ? row.photo_presentation as NativePetDetailsData["photo_presentation"] : null,
	    is_active: row.is_active !== false,
	    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
	  };
	};

type NativePetDetailsContentProps = {
  pet: NativePetDetailsData;
  onPetCardPress?: () => void;
};

export function NativePetDetailsContent({ pet, onPetCardPress }: NativePetDetailsContentProps) {
  const [healthOpen, setHealthOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);

  const display = useMemo(() => {
    const species = toTitleCase(pet.species) || "Species";
    const breed = pet.breed?.trim() || "";
    const genderLine = [pet.gender, pet.neutered_spayed ? getSterilizedLabel(pet.gender) : null].filter(Boolean).join("  ·  ");
    const age = pet.dob ? formatPetAge(pet.dob) : (typeof pet.age_years === "number" && pet.age_years >= 0 ? `${pet.age_years} yr` : "");
    const weight = pet.weight != null && String(pet.weight).trim() ? `${pet.weight} ${pet.weight_unit || ""}`.trim() : "";
    return { species, breed, genderLine, age, weight };
  }, [pet]);

  const statRows: StatRow[] = [
    pet.dob ? { icon: { name: "gift" as const }, label: "Birthday", value: formatBirthdayDisplay(pet.dob) } : null,
    display.weight ? { icon: { family: "material" as const, name: "scale-bathroom" as const }, label: "Weight", value: display.weight } : null,
    hasDisplayText(pet.microchip_id) ? { icon: { name: "cpu" as const }, label: "Microchip", value: cleanText(pet.microchip_id) } : null,
  ].filter(isPresent).filter((row) => hasDisplayText(row.value));

  const reminderTitle = pet.set_reminder
    ? cleanText(pet.set_reminder.reason === "Others" ? pet.set_reminder.customReason : pet.set_reminder.reason)
    : "";
  const reminderDate = cleanText(pet.set_reminder?.reminderDate);
  const reminderRows: HealthRow[] = reminderTitle && reminderDate
    ? [{ icon: "bell" as const, title: reminderTitle, subtitle: reminderDate }]
    : [];
  const visitRows: HealthRow[] = (pet.vet_visit_records || [])
    .map((record) => {
      const reason = cleanText(record.reason === "Others" ? record.customReason : record.reason);
      const vaccine = cleanText(record.vaccine);
      const title = [reason, vaccine].filter(Boolean).join(" · ");
      const subtitle = cleanText(record.visitDate);
      return title && subtitle ? ({ icon: "activity" as const, title, subtitle } satisfies HealthRow) : null;
    })
    .filter(isPresent)
    .slice(0, 3);
  const medicationRows: HealthRow[] = (pet.medications || [])
    .map((medication) => {
      const title = cleanText(medication.name);
      const subtitle = cleanText(formatMedicationSummary(medication));
      return title && subtitle ? ({ icon: "plus-circle" as const, title, subtitle } satisfies HealthRow) : null;
    })
    .filter(isPresent)
    .slice(0, 3);
  const healthRows = [...reminderRows, ...visitRows, ...medicationRows];
  const temperament = (pet.temperament || []).filter(hasDisplayText);
  const routine = cleanText(pet.routine);
  const badgeCard = (
    <>
      <View style={styles.badgeSlot} />
      <View style={styles.photoFrame}>
        {pet.photo_url ? (
          (() => {
            const photoVersion = nativeMutableImageVersion(pet.photo_url, pet.updated_at);
            return (
	          <NativePetImage
	            accessibilityIgnoresInvertColors
	            contentFit="cover"
	            cachePolicy={huddleImageDefaults.cachePolicy}
	            key={nativeFreshImageKey(pet.photo_url, photoVersion)}
	            transition={huddleImageDefaults.transition}
	            uri={nativeFreshImageUri(pet.photo_url, photoVersion)}
	            style={styles.petImage}
	          />
            );
          })()
        ) : (
          <View style={styles.photoFallback}>
            <Feather color={huddleColors.mutedText} name="camera" size={34} />
          </View>
        )}
      </View>
      <View style={styles.sleeveDivider} />
      <View style={styles.identityBlock}>
        <Text numberOfLines={1} style={styles.petName}>{pet.name}</Text>
        <Text numberOfLines={1} style={styles.petMeta}>{[display.species, display.breed].filter(Boolean).join(" · ")}</Text>
        {display.genderLine ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.petSubmeta}>{display.genderLine}</Text> : null}
        {display.age ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.petSubmeta}>{display.age}</Text> : null}
        <Text style={styles.petIdLabel}>PET ID</Text>
      </View>
    </>
  );

  return (
    <>
      {onPetCardPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${pet.name}`} onPress={onPetCardPress} style={styles.badgeCard}>
          {badgeCard}
        </Pressable>
      ) : (
        <View style={styles.badgeCard}>{badgeCard}</View>
      )}

      {statRows.length > 0 ? (
        <View style={styles.quickStats}>
          {statRows.map((row) => (
            <StatCard key={row.label} icon={row.icon} label={row.label} value={row.value} />
          ))}
        </View>
      ) : null}

      {pet.bio?.trim() ? (
        <View style={styles.card}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.bodyTextScroll}><Text style={styles.bodyText}>{pet.bio}</Text></ScrollView>
        </View>
      ) : null}

      {healthRows.length > 0 ? (
        <DisclosureCard
          icon="shield"
          open={healthOpen}
          title="Health"
          onPress={() => setHealthOpen((current) => !current)}
        >
          {healthRows.map((row, index) => (
            <View key={`${row.title}-${index}`} style={[styles.detailRow, index > 0 && styles.rowDivider]}>
              <Feather color={huddleColors.subtext} name={row.icon} size={17} />
              <View style={styles.detailCopy}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.detailTitle}>{row.title}</Text>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.detailSubtitle}>{row.subtitle}</Text>
              </View>
            </View>
          ))}
        </DisclosureCard>
      ) : null}

      {(temperament.length > 0 || routine) ? (
        <DisclosureCard
          icon="list"
          open={routineOpen}
          title="Temperament & Routine"
          onPress={() => setRoutineOpen((current) => !current)}
        >
          {temperament.length > 0 ? (
            <View style={styles.chipWrap}>
              {temperament.map((item) => (
                <View key={item} style={styles.chip}>
                  <Text style={styles.chipText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {routine ? (
            <View style={temperament.length > 0 ? styles.routineWithDivider : null}>
              <Text style={styles.sectionMiniLabel}>Daily Routine</Text>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.bodyTextScroll}><Text style={styles.bodyText}>{routine}</Text></ScrollView>
            </View>
          ) : null}
        </DisclosureCard>
      ) : null}

      {pet.vet_contact?.trim() ? (
        <View style={styles.card}>
          <Text style={styles.sectionMiniLabel}>Vet contact</Text>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.bodyTextScroll}><Text style={styles.bodyText}>{pet.vet_contact}</Text></ScrollView>
        </View>
      ) : null}
    </>
  );
}

function StatCard({ icon, label, value }: { icon: StatIcon; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      {icon.family === "material" ? (
        <MaterialCommunityIcons color={huddleColors.blue} name={icon.name} size={20} />
      ) : (
        <Feather color={huddleColors.blue} name={icon.name} size={18} />
      )}
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function DisclosureCard({
  children,
  icon,
  onPress,
  open,
  title,
}: {
  children: React.ReactNode;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  open: boolean;
  title: string;
}) {
  return (
    <View style={styles.disclosureCard}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={styles.disclosureHeader}>
        <Feather color={huddleColors.subtext} name={icon} size={17} />
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.disclosureTitle}>{title}</Text>
        <Feather color={huddleColors.subtext} name={open ? "chevron-up" : "chevron-down"} size={18} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeCard: {
    width: "100%",
    aspectRatio: 5 / 8,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(176, 190, 220, 0.68)",
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  badgeSlot: {
    position: "absolute",
    top: 12,
    left: "36%",
    right: "36%",
    zIndex: 2,
    height: 11,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: "rgba(140, 155, 190, 0.45)",
    backgroundColor: huddleColors.canvas,
  },
  photoFrame: {
    flex: 1,
    overflow: "hidden",
  },
  petImage: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(237, 237, 250, 0.7)",
  },
  sleeveDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(176, 190, 220, 0.45)",
  },
  identityBlock: {
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x4,
  },
  petName: {
    width: "100%",
    fontFamily: "Urbanist-700",
    fontSize: 24,
    lineHeight: 29,
    color: huddleColors.text,
    textAlign: "center",
  },
  petMeta: {
    width: "100%",
    marginTop: 5,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 21,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  petSubmeta: {
    marginTop: 5,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  petIdLabel: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: 13,
    letterSpacing: 1.8,
    color: "rgba(66, 73, 101, 0.32)",
  },
  quickStats: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x4,
  },
  statCard: {
    flex: 1,
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.card,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.04)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  statLabel: {
    marginTop: 6,
    fontFamily: "Urbanist-500",
    fontSize: 11,
    lineHeight: 14,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  statValue: {
    marginTop: 3,
    fontFamily: "Urbanist-700",
    fontSize: 12,
    lineHeight: 15,
    color: huddleColors.text,
    textAlign: "center",
  },
  card: {
    marginTop: huddleSpacing.x4,
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.04)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  bodyText: {
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 21,
    color: huddleColors.subtext,
  },
  bodyTextScroll: {
    maxHeight: huddleFormFields.multilineHeight,
  },
  disclosureCard: {
    marginTop: huddleSpacing.x4,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.04)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  disclosureHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
  },
  disclosureTitle: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.66,
    color: huddleColors.subtext,
    textTransform: "uppercase",
  },
  disclosureBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(66, 73, 101, 0.08)",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(66, 73, 101, 0.08)",
  },
  detailCopy: {
    flex: 1,
  },
  detailTitle: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  detailSubtitle: {
    marginTop: 2,
    fontFamily: "Urbanist-400",
    fontSize: 11,
    lineHeight: 15,
    color: huddleColors.mutedText,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
    padding: huddleSpacing.x4,
  },
  chip: {
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 7,
    backgroundColor: "rgba(33, 69, 207, 0.08)",
  },
  chipText: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 15,
    color: huddleColors.blue,
  },
  routineWithDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(66, 73, 101, 0.08)",
    padding: huddleSpacing.x4,
  },
  sectionMiniLabel: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.66,
    color: huddleColors.mutedText,
    textTransform: "uppercase",
  },
});
