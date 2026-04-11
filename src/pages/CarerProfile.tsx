import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Award, Car, Check, CheckCircle2, ChevronDown,
  Clock, Dog, Cat, DollarSign, Loader2, MapPin, PawPrint, Pencil, Plus,
  Rabbit, Save, Stethoscope, Sun, X, Zap
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
import carerPlaceholderImg from "@/assets/Profile Placeholder.png";
import { WalletOnboardingModal } from "@/components/wallet/WalletOnboardingModal";

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
  errorCopy: string;
}> = {
  "Licensed veterinarian": {
    fields: [
      { key: "country", label: "Country / region", placeholder: "e.g. Hong Kong" },
      { key: "clinic", label: "Clinic name", placeholder: "e.g. Happy Paws Clinic" },
      { key: "license", label: "License number", placeholder: "e.g. VET-12345" },
    ],
    errorCopy: "We couldn't verify this license. The skill was not added.",
  },
  "Certified groomer": {
    fields: [
      { key: "certNumber", label: "Certification number", placeholder: "" },
      { key: "school", label: "School / academy", placeholder: "" },
    ],
    errorCopy: "Proof not completed. The skill was not added.",
  },
  "Certified behaviorist / trainer": {
    fields: [
      { key: "certNumber", label: "Certification number", placeholder: "" },
      { key: "program", label: "Program / issuer", placeholder: "" },
    ],
    errorCopy: "Proof not completed. The skill was not added.",
  },
  "Pet first-aid / CPR certified": {
    fields: [
      { key: "course", label: "Course name", placeholder: "" },
      { key: "certNumber", label: "Certificate number", placeholder: "" },
    ],
    errorCopy: "Proof not completed. The skill was not added.",
  },
  "Certified pet-carer": {
    fields: [
      { key: "org", label: "Certification / organization name", placeholder: "" },
      { key: "number", label: "Certificate / membership / license number", placeholder: "" },
    ],
    errorCopy: "Proof not completed. The skill was not added.",
  },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const LOCATION_STYLES = [
  "Flexible",
  "At owner's place",
  "At my place",
  "Meet-up / outdoor",
] as const;

const SERVICES_OFFERED = [
  "Boarding", "Walking", "Day Care", "Drop-in", "Grooming",
  "Training", "Vet / Licensed Care", "Transport", "Emergency Help", "Others",
] as const;

const PET_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  "Dogs": Dog, "Cats": Cat, "Rabbits": Rabbit,
};

const PET_TYPES = [
  "Dogs", "Cats", "Rabbits", "Birds", "Hamsters / Guinea Pigs",
  "Reptiles", "Fish", "Small pets", "Others",
] as const;

const DOG_SIZES = ["Small", "Medium", "Large", "Giant"] as const;

const CURRENCIES = ["USD", "HKD", "GBP", "EUR", "AUD", "SGD", "CAD", "JPY"] as const;

const RATE_OPTIONS = ["Per hour", "Per day", "Per session", "Per night"] as const;

const AGREEMENT_VERSION = "1.0";

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = "view" | "edit";

interface RateRow { price: string; rate: string; services: string[]; }

function serializeRateRow(r: RateRow): string { return JSON.stringify(r); }
function deserializeRateRow(s: string): RateRow {
  try {
    const p = JSON.parse(s);
    if (typeof p.price === "string" && typeof p.rate === "string")
      return { price: p.price, rate: p.rate, services: Array.isArray(p.services) ? p.services : [] };
  } catch (_e) { /* not JSON — treat as legacy rate string */ }
  return { price: "", rate: s, services: [] };
}

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
  areaName: string;
  servicesOffered: string[];
  servicesOther: string;
  petTypes: string[];
  petTypesOther: string;
  dogSizes: string[];
  currency: string;
  rateRows: RateRow[];
  stripePayoutStatus: "pending" | "needs_action" | "complete" | null;
  stripeAccountId: string;
  stripeDetailsSubmitted: boolean;
  stripePayoutsEnabled: boolean;
  stripeRequirementsCurrentlyDue: string[];
  hasStripeAccount: boolean;
  agreementAccepted: boolean;
  agreementAcceptedAt: string | null;
  listed: boolean;
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
  areaName: "",
  servicesOffered: [],
  servicesOther: "",
  petTypes: [],
  petTypesOther: "",
  dogSizes: [],
  currency: "",
  rateRows: [{ price: "", rate: "", services: [] }],
  stripePayoutStatus: null,
  stripeAccountId: "",
  stripeDetailsSubmitted: false,
  stripePayoutsEnabled: false,
  stripeRequirementsCurrentlyDue: [],
  hasStripeAccount: false,
  agreementAccepted: false,
  agreementAcceptedAt: null,
  listed: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapRowToForm(row: Record<string, unknown>): CarerProfileData {
  const dbRates = (row.rates as string[]) ?? [];
  const firstPrice = row.starting_price != null ? String(row.starting_price) : "";
  let rateRows: RateRow[];
  if (dbRates.length === 0) {
    rateRows = [{ price: firstPrice, rate: "", services: (row.services_offered as string[]) ?? [] }];
  } else {
    rateRows = dbRates.map((r, i) => {
      const deserialized = deserializeRateRow(r);
      // first row: use DB starting_price if deserialized price is empty
      if (i === 0 && deserialized.price === "") deserialized.price = firstPrice;
      // backward compat: if services not in serialized data, put all services in first row
      if (deserialized.services.length === 0 && i === 0)
        deserialized.services = (row.services_offered as string[]) ?? [];
      return deserialized;
    });
  }
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
    areaName: String(row.area_name ?? ""),
    servicesOffered: (row.services_offered as string[]) ?? [],
    servicesOther: String(row.services_other ?? ""),
    petTypes: (row.pet_types as string[]) ?? [],
    petTypesOther: String(row.pet_types_other ?? ""),
    dogSizes: (row.dog_sizes as string[]) ?? [],
    currency: String(row.currency ?? ""),
    rateRows,
    stripePayoutStatus: (row.stripe_payout_status as "pending" | "needs_action" | "complete" | null) ?? null,
    stripeAccountId: String(row.stripe_account_id ?? ""),
    stripeDetailsSubmitted: Boolean(row.stripe_details_submitted ?? false),
    stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled ?? false),
    stripeRequirementsCurrentlyDue: (row.stripe_requirements_currently_due as string[]) ?? [],
    hasStripeAccount: Boolean(row.stripe_account_id),
    agreementAccepted: Boolean(row.agreement_accepted ?? false),
    agreementAcceptedAt: row.agreement_accepted_at ? String(row.agreement_accepted_at) : null,
    listed: Boolean(row.listed ?? false),
  };
}

function toggleItem<T extends string>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
}

// ── Completion check ──────────────────────────────────────────────────────────

