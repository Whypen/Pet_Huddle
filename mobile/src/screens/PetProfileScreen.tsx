import { useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { InputField } from "../components/InputField";
import { SelectField } from "../components/SelectField";
import { DateField } from "../components/DateField";
import { CTAButton } from "../components/CTAButton";
import { COLORS, LAYOUT } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";
import { yearsBetween } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";

const vaccineOptions = [
  { label: "Select", value: "Select" },
  { label: "Check-up", value: "Check-up" },
  { label: "Others", value: "Others" },
] as const;

const reminderOptions = [
  { label: "Check-up", value: "Check-up" },
  { label: "Vaccination", value: "Vaccination" },
  { label: "Neuter/Spay Surgery", value: "Neuter/Spay Surgery" },
  { label: "Dental Care", value: "Dental Care" },
  { label: "Others", value: "Others" },
] as const;

type VaccineType = (typeof vaccineOptions)[number]["value"];
type ReminderType = (typeof reminderOptions)[number]["value"];
type Neutered = "yes" | "no";

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    dob: z.date().optional(),
    neutered: z.enum(["yes", "no"]).optional(),
    vaccinationType: z.enum(vaccineOptions.map((o) => o.value) as [VaccineType, ...VaccineType[]]),
    vaccinationOther: z.string().optional(),
    vaccinationDate: z.date().nullable(),
    reminderType: z.enum(reminderOptions.map((o) => o.value) as [ReminderType, ...ReminderType[]]),
    reminderOther: z.string().optional(),
    reminderDate: z.date().nullable(),
  })
  .refine((d) => d.dob instanceof Date, { path: ["dob"], message: "DOB is required" });

type Form = z.input<typeof schema>;

