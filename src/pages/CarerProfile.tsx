import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/layouts/PageHeader";
import { NeuControl } from "@/components/ui/NeuControl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Save } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";

// ── Constants ────────────────────────────────────────────────────────────────

const SKILLS_GROUP_A = [
  "Passionate newbie",
  "Professional pet-carer",
  "Professional veterinarian",
  "Professional groomer",
  "Behaviorist / Trainer",
  "Medical support",
  "Special-needs care",
  "Rescue / Shelter volunteer",
  "Experienced foster parent",
  "Transport to vet",
  "Emergency / Life support",
] as const;

const SKILLS_GROUP_B = [
  "Licensed veterinarian",
  "Certified groomer",
  "Certified behaviorist / trainer",
  "Pet first-aid / CPR certified",
  "Certified pet-carer",
] as const;

const ALL_SKILLS = [...SKILLS_GROUP_A, ...SKILLS_GROUP_B];
const MAX_SKILLS = 6;

const PROOF_CONFIG: Record<string, {
  fields: { key: string; label: string; placeholder: string }[];
  fallback: string;
  errorCopy: string;
}> = {
  "Licensed veterinarian": {
    fields: [
      { key: "country", label: "Country / region", placeholder: "e.g. Hong Kong" },
      { key: "clinic", label: "Clinic name", placeholder: "e.g. Happy Paws Clinic" },
      { key: "license", label: "License number", placeholder: "e.g. VET-12345" },
    ],
    fallback: "Professional veterinarian",
    errorCopy: "We couldn't find a matching vet license record. We saved this as Professional veterinarian instead.",
  },
  "Certified groomer": {
    fields: [
      { key: "certNumber", label: "Certification number", placeholder: "" },
      { key: "school", label: "School / academy", placeholder: "" },
    ],
    fallback: "Professional groomer",
    errorCopy: "Proof not completed. We saved this as Professional groomer instead.",
  },
  "Certified behaviorist / trainer": {
    fields: [
      { key: "certNumber", label: "Certification number", placeholder: "" },
      { key: "program", label: "Program / issuer", placeholder: "" },
    ],
    fallback: "Behaviorist / Trainer",
    errorCopy: "Proof not completed. We saved this as Behaviorist / Trainer instead.",
  },
  "Pet first-aid / CPR certified": {
    fields: [
      { key: "course", label: "Course name", placeholder: "" },
      { key: "certNumber", label: "Certificate number", placeholder: "" },
    ],
    fallback: "Medical support",
    errorCopy: "Proof not completed. We saved this as Medical support instead.",
  },
  "Certified pet-carer": {
    fields: [
      { key: "org", label: "Certification / organization name", placeholder: "" },
      { key: "number", label: "Certificate / membership / license number", placeholder: "" },
    ],
    fallback: "Professional pet-carer",
    errorCopy: "Proof not completed. We saved this as Professional pet-carer instead.",
  },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const TIME_BLOCKS = ["Full-day", "Overnight", "Other"] as const;
const LOCATION_STYLES = [
  "Flexible",
  "At owner's place",
  "At my place",
  "Meet-up / outdoor",
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = "view" | "edit";

interface CarerProfileData {
  story: string;
  skills: string[];
  proofMetadata: Record<string, Record<string, string>>;
  vetLicenseFound: boolean | null;
  days: string[];
  timeBlocks: string[];
  otherTimeFrom: string;
  otherTimeTo: string;
  emergencyReadiness: boolean | null;
  minNoticeValue: string;
  minNoticeUnit: "hours" | "days";
  locationStyles: string[];
  specifyArea: boolean;
  areaName: string;
  areaLat: number | null;
  areaLng: number | null;
}

const EMPTY: CarerProfileData = {
  story: "",
  skills: [],
  proofMetadata: {},
  vetLicenseFound: null,
  days: [],
  timeBlocks: [],
  otherTimeFrom: "",
  otherTimeTo: "",
  emergencyReadiness: null,
  minNoticeValue: "",
  minNoticeUnit: "hours",
  locationStyles: [],
  specifyArea: false,
  areaName: "",
  areaLat: null,
  areaLng: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapRowToForm(row: Record<string, unknown>): CarerProfileData {
  return {
    story: String(row.story ?? ""),
    skills: (row.skills as string[]) ?? [],
    proofMetadata: (row.proof_metadata as Record<string, Record<string, string>>) ?? {},
    vetLicenseFound: (row.vet_license_found as boolean | null) ?? null,
    days: (row.days as string[]) ?? [],
    timeBlocks: (row.time_blocks as string[]) ?? [],
    otherTimeFrom: String(row.other_time_from ?? ""),
    otherTimeTo: String(row.other_time_to ?? ""),
    emergencyReadiness: (row.emergency_readiness as boolean | null) ?? null,
    minNoticeValue: row.min_notice_value != null ? String(row.min_notice_value) : "",
    minNoticeUnit: (row.min_notice_unit as "hours" | "days") ?? "hours",
    locationStyles: (row.location_styles as string[]) ?? [],
    specifyArea: Boolean(row.specify_area),
    areaName: String(row.area_name ?? ""),
    areaLat: (row.area_lat as number | null) ?? null,
    areaLng: (row.area_lng as number | null) ?? null,
  };
}

function toggleItem<T extends string>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
}

// ── Component ─────────────────────────────────────────────────────────────────

const CarerProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>("view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CarerProfileData>(EMPTY);

  // Skills UI state
  const [skillQuery, setSkillQuery] = useState("");
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);

  // Proof dialog state
  const [proofTarget, setProofTarget] = useState<string | null>(null);
  const [proofFields, setProofFields] = useState<Record<string, string>>({});
  const [proofLoading, setProofLoading] = useState(false);

  // Area search state
  const [areaQuery, setAreaQuery] = useState("");
  const [areaSuggestions, setAreaSuggestions] = useState<
    Array<{ label: string; lat: number; lng: number }>
  >([]);
  const [areaSuggestionsOpen, setAreaSuggestionsOpen] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("pet_care_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const loaded = mapRowToForm(data as Record<string, unknown>);
        setFormData(loaded);
        setAreaQuery(loaded.areaName);
        setMode("view");
      } else {
        // New user — default to Passionate newbie, open in edit
        setFormData({ ...EMPTY, skills: ["Passionate newbie"] });
        setMode("edit");
      }
      setLoading(false);
    })();
  }, [user]);

  // ── Area search debounce ──────────────────────────────────────────────────
  useEffect(() => {
    if (!formData.specifyArea || !areaQuery.trim() || areaQuery.trim().length < 2) {
      setAreaSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          areaQuery.trim()
        )}.json?autocomplete=true&limit=5&language=en&types=place,locality,neighborhood,district&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const res = await fetch(url);
        const json = (await res.json()) as {
          features: Array<{ place_name: string; center: [number, number] }>;
        };
        setAreaSuggestions(
          (json.features ?? []).map((f) => ({
            label: f.place_name,
            lat: f.center[1],
            lng: f.center[0],
          }))
        );
        setAreaSuggestionsOpen(true);
      } catch {
        /* ignore */
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [areaQuery, formData.specifyArea]);

  // ── Completion flag ───────────────────────────────────────────────────────
  const computeCompleted = (d: CarerProfileData): boolean =>
    d.story.trim().length > 0 &&
    d.skills.length > 0 &&
    d.days.length > 0 &&
    d.timeBlocks.length > 0 &&
    d.emergencyReadiness !== null &&
    d.minNoticeValue.trim() !== "" &&
    d.locationStyles.length > 0;

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;

    if (formData.timeBlocks.includes("Other")) {
      if (!formData.otherTimeFrom || !formData.otherTimeTo) {
        toast.error("Please set both From and To times for Other.");
        return;
      }
      if (formData.otherTimeTo <= formData.otherTimeFrom) {
        toast.error("End time must be after start time.");
        return;
      }
    }

    const noticeVal = parseInt(formData.minNoticeValue, 10);
    if (formData.minNoticeValue.trim() !== "" && (isNaN(noticeVal) || noticeVal < 0)) {
      toast.error("Minimum notice must be a positive number.");
      return;
    }
    if (!isNaN(noticeVal) && formData.minNoticeUnit === "hours" && noticeVal > 24) {
      toast.error("Hours cannot exceed 24.");
      return;
    }
    if (!isNaN(noticeVal) && formData.minNoticeUnit === "days" && noticeVal > 99) {
      toast.error("Days cannot exceed 99.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("pet_care_profiles").upsert(
        {
          user_id: user.id,
          story: formData.story.trim(),
          skills: formData.skills,
          proof_metadata: formData.proofMetadata,
          vet_license_found: formData.vetLicenseFound,
          days: formData.days,
          time_blocks: formData.timeBlocks,
          other_time_from: formData.timeBlocks.includes("Other") ? formData.otherTimeFrom : null,
          other_time_to: formData.timeBlocks.includes("Other") ? formData.otherTimeTo : null,
          emergency_readiness: formData.emergencyReadiness,
          min_notice_value: formData.minNoticeValue.trim() !== "" ? noticeVal : null,
          min_notice_unit: formData.minNoticeUnit,
          location_styles: formData.locationStyles,
          specify_area: formData.specifyArea,
          area_name: formData.specifyArea ? formData.areaName : null,
          area_lat: formData.specifyArea ? formData.areaLat : null,
          area_lng: formData.specifyArea ? formData.areaLng : null,
          completed: computeCompleted(formData),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setMode("view");
      toast.success("Pet-Care Profile saved.");
    } catch (err) {
      console.error("[CarerProfile.save_failed]", err);
      toast.error("Couldn't save profile. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  // ── Skills helpers ────────────────────────────────────────────────────────
  const toggleSkill = (skill: string) => {
    const isGroupB = (SKILLS_GROUP_B as readonly string[]).includes(skill);
    const alreadySelected = formData.skills.includes(skill);

    if (alreadySelected) {
      setFormData((prev) => ({ ...prev, skills: prev.skills.filter((s) => s !== skill) }));
      return;
    }
    if (formData.skills.length >= MAX_SKILLS) {
      toast.error("Maximum 6 skills selected.");
      return;
    }
    if (isGroupB) {
      setProofTarget(skill);
      setProofFields({});
      return;
    }
    setFormData((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
  };

  const handleProofSubmit = async () => {
    if (!proofTarget) return;
    const config = PROOF_CONFIG[proofTarget];
    const allFilled = config.fields.every((f) => proofFields[f.key]?.trim());
    if (!allFilled) {
      toast.error("Please fill all required fields.");
      return;
    }

    setProofLoading(true);
    try {
      let finalSkill = proofTarget;
      let vetFound: boolean | null = null;

      if (proofTarget === "Licensed veterinarian") {
        // TODO: wire real vet registry lookup when source is defined in repo/config
        vetFound = false;
        finalSkill = config.fallback;
        toast.error(config.errorCopy);
      }

      const newSkills = formData.skills.includes(finalSkill)
        ? formData.skills
        : [...formData.skills, finalSkill].slice(0, MAX_SKILLS);

      setFormData((prev) => ({
        ...prev,
        skills: newSkills,
        proofMetadata: { ...prev.proofMetadata, [proofTarget]: proofFields },
        vetLicenseFound: proofTarget === "Licensed veterinarian" ? vetFound : prev.vetLicenseFound,
      }));
    } finally {
      setProofLoading(false);
      setProofTarget(null);
      setProofFields({});
    }
  };

  const handleProofDismiss = () => {
    if (!proofTarget) return;
    const config = PROOF_CONFIG[proofTarget];
    const fallback = config.fallback;
    if (!formData.skills.includes(fallback) && formData.skills.length < MAX_SKILLS) {
      setFormData((prev) => ({ ...prev, skills: [...prev.skills, fallback] }));
      toast.error(config.errorCopy);
    }
    setProofTarget(null);
    setProofFields({});
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 w-full max-w-full flex flex-col">
      <PageHeader
        title={<h1 className="text-base font-semibold text-[#424965] truncate">Pet-Care Profile</h1>}
        titleClassName="justify-start"
        showBack
        onBack={() => navigate(-1)}
      />

      {/* View / Edit tab bar */}
      <div className="flex border-b border-border px-4">
        {(["view", "edit"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "h-9 flex-1 text-sm font-medium capitalize transition-colors border-b-2 -mb-px focus:outline-none",
              mode === m
                ? "text-brandText border-[rgba(66,73,101,0.22)]"
                : "text-muted-foreground border-transparent"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="pt-4 px-4 space-y-6 max-w-md mx-auto"
          style={{
            paddingBottom: mode === "edit"
              ? "calc(var(--nav-height, 64px) + env(safe-area-inset-bottom) + 80px)"
              : "calc(var(--nav-height, 64px) + env(safe-area-inset-bottom) + 20px)",
          }}
        >

          {/* ── Section 1: Pet-Carer Story ─────────────────────────────────── */}
          {mode === "edit" ? (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
                Pet-Carer Story
              </label>
              <div className="form-field-rest relative h-auto min-h-[96px] py-3">
                <textarea
                  value={formData.story}
                  onChange={(e) => setFormData((prev) => ({ ...prev, story: e.target.value }))}
                  placeholder="Introduce yourself and how you care for pets."
                  className="field-input-core min-h-[72px] resize-none rounded-none border-0 bg-transparent px-0 py-0 shadow-none outline-none focus-visible:ring-0"
                />
              </div>
            </div>
          ) : formData.story.trim() ? (
            <div className="space-y-1">
              <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Pet-Carer Story
              </p>
              <p className="text-[15px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {formData.story}
              </p>
            </div>
          ) : null}

          {/* ── Section 2: Skills & Credentials ───────────────────────────── */}
          {mode === "edit" ? (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
                Skills & Credentials
                <span className="ml-1.5 text-[11px] font-normal text-[var(--text-tertiary)]">
                  {formData.skills.length}/{MAX_SKILLS}
                </span>
              </label>

              {/* Selected chips */}
              {formData.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formData.skills.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSkill(s)}
                      className="neu-chip flex items-center gap-1 text-[13px]"
                    >
                      {s}
                      <span aria-label="remove" className="ml-0.5 opacity-60">×</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Searchable dropdown */}
              {formData.skills.length < MAX_SKILLS && (
                <div className="relative">
                  <div className="form-field-rest relative flex items-center">
                    <input
                      value={skillQuery}
                      onChange={(e) => {
                        setSkillQuery(e.target.value);
                        setSkillDropdownOpen(true);
                      }}
                      onFocus={() => setSkillDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSkillDropdownOpen(false), 150)}
                      placeholder="Search skills..."
                      className="field-input-core"
                    />
                  </div>
                  {skillDropdownOpen && (
                    <div className="absolute top-[calc(100%+4px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-lg max-h-56 overflow-y-auto">
                      {ALL_SKILLS.filter(
                        (s) =>
                          s.toLowerCase().includes(skillQuery.toLowerCase()) &&
                          !formData.skills.includes(s)
                      ).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            toggleSkill(s);
                            setSkillQuery("");
                            setSkillDropdownOpen(false);
                          }}
                          className="w-full px-3 py-2.5 text-left text-[14px] hover:bg-muted flex items-center justify-between"
                        >
                          <span>{s}</span>
                          {(SKILLS_GROUP_B as readonly string[]).includes(s) && (
                            <span className="text-[11px] text-[var(--text-tertiary)]">Proof needed</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : formData.skills.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Skills & Credentials
              </p>
              <div className="flex flex-wrap gap-1.5">
                {formData.skills.map((s) => (
                  <span key={s} className="neu-chip text-[13px]">{s}</span>
                ))}
              </div>
              {formData.vetLicenseFound && (
                <p className="text-[13px] text-[var(--text-tertiary)] pl-0.5">
                  Vet license record found
                </p>
              )}
            </div>
          ) : null}

          {/* ── Section 3: Availability ────────────────────────────────────── */}
          {mode === "edit" ? (
            <div className="space-y-4">
              <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Availability
              </p>

              {/* Days */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, days: toggleItem(prev.days, d) }))
                      }
                      className={cn(
                        "neu-chip text-[13px] transition-colors",
                        formData.days.includes(d)
                          ? "bg-brandBlue text-white border-brandBlue"
                          : "text-[var(--text-secondary)]"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Blocks */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">Time</label>
                <div className="flex flex-wrap gap-2">
                  {TIME_BLOCKS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          timeBlocks: toggleItem(prev.timeBlocks, t),
                          ...(t === "Other" && prev.timeBlocks.includes("Other")
                            ? { otherTimeFrom: "", otherTimeTo: "" }
                            : {}),
                        }))
                      }
                      className={cn(
                        "neu-chip text-[13px] transition-colors",
                        formData.timeBlocks.includes(t)
                          ? "bg-brandBlue text-white border-brandBlue"
                          : "text-[var(--text-secondary)]"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {formData.timeBlocks.includes("Other") && (
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-[12px] text-[var(--text-tertiary)] pl-1">From</label>
                      <div className="form-field-rest relative flex items-center">
                        <input
                          type="time"
                          value={formData.otherTimeFrom}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, otherTimeFrom: e.target.value }))
                          }
                          className="field-input-core"
                        />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[12px] text-[var(--text-tertiary)] pl-1">To</label>
                      <div className="form-field-rest relative flex items-center">
                        <input
                          type="time"
                          value={formData.otherTimeTo}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, otherTimeTo: e.target.value }))
                          }
                          className="field-input-core"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Emergency Readiness */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
                  Emergency Readiness
                </label>
                <div className="flex gap-2">
                  {(["Yes", "No"] as const).map((opt) => (
                    <NeuControl
                      key={opt}
                      size="sm"
                      variant={
                        (opt === "Yes" && formData.emergencyReadiness === true) ||
                        (opt === "No" && formData.emergencyReadiness === false)
                          ? "primary"
                          : "tertiary"
                      }
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          emergencyReadiness: opt === "Yes",
                        }))
                      }
                      className="flex-1"
                    >
                      {opt}
                    </NeuControl>
                  ))}
                </div>
              </div>

              {/* Minimum Notice */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
                  Minimum Notice
                </label>
                <div className="flex gap-2">
                  <div className="form-field-rest relative flex items-center flex-1">
                    <input
                      type="number"
                      min={0}
                      value={formData.minNoticeValue}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, minNoticeValue: e.target.value }))
                      }
                      placeholder="0"
                      className="field-input-core"
                    />
                  </div>
                  <div className="form-field-rest relative flex items-center w-[100px]">
                    <select
                      value={formData.minNoticeUnit}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          minNoticeUnit: e.target.value as "hours" | "days",
                          minNoticeValue: "",
                        }))
                      }
                      className="field-input-core bg-transparent w-full"
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (formData.days.length > 0 || formData.timeBlocks.length > 0) ? (
            <div className="space-y-3">
              <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Availability
              </p>
              {formData.days.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formData.days.map((d) => (
                    <span key={d} className="neu-chip text-[13px]">{d}</span>
                  ))}
                </div>
              )}
              {formData.timeBlocks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formData.timeBlocks.map((t) => (
                    <span key={t} className="neu-chip text-[13px]">
                      {t === "Other" && formData.otherTimeFrom && formData.otherTimeTo
                        ? `${formData.otherTimeFrom} – ${formData.otherTimeTo}`
                        : t}
                    </span>
                  ))}
                </div>
              )}
              {formData.emergencyReadiness !== null && (
                <p className="text-[14px] text-[var(--text-secondary)]">
                  Emergency ready: {formData.emergencyReadiness ? "Yes" : "No"}
                </p>
              )}
              {formData.minNoticeValue && (
                <p className="text-[14px] text-[var(--text-secondary)]">
                  Minimum notice: {formData.minNoticeValue} {formData.minNoticeUnit}
                </p>
              )}
            </div>
          ) : null}

          {/* ── Section 4: Service Location ────────────────────────────────── */}
          {mode === "edit" ? (
            <div className="space-y-4">
              <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Service Location
              </p>

              {/* Location Style */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
                  Location Style
                </label>
                <div className="flex flex-wrap gap-2">
                  {LOCATION_STYLES.map((ls) => (
                    <button
                      key={ls}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          locationStyles: toggleItem(prev.locationStyles, ls),
                        }))
                      }
                      className={cn(
                        "neu-chip text-[13px] transition-colors",
                        formData.locationStyles.includes(ls)
                          ? "bg-brandBlue text-white border-brandBlue"
                          : "text-[var(--text-secondary)]"
                      )}
                    >
                      {ls}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specify Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Specify Area
                  </label>
                  <div className="flex gap-2">
                    {(["Yes", "No"] as const).map((opt) => (
                      <NeuControl
                        key={opt}
                        size="sm"
                        variant={
                          (opt === "Yes" && formData.specifyArea) ||
                          (opt === "No" && !formData.specifyArea)
                            ? "primary"
                            : "tertiary"
                        }
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            specifyArea: opt === "Yes",
                            areaName: opt === "No" ? "" : prev.areaName,
                            areaLat: opt === "No" ? null : prev.areaLat,
                            areaLng: opt === "No" ? null : prev.areaLng,
                          }))
                        }
                      >
                        {opt}
                      </NeuControl>
                    ))}
                  </div>
                </div>

                {formData.specifyArea && (
                  <div className="relative">
                    <div className="form-field-rest relative flex items-center">
                      <input
                        value={areaQuery}
                        onChange={(e) => {
                          setAreaQuery(e.target.value);
                          setFormData((prev) => ({
                            ...prev,
                            areaName: "",
                            areaLat: null,
                            areaLng: null,
                          }));
                        }}
                        onBlur={() => setTimeout(() => setAreaSuggestionsOpen(false), 150)}
                        placeholder="Search area (neighbourhood, district...)"
                        className="field-input-core"
                      />
                    </div>
                    {areaSuggestionsOpen && areaSuggestions.length > 0 && (
                      <div className="absolute top-[calc(100%+4px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-lg max-h-56 overflow-y-auto">
                        {areaSuggestions.map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormData((prev) => ({
                                ...prev,
                                areaName: s.label,
                                areaLat: s.lat,
                                areaLng: s.lng,
                              }));
                              setAreaQuery(s.label);
                              setAreaSuggestionsOpen(false);
                            }}
                            className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : formData.locationStyles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Service Location
              </p>
              <div className="flex flex-wrap gap-1.5">
                {formData.locationStyles.map((ls) => (
                  <span key={ls} className="neu-chip text-[13px]">{ls}</span>
                ))}
              </div>
              {formData.specifyArea && formData.areaName && (
                <p className="text-[14px] text-[var(--text-secondary)]">{formData.areaName}</p>
              )}
            </div>
          ) : null}

        </div>
      </div>

      {/* ── Sticky Save button (edit mode only) ─────────────────────────────── */}
      {mode === "edit" && (
        <div
          className="sticky bottom-0 left-0 right-0 px-4 py-3 bg-background border-t border-border/20"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <NeuControl
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                <Save size={18} />
                Save Profile
              </span>
            )}
          </NeuControl>
        </div>
      )}

      {/* ── Proof Dialog ──────────────────────────────────────────────────────── */}
      {proofTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) handleProofDismiss(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{proofTarget}</DialogTitle>
              <DialogDescription>
                Please provide the following to verify your credential.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {PROOF_CONFIG[proofTarget].fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
                    {f.label}
                  </label>
                  <div className="form-field-rest relative flex items-center">
                    <input
                      value={proofFields[f.key] ?? ""}
                      onChange={(e) =>
                        setProofFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                      placeholder={f.placeholder}
                      className="field-input-core"
                    />
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="!flex-row gap-2 pt-2">
              <NeuControl
                variant="tertiary"
                size="sm"
                className="flex-1"
                onClick={handleProofDismiss}
              >
                Cancel
              </NeuControl>
              <NeuControl
                variant="primary"
                size="sm"
                className="flex-1"
                disabled={proofLoading}
                onClick={handleProofSubmit}
              >
                {proofLoading ? <Loader2 size={14} className="animate-spin" /> : "Submit"}
              </NeuControl>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default CarerProfile;