function computeCompleted(d: CarerProfileData): boolean {
  if (!d.story.trim()) return false;

  const hasValidSkill = d.skills.some((skill) => {
    if ((SKILLS_GROUP_B as readonly string[]).includes(skill)) {
      if (skill === "Licensed veterinarian") return d.vetLicenseFound === true;
      const meta = d.proofMetadata[skill];
      if (!meta) return false;
      return PROOF_CONFIG[skill]?.fields.every((f) => meta[f.key]?.trim()) ?? false;
    }
    return true;
  });
  if (!hasValidSkill) return false;

  if (d.servicesOffered.length === 0) return false;
  if (d.petTypes.length === 0) return false;

  if (d.days.length === 0) return false;
  const timeOk =
    d.timeBlocks.includes("Anytime") ||
    (d.timeBlocks.includes("Specify") &&
      d.otherTimeFrom.trim() !== "" && d.otherTimeTo.trim() !== "");
  if (!timeOk) return false;
  const noticeVal = parseInt(d.minNoticeValue, 10);
  if (d.minNoticeValue.trim() === "" || isNaN(noticeVal) || noticeVal < 0) return false;

  const firstRow = d.rateRows[0];
  const priceVal = parseFloat(firstRow?.price ?? "");
  if (!firstRow?.price?.trim() || isNaN(priceVal) || priceVal < 0) return false;
  if (!d.currency) return false;
  if (!firstRow?.rate) return false;

  if (d.locationStyles.length === 0) return false;
  const needsArea = d.locationStyles.some(
    (ls) => ls === "At my place" || ls === "Meet-up / outdoor"
  );
  if (needsArea && !d.areaName.trim()) return false;

  if (d.emergencyReadiness === null) return false;

  return true;
}

// ── Wallet UI state ───────────────────────────────────────────────────────────
// Derived from DB truth (boolean fields + currently_due), never from optimistic state.
// "review"    = details submitted, no remaining requirements, Stripe still enabling payouts
// "incomplete"= has account but requirements still blocking (reopen onboarding)
// "none"      = no account yet (first-time Set Wallet)
// "connected" = payouts_enabled = true
type WalletUIState = "none" | "incomplete" | "review" | "connected";

function deriveWalletState(
  accountId: string,
  detailsSubmitted: boolean,
  payoutsEnabled: boolean,
  currentlyDue: string[],
): WalletUIState {
  if (!accountId) return "none";
  if (payoutsEnabled) return "connected";
  // Only "review" when details are fully submitted AND no requirements are blocking.
  // If requirements are still due/actionable → keep as "incomplete" → reopen onboarding.
  if (detailsSubmitted && currentlyDue.length === 0) return "review";
  return "incomplete";
}