export function PetProfileScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "PetProfile">>();
  const mode = route.params?.mode ?? "add";
  const { profile } = useAuth();

  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 40);
    return d;
  }, []);

  const {
    control,
    handleSubmit,
    watch,
    formState: { isValid },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: "",
      dob: undefined,
      neutered: "no" as Neutered,
      vaccinationType: "Select",
      vaccinationOther: "",
      vaccinationDate: null,
      reminderType: "Vaccination",
      reminderOther: "",
      reminderDate: null,
    },
  });

  const dob = watch("dob");
  const age = dob ? yearsBetween(dob) : null;

  const onSubmit = handleSubmit(async (values) => {
    if (!profile?.id) {
      Alert.alert("Not signed in", "Please sign in first.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        owner_id: profile.id,
        name: values.name,
        dob: values.dob ? values.dob.toISOString().slice(0, 10) : null,
        neutered_spayed: values.neutered === "yes",
        next_vaccination_reminder: values.reminderDate ? values.reminderDate.toISOString().slice(0, 10) : null,
      };
      // If schema supports vaccination_dates, store a single last date as array.
      if (values.vaccinationDate) payload.vaccination_dates = [values.vaccinationDate.toISOString().slice(0, 10)];

      if (mode === "add") {
        const ins = await supabase.from("pets").insert(payload).select("id").maybeSingle();
        if (ins.error) throw ins.error;
        const petId = ins.data?.id;
        if (petId) {
          try {
            // UAT: Next Event must pull from reminders table.
            const kind = values.reminderType === "Others" ? (values.reminderOther || "Reminder") : values.reminderType;
            await supabase.from("reminders").delete().eq("pet_id", petId).eq("kind", kind);
            if (values.reminderDate) {
              await supabase.from("reminders").insert({
                owner_id: profile.id,
                pet_id: petId,
                kind,
                reason: "Vaccination/ Check-up Reminder",
                due_date: values.reminderDate.toISOString().slice(0, 10),
              });
            }
          } catch (e) {
            console.warn("[PetProfile] reminders sync failed", e);
          }
        }
      } else {
        // For edit mode we would need a pet id; for now treat as add-like.
        const ins = await supabase.from("pets").insert(payload).select("id").maybeSingle();
        if (ins.error) throw ins.error;
        const petId = ins.data?.id;
        if (petId) {
          try {
            const kind = values.reminderType === "Others" ? (values.reminderOther || "Reminder") : values.reminderType;
            await supabase.from("reminders").delete().eq("pet_id", petId).eq("kind", kind);
            if (values.reminderDate) {
              await supabase.from("reminders").insert({
                owner_id: profile.id,
                pet_id: petId,
                kind,
                reason: "Vaccination/ Check-up Reminder",
                due_date: values.reminderDate.toISOString().slice(0, 10),
              });
            }
          } catch (e) {
            console.warn("[PetProfile] reminders sync failed", e);
          }
        }
      }

      Alert.alert(mode === "add" ? "Pet added" : "Pet updated", "Saved to Supabase.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      Alert.alert("Save failed", msg);
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />
      <ScrollView contentContainerStyle={{ padding: LAYOUT.sectionPaddingH, gap: 12, paddingBottom: 24 }}>
        <HText variant="heading" style={{ fontSize: 16, fontWeight: "800" }}>
          {mode === "add" ? "Add Pet" : "Edit Pet Profile"}
        </HText>

        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField label="Pet Name" placeholder="Name" value={value} onChangeText={onChange} error={error?.message} />
          )}
        />

        <Controller
          control={control}
          name="dob"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <View style={{ gap: 6 }}>
              <DateField label="DOB" value={value ?? null} onChange={(d) => onChange(d ?? undefined)} maximumDate={maxDob} error={error?.message} />
              {value ? (
                <HText variant="meta" style={{ color: COLORS.brandSubtext }}>
                  Age: {age} {age === 1 ? "year" : "years"}
                </HText>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="neutered"
          render={({ field: { value, onChange } }) => (
            <SelectField<Neutered>
              label="Neutered/Spayed"
              value={(value ?? "no") as Neutered}
              options={[
                { label: "Yes", value: "yes" },
                { label: "No", value: "no" },
              ]}
              onChange={(v) => onChange(v)}
            />
          )}
        />

        <HText variant="heading" style={{ fontSize: 14, fontWeight: "800", marginTop: 4 }}>
          Vaccinations / Checkups
        </HText>

        <Controller
          control={control}
          name="vaccinationType"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <SelectField<VaccineType>
              label="Select Vaccines"
              value={value}
              options={vaccineOptions.map((o) => ({ label: o.label, value: o.value }))}
              onChange={(v) => onChange(v)}
              error={error?.message}
            />
          )}
        />

        {watch("vaccinationType") === "Others" ? (
          <Controller
            control={control}
            name="vaccinationOther"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <InputField label="Others" placeholder="Type vaccine name" value={value ?? ""} onChangeText={onChange} error={error?.message} />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="vaccinationDate"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <DateField
              label="Last Vaccination Date"
              value={value ?? null}
              onChange={(d) => onChange(d)}
              minimumDate={dob ?? undefined}
              error={error?.message}
              placeholder="Select date"
            />
          )}
        />

        <HText variant="heading" style={{ fontSize: 14, fontWeight: "800", marginTop: 4 }}>
          Vaccination/ Check-up Reminder
        </HText>

        <Controller
          control={control}
          name="reminderType"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <SelectField<ReminderType>
              label="Reminder"
              value={value}
              options={reminderOptions.map((o) => ({ label: o.label, value: o.value }))}
              onChange={(v) => onChange(v)}
              error={error?.message}
            />
          )}
        />

        {watch("reminderType") === "Others" ? (
          <Controller
            control={control}
            name="reminderOther"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <InputField label="Others" placeholder="Type reminder reason" value={value ?? ""} onChangeText={onChange} error={error?.message} />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="reminderDate"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <DateField label="Reminder Date" value={value ?? null} onChange={(d) => onChange(d)} minimumDate={dob ?? undefined} error={error?.message} />
          )}
        />

        <CTAButton
          title={mode === "add" ? "Save Pet" : "Save Changes"}
          disabled={!isValid}
          onPress={onSubmit}
          onInvalidPress={() => Alert.alert("Fix required fields", "Please correct the highlighted fields.")}
        />
      </ScrollView>
    </View>
  );
}