function computeListingEligible(d: CarerProfileData): boolean {
  return (
    computeCompleted(d) &&
    d.stripePayoutsEnabled === true &&
    d.agreementAccepted
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const CarerProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // ── Provider-level eligibility (age + verification) ───────────────────────
  // These checks run at component level so they gate every save path and the
  // listing toggle. Age is derived from profile.dob — same logic as GlobalHeader.
  const dob = (profile as Record<string, unknown> | null)?.dob as string | null ?? null;
  const isAge18Plus = dob
    ? (() => {
        const birth = new Date(dob);
        const now = new Date();
        const age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        return age > 18 || (age === 18 && (m > 0 || (m === 0 && now.getDate() >= birth.getDate())));
      })()
    : false;
  const isVerified = profile?.is_verified === true;
  // providerEligible gates the listed flag on every save path.
  // computeListingEligible() still handles profile completeness + Stripe + agreement.
  const providerEligible = isAge18Plus && isVerified;

  const [mode, setMode] = useState<Mode>("view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CarerProfileData>(EMPTY);
  const [showWalletModal, setShowWalletModal] = useState(false);
  // Debounced silent account creation guards
  const initialSkillsRef = useRef<string[] | null>(null);
  const silentConnectTimerRef = useRef<number | null>(null);
  const silentConnectFiredRef = useRef(false);

  const readFunctionHttpErrorMessage = async (err: unknown): Promise<string | null> => {
    try {
      const context = (err as { context?: Response } | null | undefined)?.context;
      if (!context || typeof context.clone !== "function") return null;
      const payload = await context.clone().json() as { error?: string; detail?: string; code?: string; type?: string };
      const primary = payload?.error?.trim() || "";
      const detail = payload?.detail?.trim() || "";
      const code = payload?.code?.trim() || "";
      if (primary && detail && detail !== primary) return `${primary} (${detail}${code ? ` • ${code}` : ""})`;
      if (primary && code) return `${primary} (${code})`;
      if (primary) return primary;
      if (detail && code) return `${detail} (${code})`;
      if (detail) return detail;
      if (code) return code;
      return null;
    } catch {
      return null;
    }
  };

  // Dropdown open state (one open at a time)
  const [openDrop, setOpenDrop] = useState<"skills" | "days" | "location" | "services" | "pets" | "dogSizes" | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Proof dialog state
  const [proofTarget, setProofTarget] = useState<string | null>(null);
  const [proofFields, setProofFields] = useState<Record<string, string>>({});
  const [proofLoading, setProofLoading] = useState(false);

  // Hero carousel + about expand state
  const [albumUrls, setAlbumUrls] = useState<string[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const heroScrollRef = useRef<HTMLDivElement>(null);

  // Services & Rates inline editor state
  const [srEditIdx, setSrEditIdx] = useState<number | null>(null);
  const [listingAttempted, setListingAttempted] = useState(false);
  const [srDraft, setSrDraft] = useState<{ services: string[]; price: string; rate: string }>({ services: [], price: "", rate: "" });
  const [srDropOpen, setSrDropOpen] = useState(false);


  useEffect(() => {
    const raw = (profile?.social_album ?? []) as string[];
    if (!raw.length) { setAlbumUrls([]); return; }
    const canonical = canonicalizeSocialAlbumEntries(raw);
    void resolveSocialAlbumUrlList(canonical).then(setAlbumUrls);
  }, [profile?.social_album]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) {
        setOpenDrop(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        setFormData(mapRowToForm(data as Record<string, unknown>));
        setMode("view");
      } else {
        setFormData({ ...EMPTY });
        setMode("edit");
      }
      setLoading(false);
    })();
  }, [user]);

  // ── Silent background Stripe account creation ─────────────────────────────
  // Fires once when user NEWLY adds the first provider skill in this edit session.
  // Does NOT fire from skills that were already saved before the page loaded.
  // 2-second debounce; cancelled if skills drop back to zero before timer fires.
  useEffect(() => {
    if (loading) return; // Wait for initial data load

    // Capture baseline skills once — set only after load completes
    if (initialSkillsRef.current === null) {
      initialSkillsRef.current = [...formData.skills];
      return; // Don't fire on initial capture
    }

    if (silentConnectFiredRef.current) return;
    if (!user) return;
    if (formData.hasStripeAccount) return; // Account already exists

    // Only proceed if user added a skill not present when the page loaded
    const hasNewSkill = formData.skills.some((s) => !initialSkillsRef.current!.includes(s));
    if (!hasNewSkill || formData.skills.length === 0) return;

    const timer = window.setTimeout(() => {
      silentConnectFiredRef.current = true;
      void invokeAuthedFunction("create-or-get-stripe-account", { body: {} }).catch(() => {
        silentConnectFiredRef.current = false; // Allow retry if request failed
      });
    }, 2000);

    // Cancel debounce if skills change again within the 2s window
    return () => window.clearTimeout(timer);
  }, [loading, formData.skills, formData.hasStripeAccount, user]);

  // ── Supabase Realtime — wallet state sync ─────────────────────────────────
  // Subscribes to this user's pet_care_profiles row. Updates wallet fields in
  // local state whenever the webhook or refresh endpoint writes to DB.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`pet_care_profiles_wallet:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pet_care_profiles",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setFormData((prev) => ({
            ...prev,
            stripePayoutStatus: (row.stripe_payout_status as CarerProfileData["stripePayoutStatus"]) ?? prev.stripePayoutStatus,
            stripeAccountId: String(row.stripe_account_id ?? prev.stripeAccountId),
            stripeDetailsSubmitted: Boolean(row.stripe_details_submitted ?? prev.stripeDetailsSubmitted),
            stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled ?? prev.stripePayoutsEnabled),
            stripeRequirementsCurrentlyDue: (row.stripe_requirements_currently_due as string[]) ?? prev.stripeRequirementsCurrentlyDue,
            hasStripeAccount: Boolean(row.stripe_account_id ?? prev.stripeAccountId),
            listed: Boolean(row.listed ?? prev.listed),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;

    if (formData.timeBlocks.includes("Specify")) {
      if (!formData.otherTimeFrom || !formData.otherTimeTo) {
        toast.error("Please set both From and To times.");
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
          other_time_from: formData.timeBlocks.includes("Specify") ? formData.otherTimeFrom : null,
          other_time_to: formData.timeBlocks.includes("Specify") ? formData.otherTimeTo : null,
          emergency_readiness: formData.emergencyReadiness,
          min_notice_value: formData.minNoticeValue.trim() !== "" ? noticeVal : null,
          min_notice_unit: formData.minNoticeUnit,
          location_styles: formData.locationStyles,
          specify_area: formData.areaName.trim().length > 0,
          area_name: formData.areaName.trim() || null,
          area_lat: null,
          area_lng: null,
          services_offered: [...new Set(formData.rateRows.flatMap((r) => r.services))],
          services_other: formData.rateRows.some((r) => r.services.includes("Others"))
            ? formData.servicesOther.trim() || null
            : null,
          pet_types: formData.petTypes,
          pet_types_other: formData.petTypes.includes("Others") ? formData.petTypesOther.trim() || null : null,
          dog_sizes: formData.dogSizes,
          starting_price: formData.rateRows[0]?.price.trim() ? parseFloat(formData.rateRows[0].price) : null,
          currency: formData.currency || null,
          rates: formData.rateRows.map(serializeRateRow),
          agreement_accepted: formData.agreementAccepted,
          agreement_accepted_at: formData.agreementAccepted
            ? (formData.agreementAcceptedAt ?? new Date().toISOString())
            : null,
          agreement_version: formData.agreementAccepted ? AGREEMENT_VERSION : null,
          listed: computeListingEligible(formData) && providerEligible ? formData.listed : false,
          completed: computeCompleted(formData),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setMode("view");
      toast.success("Pet Carer Profile saved.");
      // Brevo CRM sync — fire-and-forget, never blocks the user flow
      void supabase.functions.invoke("brevo-sync", {
        body: { event: "service_profile_completed", user_id: user!.id },
      }).catch((err) => console.warn("[brevo-sync] service_profile_completed failed silently", err));
    } catch (err) {
      console.error("[CarerProfile.save_failed]", err);
      toast.error("Couldn't save profile. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  // ── Silent draft save (View tab) ─────────────────────────────────────────
  const silentSave = async (data: CarerProfileData) => {
    if (!user) return;
    const noticeVal = parseInt(data.minNoticeValue, 10);
    try {
      await supabase.from("pet_care_profiles").upsert(
        {
          user_id: user.id,
          story: data.story.trim(),
          skills: data.skills,
          proof_metadata: data.proofMetadata,
          vet_license_found: data.vetLicenseFound,
          days: data.days,
          time_blocks: data.timeBlocks,
          other_time_from: data.timeBlocks.includes("Specify") ? data.otherTimeFrom : null,
          other_time_to: data.timeBlocks.includes("Specify") ? data.otherTimeTo : null,
          emergency_readiness: data.emergencyReadiness,
          min_notice_value: !isNaN(noticeVal) && noticeVal >= 0 ? noticeVal : null,
          min_notice_unit: data.minNoticeUnit,
          location_styles: data.locationStyles,
          specify_area: data.areaName.trim().length > 0,
          area_name: data.areaName.trim() || null,
          area_lat: null,
          area_lng: null,
          services_offered: [...new Set(data.rateRows.flatMap((r) => r.services))],
          services_other: data.rateRows.some((r) => r.services.includes("Others")) ? data.servicesOther.trim() || null : null,
          pet_types: data.petTypes,
          pet_types_other: data.petTypes.includes("Others") ? data.petTypesOther.trim() || null : null,
          dog_sizes: data.dogSizes,
          starting_price: data.rateRows[0]?.price.trim() ? parseFloat(data.rateRows[0].price) : null,
          currency: data.currency || null,
          rates: data.rateRows.map(serializeRateRow),
          agreement_accepted: data.agreementAccepted,
          agreement_accepted_at: data.agreementAccepted ? (data.agreementAcceptedAt ?? new Date().toISOString()) : null,
          agreement_version: data.agreementAccepted ? AGREEMENT_VERSION : null,
          listed: computeListingEligible(data) && providerEligible ? data.listed : false,
          completed: computeCompleted(data),
        },
        { onConflict: "user_id" }
      );
    } catch (err) {
      console.warn("[CarerProfile.silentSave]", err);
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
      setOpenDrop(null);
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
      if (proofTarget === "Licensed veterinarian") {
        // Vet DB lookup — currently always returns false; do NOT add fallback
        toast.error(config.errorCopy);
        setProofTarget(null);
        setProofFields({});
        return;
      }

      // Certified skills: save proof metadata and add the skill
      const newSkills = formData.skills.includes(proofTarget)
        ? formData.skills
        : [...formData.skills, proofTarget].slice(0, MAX_SKILLS);

      setFormData((prev) => ({
        ...prev,
        skills: newSkills,
        proofMetadata: { ...prev.proofMetadata, [proofTarget]: proofFields },
      }));
      toast.success(`${proofTarget} added.`);
    } finally {
      setProofLoading(false);
      setProofTarget(null);
      setProofFields({});
    }
  };

  // Dismiss without adding anything
  const handleProofDismiss = () => {
    setProofTarget(null);
    setProofFields({});
  };

  // ── Wallet UI state (derived from DB truth) ───────────────────────────────
  const walletState = deriveWalletState(
    formData.stripeAccountId,
    formData.stripeDetailsSubmitted,
    formData.stripePayoutsEnabled,
    formData.stripeRequirementsCurrentlyDue,
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  // ── Under-18 hard gate ────────────────────────────────────────────────────
  // GlobalHeader hides the menu item for under-18 users, but direct URL
  // navigation must also be blocked. Redirect to home — no error toast needed.
  if (!isAge18Plus) {
    return <Navigate to="/" replace />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 bg-background flex flex-col overflow-hidden">
      <GlobalHeader />

      {/* Sub-header: back, title, save */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <NeuControl
          size="icon-md"
          variant="tertiary"
          onClick={() => navigate("/settings", { replace: true })}
          aria-label="Back"
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        </NeuControl>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">Pet Carer Profile</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Customize how you offer trusted support</p>
        </div>
        {mode === "edit" ? (
          <NeuControl
            size="icon-md"
            variant="tertiary"
            onClick={handleSave}
            disabled={saving}
            aria-label="Save"
          >
            {saving
              ? <Loader2 size={20} strokeWidth={1.75} className="animate-spin" aria-hidden />
              : <Save size={20} strokeWidth={1.75} aria-hidden />
            }
          </NeuControl>
        ) : <span className="inline-block w-10" aria-hidden />}
      </header>

      {/* Edit / View tabs */}
      <div className="px-4 pt-2">
        <div className="grid grid-cols-2 border-b border-border">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "h-9 text-sm font-medium transition-colors border-b-2 -mb-px focus:outline-none",
              mode === "edit" ? "text-brandText border-[rgba(66,73,101,0.22)]" : "text-muted-foreground border-transparent"
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { void silentSave(formData); setMode("view"); }}
            className={cn(
              "h-9 text-sm font-medium transition-colors border-b-2 -mb-px focus:outline-none",
              mode === "view" ? "text-brandText border-[rgba(66,73,101,0.22)]" : "text-muted-foreground border-transparent"
            )}
          >
            View
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="pt-4 px-4 space-y-6 max-w-md mx-auto"
          style={{
            paddingBottom: "calc(var(--nav-height, 64px) + env(safe-area-inset-bottom) + 20px)",
          }}
        >

          {/* ── EDIT MODE ───────────────────────────────────────────────────── */}
          {mode === "edit" && (
            <>
              {/* Section 1: Pet-Carer Story */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pet-Carer Story</h3>
                <div className="form-field-rest relative h-auto min-h-[96px] py-3">
                  <textarea
                    value={formData.story}
                    onChange={(e) => setFormData((prev) => ({ ...prev, story: e.target.value }))}
                    placeholder="Introduce yourself and how you care for pets"
                    className="field-input-core min-h-[72px] resize-none rounded-none border-0 bg-transparent px-0 py-0 shadow-none outline-none focus-visible:ring-0"
                  />
                </div>
              </div>

              {/* Section 2: Skills & Credentials */}
              <div className="space-y-4" ref={openDrop === "skills" ? dropRef : undefined}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  Skills
                  <span className="normal-case text-xs font-normal text-muted-foreground">
                    {formData.skills.length}/{MAX_SKILLS}
                  </span>
                </h3>
                <div className="space-y-2">
                  {/* Selected skills chips */}
                  {formData.skills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.skills.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-muted text-brandText border border-border/40"
                        >
                          {s}
                          <button
                            type="button"
                            onClick={() => toggleSkill(s)}
                            className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                            aria-label={`Remove ${s}`}
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Multi-select dropdown */}
                  {formData.skills.length < MAX_SKILLS && (
                    <div className="relative" ref={openDrop === "skills" ? undefined : dropRef}>
                      <button
                        type="button"
                        onClick={() => setOpenDrop(openDrop === "skills" ? null : "skills")}
                        className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                      >
                        <span className="text-muted-foreground truncate">
                          {formData.skills.length === 0 ? "Select skills" : "Add another skill"}
                        </span>
                        <ChevronDown
                          size={16}
                          strokeWidth={1.75}
                          className={cn("text-muted-foreground shrink-0 transition-transform", openDrop === "skills" && "rotate-180")}
                        />
                      </button>
                      {openDrop === "skills" && (
                        <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                          {ALL_SKILLS.filter((s) => !formData.skills.includes(s)).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => { toggleSkill(s); if (!(SKILLS_GROUP_B as readonly string[]).includes(s)) setOpenDrop(null); }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                            >
                              <span>{s}</span>
                              {(SKILLS_GROUP_B as readonly string[]).includes(s) && (
                                <span className="text-xs text-muted-foreground shrink-0 ml-2">Proof needed</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 3+6: Services & Rates (combined) ─────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Services & Rates</h3>
                  {srEditIdx === null && (
                    <button
                      type="button"
                      onClick={() => {
                        const newIdx = formData.rateRows.length;
                        setFormData((prev) => ({
                          ...prev,
                          rateRows: [...prev.rateRows, { price: "", rate: "", services: [] }],
                        }));
                        setSrEditIdx(newIdx);
                        setSrDraft({ services: [], price: "", rate: "" });
                        setSrDropOpen(false);
                      }}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                    >
                      <Plus size={16} strokeWidth={2} className="text-brandBlue" />
                    </button>
                  )}
                </div>
                {formData.rateRows.map((row, idx) => {
                  const isEditing = srEditIdx === idx;
                  const svcLabel = row.services.length > 0
                    ? row.services.map((s) => s === "Others" && formData.servicesOther ? formData.servicesOther : s).join(", ")
                    : "No service selected";
                  const priceLabel = row.price && row.rate
                    ? `${formData.currency} ${row.price} / ${row.rate.toLowerCase()}`
                    : "No rate set";
                  return (
                    <div key={idx}>
                      {/* Summary row */}
                      {!isEditing && (
                        <div className="form-field-rest h-auto min-h-[52px] flex items-start gap-2 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-medium text-brandText leading-snug">{svcLabel}</p>
                            <p className="text-[13px] text-muted-foreground mt-0.5">{priceLabel}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSrEditIdx(idx);
                              setSrDraft({ services: row.services, price: row.price, rate: row.rate });
                              setSrDropOpen(false);
                            }}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                          >
                            <Pencil size={14} strokeWidth={1.75} className="text-muted-foreground" />
                          </button>
                          {formData.rateRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => {
                                const updated = prev.rateRows.filter((_, i) => i !== idx);
                                return {
                                  ...prev,
                                  rateRows: updated,
                                  servicesOffered: [...new Set(updated.flatMap((r) => r.services))],
                                };
                              })}
                              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-destructive/10 transition-colors"
                            >
                              <X size={14} strokeWidth={2} className="text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      )}
                      {/* Inline editor */}
                      {isEditing && (
                        <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-4">
                          {/* Services multi-select */}
                          <div>
                            <label className="text-sm font-medium mb-2 block">Services</label>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setSrDropOpen((o) => !o)}
                                className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                              >
                                <span className="text-muted-foreground truncate">
                                  {srDraft.services.length === 0 ? "Select services" : srDraft.services.join(", ")}
                                </span>
                                <ChevronDown size={16} strokeWidth={1.75} className={cn("text-muted-foreground shrink-0 transition-transform", srDropOpen && "rotate-180")} />
                              </button>
                              {srDropOpen && (
                                <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                                  {SERVICES_OFFERED.map((s) => {
                                    const isVetLicensed = s === "Vet / Licensed Care";
                                    const vetBlocked = isVetLicensed && !formData.skills.some(
                                      (sk) => (SKILLS_GROUP_B as readonly string[]).includes(sk)
                                    );
                                    const selected = srDraft.services.includes(s);
                                    return (
                                      <button
                                        key={s}
                                        type="button"
                                        disabled={vetBlocked}
                                        onClick={() => {
                                          if (vetBlocked) return;
                                          setSrDraft((d) => ({
                                            ...d,
                                            services: selected ? d.services.filter((x) => x !== s) : [...d.services, s],
                                          }));
                                        }}
                                        className={cn(
                                          "w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between",
                                          vetBlocked ? "opacity-40 cursor-not-allowed" : ""
                                        )}
                                      >
                                        <span>{s}{vetBlocked && <span className="ml-1 text-xs text-muted-foreground">(proof required)</span>}</span>
                                        {selected && <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {srDraft.services.includes("Others") && (
                              <div className="form-field-rest relative flex items-center mt-2">
                                <input
                                  value={formData.servicesOther}
                                  onChange={(e) => setFormData((prev) => ({ ...prev, servicesOther: e.target.value }))}
                                  placeholder="Describe your other service"
                                  className="field-input-core"
                                />
                              </div>
                            )}
                          </div>
                          {/* Currency + Price + Rate */}
                          <div>
                            <label className="text-sm font-medium mb-2 block">Rate</label>
                            <div className="form-field-rest flex items-center overflow-hidden">
                              <select
                                value={formData.currency}
                                onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}
                                className="h-full border-0 border-r border-border/30 bg-transparent text-[13px] text-muted-foreground px-2 focus:outline-none shrink-0"
                              >
                                <option value="">—</option>
                                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={srDraft.price}
                                onChange={(e) => setSrDraft((d) => ({ ...d, price: e.target.value }))}
                                placeholder="0"
                                className="field-input-core flex-1 min-w-0"
                              />
                              <select
                                value={srDraft.rate}
                                onChange={(e) => setSrDraft((d) => ({ ...d, rate: e.target.value }))}
                                className="h-full border-0 border-l border-border/30 bg-transparent text-[13px] text-muted-foreground px-2 focus:outline-none shrink-0"
                              >
                                <option value="">Rate</option>
                                {RATE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                          </div>
                          {/* Save / Cancel */}
                          <div className="flex gap-2 pt-1">
                            <NeuControl
                              type="button"
                              size="sm"
                              variant="primary"
                              className="flex-1"
                              onClick={() => {
                                setFormData((prev) => {
                                  const updated = [...prev.rateRows];
                                  updated[idx] = { price: srDraft.price, rate: srDraft.rate, services: srDraft.services };
                                  return {
                                    ...prev,
                                    rateRows: updated,
                                    servicesOffered: [...new Set(updated.flatMap((r) => r.services))],
                                  };
                                });
                                setSrEditIdx(null);
                                setSrDropOpen(false);
                              }}
                            >
                              Save
                            </NeuControl>
                            <NeuControl
                              type="button"
                              size="sm"
                              variant="tertiary"
                              className="flex-1"
                              onClick={() => { setSrEditIdx(null); setSrDropOpen(false); }}
                            >
                              Cancel
                            </NeuControl>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Section 4: Pet Types I Care For ────────────────────────────── */}
              <div className="space-y-4" ref={openDrop === "pets" ? dropRef : undefined}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pet Types I Care For</h3>
                <div className="space-y-2">
                  {/* Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDrop(openDrop === "pets" ? null : "pets")}
                      className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                    >
                      <span className="text-muted-foreground truncate">
                        {formData.petTypes.length === 0 ? "Select pet types" : formData.petTypes.join(", ")}
                      </span>
                      <ChevronDown size={16} strokeWidth={1.75} className={cn("text-muted-foreground shrink-0 transition-transform", openDrop === "pets" && "rotate-180")} />
                    </button>
                    {openDrop === "pets" && (
                      <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                        {PET_TYPES.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFormData((prev) => ({
                              ...prev,
                              petTypes: toggleItem(prev.petTypes, p),
                              ...(p === "Dogs" && prev.petTypes.includes("Dogs") ? { dogSizes: [] } : {}),
                            }))}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                          >
                            <span>{p}</span>
                            {formData.petTypes.includes(p) && <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {formData.petTypes.includes("Others") && (
                    <div className="form-field-rest relative flex items-center mt-1">
                      <input
                        value={formData.petTypesOther}
                        onChange={(e) => setFormData((prev) => ({ ...prev, petTypesOther: e.target.value }))}
                        placeholder="Describe other pet type"
                        className="field-input-core"
                      />
                    </div>
                  )}
                  {formData.petTypes.includes("Dogs") && (
                    <div className="mt-1" ref={openDrop === "dogSizes" ? dropRef : undefined}>
                      <label className="text-sm font-medium mb-2 block">
                        Dog sizes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenDrop(openDrop === "dogSizes" ? null : "dogSizes")}
                          className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                        >
                          <span className="text-muted-foreground truncate">
                            {formData.dogSizes.length === 0 ? "Select sizes" : formData.dogSizes.join(", ")}
                          </span>
                          <ChevronDown size={16} strokeWidth={1.75} className={cn("text-muted-foreground shrink-0 transition-transform", openDrop === "dogSizes" && "rotate-180")} />
                        </button>
                        {openDrop === "dogSizes" && (
                          <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                            {DOG_SIZES.map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, dogSizes: toggleItem(prev.dogSizes, sz) }))}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                              >
                                <span>{sz}</span>
                                {formData.dogSizes.includes(sz) && <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: Availability */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Availability</h3>

                {/* Days multi-select */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Days</label>
                  <div className="relative" ref={openDrop === "days" ? dropRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenDrop(openDrop === "days" ? null : "days")}
                      className="form-field-rest w-full flex items-center justify-between text-[15px]"
                    >
                      <span className={cn("truncate", formData.days.length === 0 && "text-muted-foreground")}>
                        {formData.days.length > 0 ? formData.days.join(", ") : "Select days"}
                      </span>
                      <ChevronDown
                        size={16}
                        strokeWidth={1.75}
                        className={cn("text-muted-foreground shrink-0 transition-transform", openDrop === "days" && "rotate-180")}
                      />
                    </button>
                    {openDrop === "days" && (
                      <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                        {DAYS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, days: toggleItem(prev.days, d) }))}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                          >
                            <span>{d}</span>
                            {formData.days.includes(d) && <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Time — binary toggle */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Time</label>
                  <div className="form-field-rest flex gap-1.5 items-center py-0 px-2">
                    {(["Anytime", "Specify"] as const).map((opt) => (
                      <NeuControl
                        key={opt}
                        size="sm"
                        variant={formData.timeBlocks.includes(opt) ? "primary" : "tertiary"}
                        onClick={() => setFormData((prev) => ({
                          ...prev,
                          timeBlocks: [opt],
                          ...(opt === "Anytime" ? { otherTimeFrom: "", otherTimeTo: "" } : {}),
                        }))}
                        className="flex-1"
                      >
                        {opt}
                      </NeuControl>
                    ))}
                  </div>
                  {formData.timeBlocks.includes("Specify") && (
                    <div className="flex gap-2 mt-2">
                      <div className="flex-1">
                        <label className="text-sm font-medium mb-2 block">From</label>
                        <div className="form-field-rest relative flex items-center">
                          <input
                            type="time"
                            value={formData.otherTimeFrom}
                            onChange={(e) => setFormData((prev) => ({ ...prev, otherTimeFrom: e.target.value }))}
                            className="field-input-core"
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="text-sm font-medium mb-2 block">To</label>
                        <div className="form-field-rest relative flex items-center">
                          <input
                            type="time"
                            value={formData.otherTimeTo}
                            onChange={(e) => setFormData((prev) => ({ ...prev, otherTimeTo: e.target.value }))}
                            className="field-input-core"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Min Notice + Emergency Readiness — one row */}
                <div className="flex gap-3 items-start">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Min notice</label>
                    <div className="form-field-rest relative flex items-center">
                      <input
                        type="number"
                        min={0}
                        value={formData.minNoticeValue}
                        onChange={(e) => setFormData((prev) => ({ ...prev, minNoticeValue: e.target.value }))}
                        placeholder="0"
                        className="field-input-core pr-14"
                      />
                      <select
                        value={formData.minNoticeUnit}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            minNoticeUnit: e.target.value as "hours" | "days",
                            minNoticeValue: "",
                          }))
                        }
                        className="absolute right-3 h-7 border-0 bg-transparent text-xs text-muted-foreground pr-4 focus:outline-none"
                      >
                        <option value="hours">hrs</option>
                        <option value="days">days</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Emergency</label>
                    <div className="form-field-rest flex gap-1.5 items-center py-0 px-2">
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
                          onClick={() => setFormData((prev) => ({ ...prev, emergencyReadiness: opt === "Yes" }))}
                          className="flex-1"
                        >
                          {opt}
                        </NeuControl>
                      ))}
                    </div>
                    {formData.emergencyReadiness === true && (
                      <p className="text-xs text-muted-foreground leading-snug mt-1">
                        Only if you can genuinely respond to urgent requests.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 7: Service Location */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Service Location</h3>

                {/* Location Style multi-select */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Location Style</label>
                  <div className="relative" ref={openDrop === "location" ? dropRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenDrop(openDrop === "location" ? null : "location")}
                      className="form-field-rest w-full flex items-center justify-between text-[15px]"
                    >
                      <span className={cn("truncate", formData.locationStyles.length === 0 && "text-muted-foreground")}>
                        {formData.locationStyles.length > 0 ? formData.locationStyles.join(", ") : "Select"}
                      </span>
                      <ChevronDown
                        size={16}
                        strokeWidth={1.75}
                        className={cn("text-muted-foreground shrink-0 transition-transform", openDrop === "location" && "rotate-180")}
                      />
                    </button>
                    {openDrop === "location" && (
                      <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                        {LOCATION_STYLES.map((ls) => (
                          <button
                            key={ls}
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, locationStyles: toggleItem(prev.locationStyles, ls) }))
                            }
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                          >
                            <span>{ls}</span>
                            {formData.locationStyles.includes(ls) && <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Area — required/optional based on location style */}
                {(() => {
                  const needsArea = formData.locationStyles.some(
                    (ls) => ls === "At my place" || ls === "Meet-up / outdoor"
                  );
                  return (
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Area served
                        {!needsArea && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
                        )}
                        {needsArea && (
                          <span className="ml-1.5 text-xs font-normal text-destructive">required</span>
                        )}
                      </label>
                      <div className="form-field-rest relative flex items-center">
                        <input
                          value={formData.areaName}
                          onChange={(e) => setFormData((prev) => ({ ...prev, areaName: e.target.value }))}
                          placeholder="e.g. Downtown, Brooklyn"
                          className="field-input-core"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Section 9: Neighborly Wallet ─────────────────────────────────── */}
              <div className="space-y-2">
                {walletState === "connected" ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-green-600 shrink-0" />
                      <span className="text-sm text-brandText">Wallet connected</span>
                    </div>
                    <NeuControl
                      size="sm"
                      variant="tertiary"
                      onClick={() => setShowWalletModal(true)}
                    >
                      Manage wallet
                    </NeuControl>
                  </div>
                ) : walletState === "review" ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50">
                    <Loader2 size={14} className="text-muted-foreground shrink-0" style={{ animation: "none", opacity: 0.6 }} />
                    <span className="text-sm text-muted-foreground">Wallet under review</span>
                  </div>
                ) : (
                  <>
                    <NeuControl
                      size="lg"
                      variant="primary"
                      onClick={() => setShowWalletModal(true)}
                      className="w-full"
                    >
                      Set Wallet
                    </NeuControl>
                    <p className="text-xs text-muted-foreground text-center px-1">
                      Securely powered by Stripe to protect your payouts.
                    </p>
                  </>
                )}
              </div>

              {/* ── Section 10: Service Provider Agreement ───────────────────────── */}
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.agreementAccepted}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          agreementAccepted: checked,
                          agreementAcceptedAt: checked ? (prev.agreementAcceptedAt ?? new Date().toISOString()) : null,
                        }));
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-brandBlue shrink-0"
                    />
                    <span className="text-sm text-brandText">
                      I agree to the{" "}
                      <button
                        type="button"
                        onClick={() => navigate("/service-provider-agreement")}
                        className="text-brandBlue underline underline-offset-2"
                      >
                        Service Provider Agreement
                      </button>
                    </span>
                  </label>
              </div>

              {/* ── Section 11: Display my Pet-Carer Profile ─────────────────────── */}
              {(() => {
                const payoutsDone = formData.stripePayoutsEnabled === true;
                const agreementDone = formData.agreementAccepted;
                const blocked = !isAge18Plus || !isVerified || !payoutsDone || !agreementDone;
                const warningParts: string[] = [];
                if (!isAge18Plus) warningParts.push("Service Providers must be at least 18.");
                if (!isVerified) warningParts.push("Complete identity verification first.");
                if (!payoutsDone) warningParts.push("Set up wallet before providing service.");
                if (!agreementDone) warningParts.push("Accept the Service Provider Agreement.");
                const warningText = warningParts.join(" ");
                return (
                  <div className="space-y-2 pb-2">
                    {listingAttempted && blocked && (
                      <p className="text-xs text-destructive">{warningText}</p>
                    )}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                      <span className="text-sm font-medium text-brandText">List on Service</span>
                      <NeuToggle
                        checked={formData.listed && !blocked}
                        onCheckedChange={(val) => {
                          if (val && blocked) { setListingAttempted(true); return; }
                          if (!blocked) setFormData((prev) => ({ ...prev, listed: val }));
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

            </>
          )}

          {/* ── VIEW MODE ───────────────────────────────────────────────────── */}
          {mode === "view" && (() => {
            // Derived values
            const avatarUrl = profile?.avatar_url ?? null;
            const dedupedAlbum = albumUrls.filter((u) => u !== avatarUrl);
            const heroSlides = [
              ...(avatarUrl ? [avatarUrl] : []),
              ...dedupedAlbum,
            ];
            const roleLineServices = formData.servicesOffered.join(" · ");
            const hasCertified = formData.skills.some((s) => (SKILLS_GROUP_B as readonly string[]).includes(s));
            const sortedSkills = [...formData.skills].sort((a, b) => {
              const aC = (SKILLS_GROUP_B as readonly string[]).includes(a) ? 0 : 1;
              const bC = (SKILLS_GROUP_B as readonly string[]).includes(b) ? 0 : 1;
              return aC - bC;
            });
            // Lowest price for photo overlay
            const lowestRateRow = formData.rateRows
              .filter((r) => r.price && r.rate)
              .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0] ?? null;
            const showPriceOverlay = lowestRateRow && formData.currency;

            // 12-hour time formatter for custom availability window
            const to12h = (t: string) => {
              if (!t) return t;
              const [hStr, mStr] = t.split(":");
              const h = parseInt(hStr, 10);
              const m = parseInt(mStr, 10);
              if (isNaN(h) || isNaN(m)) return t;
              const period = h >= 12 ? "pm" : "am";
              const hour = h % 12 || 12;
              return `${hour}:${String(m).padStart(2, "0")} ${period}`;
            };

            return (
              <>
                {/* ── A. Polaroid — full device width, no tilt ───────────────────── */}
                {/*
                  Breaks out of parent px-4 via negative margin.
                  CSS frame: slightly grey-white (#f2f2f2), clean and modern.
                  Photo slot: 5% borders top/sides, 24% bottom for caption.
                  Carousel dots: overlay top-right on the photo.
                  Caption: name (Georgia italic) + service type.
                */}
                <section className="flex flex-col pt-2 pb-2 px-3">
                  <div
                    className="relative w-full overflow-hidden"
                    style={{
                      aspectRatio: "4 / 5",
                      background: "#f0f0f0",
                      borderRadius: "4px",
                      boxShadow:
                        "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
                    }}
                  >
                    {/* ── Photo slot ────────────────────────────────────────────── */}
                    <div
                      className="absolute overflow-hidden"
                      style={{ top: "5%", left: "5%", right: "5%", bottom: "24%", zIndex: 1 }}
                    >
                      {heroSlides.length > 0 ? (
                        <div
                          ref={heroScrollRef}
                          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          onScroll={(e) => {
                            const idx = Math.round(
                              e.currentTarget.scrollLeft / e.currentTarget.clientWidth
                            );
                            setHeroIndex(idx);
                          }}
                        >
                          {heroSlides.map((src, i) => (
                            <div key={i} className="h-full w-full shrink-0 snap-center snap-always">
                              <img
                                src={src}
                                alt=""
                                className="h-full w-full object-cover object-center"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <img
                          src={carerPlaceholderImg}
                          alt=""
                          className="h-full w-full object-cover object-center"
                        />
                      )}
                      {/* Inner inset — photo sits inside frame */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.10)", zIndex: 2 }}
                      />
                      {/* ── Price overlay — bottom-right of photo ──────────────── */}
                      {showPriceOverlay && (
                        <div
                          className="absolute bottom-2 right-2 z-[3] flex items-baseline gap-[2px]"
                          style={{ background: "rgba(255,255,255,0.88)", borderRadius: "8px", padding: "4px 9px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                        >
                          <span style={{ fontSize: "11px", color: "rgba(30,40,80,0.60)", lineHeight: 1 }}>
                            from {formData.currency}
                          </span>
                          <span style={{ fontSize: "20px", fontWeight: 700, color: "#1e2850", lineHeight: 1, margin: "0 2px" }}>
                            {lowestRateRow!.price}
                          </span>
                          <span style={{ fontSize: "11px", color: "rgba(30,40,80,0.60)", lineHeight: 1 }}>
                            /{lowestRateRow!.rate}
                          </span>
                        </div>
                      )}
                      {/* Carousel dots — top-right overlay on photo */}
                      {heroSlides.length > 1 && (
                        <div className="absolute top-3 right-3 flex gap-1.5" style={{ zIndex: 10 }}>
                          {heroSlides.map((_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-1.5 rounded-full transition-all duration-200",
                                i === heroIndex
                                  ? "w-5 bg-white"
                                  : "w-1.5 bg-white/55"
                              )}
                              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Badge pucks — top-left of photo, icon-only circles ─────── */}
                    {((profile as { has_car?: boolean })?.has_car || hasCertified || formData.emergencyReadiness) && (
                      <div
                        className="absolute flex flex-col gap-[6px] pointer-events-none"
                        style={{ top: "calc(5% + 8px)", left: "calc(5% + 8px)", zIndex: 10 }}
                      >
                        {(profile as { has_car?: boolean })?.has_car && (
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#2145CF", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Car className="w-4 h-4" strokeWidth={1.75} style={{ color: "#fff" }} />
                          </div>
                        )}
                        {hasCertified && (
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#7CFF6B", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} style={{ color: "#fff" }} />
                          </div>
                        )}
                        {formData.emergencyReadiness && (
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#FF4D4D", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Zap className="w-4 h-4" strokeWidth={1.75} style={{ color: "#fff" }} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Caption strip — name + service type ───────────────────── */}
                    <div
                      className="absolute left-0 right-0 flex flex-col items-center justify-center px-6 gap-1"
                      style={{ top: "76%", bottom: 0, zIndex: 10 }}
                    >
                      <span
                        className="text-[24px] leading-tight text-center w-full truncate"
                        style={{
                          fontStyle: "italic",
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          color: "#2a2a2a",
                        }}
                      >
                        {profile?.display_name || "Pet Carer"}
                      </span>
                      {roleLineServices && (
                        <span className="text-[14px] tracking-[0.04em] text-[#777] text-center w-full" style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
                          {roleLineServices}
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {/*
                  ── VIEW MODE CONTENT: 3-tier hierarchy ───────────────────────
                  TIER 1 — About: unboxed prose, most human, breathes on page
                  TIER 2 — Services: one white card, transactional/commercial
                  TIER 3 — Skills + Availability + Location: one unified card
                           with internal border-t dividers; reference data
                  ─────────────────────────────────────────────────────────────
                */}

                {/* ── TIER 1: About — quotes as in-flow blocks, pinned to container edges ── */}
                {formData.story.trim() && (
                  <section className="px-6 pt-2 pb-6">
                    {/* Opening " — left edge of text column, negative margin pulls text up */}
                    <div
                      aria-hidden
                      className="select-none pointer-events-none"
                      style={{
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontWeight: 700,
                        fontSize: "52px",
                        lineHeight: 1,
                        color: "#e4e4e4",
                        marginBottom: "-0.9rem",
                      }}
                    >
                      &#8220;
                    </div>
                    <p
                      className={cn(
                        "text-[14px] text-brandText leading-[1.78] whitespace-pre-wrap",
                        !storyExpanded && "line-clamp-5"
                      )}
                    >
                      {formData.story}
                    </p>
                    {/* Read more — directly below bio text */}
                    {formData.story.length > 300 && (
                      <button
                        type="button"
                        onClick={() => setStoryExpanded((v) => !v)}
                        className="mt-1 text-[14px] font-medium text-muted-foreground"
                      >
                        {storyExpanded ? "Show less" : "Read more"}
                      </button>
                    )}
                    {/* Closing " — same -0.9rem pull as opening quote, preserves symmetry */}
                    <div
                      aria-hidden
                      className="text-right select-none pointer-events-none"
                      style={{
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontWeight: 700,
                        fontSize: "52px",
                        lineHeight: 1,
                        color: "#e4e4e4",
                        marginTop: "-0.9rem",
                      }}
                    >
                      &#8221;
                    </div>
                  </section>
                )}

                {/* ── TIER 2: Services — Rover-style per-entry rows ────────────── */}
                {formData.servicesOffered.length > 0 && (
                  <section className="card-e1 overflow-hidden">
                    {/* Section header + pet context */}
                    <div className="px-6 pt-5 pb-4">
                      <p className="text-[12px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-2">
                        Services
                      </p>
                      {formData.petTypes.length > 0 && (
                        <p className="text-[15px] text-muted-foreground">
                          {"Works with "}
                          {formData.petTypes
                            .map((p) => {
                              if (p === "Dogs" && formData.dogSizes.length > 0)
                                return `Dogs (${formData.dogSizes.join(", ")})`;
                              return p === "Others" && formData.petTypesOther
                                ? formData.petTypesOther
                                : p;
                            })
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    {/* Per-entry rows: service name left, price right — zero ambiguity */}
                    <div className="border-t border-brandText/10 divide-y divide-brandText/10">
                      {formData.rateRows
                        .filter((r) => r.services.length > 0 || r.price)
                        .map((r, i) => {
                          const svcLabel =
                            r.services.length > 0
                              ? r.services
                                  .map((s) =>
                                    s === "Others" && formData.servicesOther
                                      ? formData.servicesOther
                                      : s
                                  )
                                  .join(" · ")
                              : "All services";
                          const hasPrice = r.price && r.rate && formData.currency;
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-4 px-6 py-4"
                            >
                              <span className="text-[16px] font-semibold text-brandText leading-snug">
                                {svcLabel}
                              </span>
                              {hasPrice ? (
                                <div className="flex items-baseline gap-1 shrink-0">
                                  <span className="text-[16px] font-bold text-brandText">
                                    {formData.currency} {r.price}
                                  </span>
                                  <span className="text-[13px] text-muted-foreground">
                                    / {r.rate.toLowerCase()}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[13px] text-muted-foreground shrink-0 italic">
                                  Ask for price
                                </span>
                              )}
                            </div>
                          );
          })}

                    </div>
                  </section>
                )}

                {/* ── TIER 3: Skills + Availability + Location — one unified card ─── */}
                {(sortedSkills.length > 0 ||
                  formData.days.length > 0 ||
                  formData.timeBlocks.length > 0 ||
                  formData.locationStyles.length > 0) && (
                  <section className="rounded-xl bg-muted/50 overflow-hidden border border-border">
                    {/* Skills sub-section */}
                    {sortedSkills.length > 0 && (
                      <div className="px-6 py-5">
                        <p className="text-[12px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-3">
                          Skills
                        </p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                          {sortedSkills.map((skill) => {
                            const isCertified = (SKILLS_GROUP_B as readonly string[]).includes(skill);
                            const proofCfg = PROOF_CONFIG[skill];
                            const proofData = formData.proofMetadata[skill] ?? {};
                            const hasProofData = proofCfg && Object.values(proofData).some(Boolean);
                            if (isCertified && proofCfg) {
                              return (
                                <Popover key={skill}>
                                  <PopoverTrigger asChild>
                                    <button type="button" className="flex items-center gap-2 text-left group">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} />
                                      <span className="text-[15px] text-brandText underline decoration-dotted underline-offset-[3px] group-hover:decoration-solid transition-all">
                                        {skill}
                                      </span>
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent side="top" align="start" className="w-56 rounded-[14px] p-3 shadow-xl border border-border/80 bg-white">
                                    <p className="text-[11px] font-semibold text-muted-foreground mb-2 tracking-wide uppercase">{skill}</p>
                                    {hasProofData ? (
                                      <div className="space-y-1.5">
                                        {proofCfg.fields.map((f) => proofData[f.key] ? (
                                          <div key={f.key}>
                                            <p className="text-[10px] text-muted-foreground">{f.label}</p>
                                            <p className="text-[13px] text-brandText font-medium">{proofData[f.key]}</p>
                                          </div>
                                        ) : null)}
                                      </div>
                                    ) : (
                                      <p className="text-[12px] text-muted-foreground italic">No credential details added.</p>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              );
                            }
                            return (
                              <div key={skill} className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                <span className="text-[15px] text-brandText">{skill}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Availability sub-section */}
                    {(formData.days.length > 0 || formData.timeBlocks.length > 0) &&
                      (() => {
                        const isAllDays = formData.days.length === 7;
                        const isWeekdays =
                          ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].every(
                            (d) => formData.days.includes(d)
                          ) &&
                          !formData.days.includes("Saturday") &&
                          !formData.days.includes("Sunday");
                        const isWeekends =
                          ["Saturday", "Sunday"].every((d) => formData.days.includes(d)) &&
                          formData.days.length === 2;
                        const dayText = isAllDays
                          ? "Every day"
                          : isWeekdays
                          ? "Weekday"
                          : isWeekends
                          ? "Weekend"
                          : formData.days.map((d) => d.slice(0, 3)).join(", ");
                        const timeText = formData.timeBlocks
                          .map((b) =>
                            b === "Specify" &&
                            formData.otherTimeFrom &&
                            formData.otherTimeTo
                              ? `${to12h(formData.otherTimeFrom)} – ${to12h(formData.otherTimeTo)}`
                              : b
                          )
                          .join(" & ");
                        const prose = [dayText, timeText].filter(Boolean).join(" · ");
                        const noticeText = formData.minNoticeValue
                          ? `${formData.minNoticeValue} ${formData.minNoticeUnit} notice`
                          : null;
                        return (
                          <div
                            className={cn(
                              "px-6 py-5 flex items-start gap-3",
                              sortedSkills.length > 0 && "border-t border-brandText/10"
                            )}
                          >
                            <Clock
                              className="w-4 h-4 text-muted-foreground shrink-0 mt-[3px]"
                              strokeWidth={1.75}
                            />
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              <span className="text-[15px] text-brandText">{prose}</span>
                              {noticeText && (
                                <span className="text-[14px] text-muted-foreground">
                                  · {noticeText}
                                </span>
                              )}
                              {formData.emergencyReadiness && (
                                <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
                                  <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                                  Emergency
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                    {/* Location sub-section */}
                    {formData.locationStyles.length > 0 && (
                      <div
                        className={cn(
                          "px-6 py-5 flex items-center gap-3",
                          (sortedSkills.length > 0 ||
                            formData.days.length > 0 ||
                            formData.timeBlocks.length > 0) &&
                            "border-t border-brandText/10"
                        )}
                      >
                        <MapPin
                          className="w-4 h-4 text-muted-foreground shrink-0"
                          strokeWidth={1.75}
                        />
                        <span className="text-[15px] text-brandText">
                          {formData.locationStyles.join(", ")}
                          {formData.areaName && (
                            <span className="text-muted-foreground"> · {formData.areaName}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </section>
                )}

                {/* Empty state */}
                {!formData.story.trim() &&
                  !formData.skills.length &&
                  !formData.days.length &&
                  !formData.locationStyles.length &&
                  !formData.servicesOffered.length && (
                    <p className="text-[14px] text-muted-foreground text-center py-8">
                      Switch to Edit to fill in your profile.
                    </p>
                  )}

                {/* View mode is self-profile only; external service request CTA belongs to public service profile modal. */}
              </>
            );
          })()}

        </div>
      </div>

      <WalletOnboardingModal
        open={showWalletModal}
        onOpenChange={setShowWalletModal}
        onExit={() => {
          // Keep wallet onboarding alive even if the page mode flips while the
          // modal is open. Status is synced after Stripe exits.
          void invokeAuthedFunction("refresh-stripe-account-status", { body: {} }).catch(() => {});
        }}
      />

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
                  <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">{f.label}</label>
                  <div className="form-field-rest relative flex items-center">
                    <input
                      value={proofFields[f.key] ?? ""}
                      onChange={(e) => setProofFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="field-input-core"
                    />
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="!flex-row gap-2 pt-2">
              <NeuControl variant="tertiary" size="sm" className="flex-1" onClick={handleProofDismiss}>
                Cancel
              </NeuControl>
              <NeuControl variant="primary" size="sm" className="flex-1" disabled={proofLoading} onClick={handleProofSubmit}>
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
