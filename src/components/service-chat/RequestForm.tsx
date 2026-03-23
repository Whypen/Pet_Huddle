import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NeuButton } from "@/components/ui/NeuButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ServiceRequestCard } from "./types";
import { LOCATION_STYLES_LIST, SERVICE_TYPES } from "@/components/service/carerServiceConstants";

type PetOption = {
  id: string;
  name: string;
  species: string | null;
  weight: number | null;
  weight_unit: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (card: ServiceRequestCard) => Promise<void>;
  providerServices: string[];
  initialCard?: ServiceRequestCard;
  draftKey?: string;
  submitLabel?: "Send" | "Update";
};

const DOG_SIZES = ["Small", "Medium", "Large", "Giant"] as const;
const CURRENCIES = ["USD", "HKD", "GBP", "EUR", "AUD", "SGD", "CAD", "JPY"] as const;
const RATE_OPTIONS = ["Per hour", "Per day", "Per session", "Per night", "Per visit"] as const;
const DEFAULT_RATE = "Per visit";
const DEFAULT_CURRENCY = "HKD";

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizePetType = (species: string | null): string => {
  const source = String(species || "").trim();
  if (!source) return "";
  const singular = source.toLowerCase().endsWith("s") ? source.slice(0, -1) : source;
  return toTitleCase(singular);
};

const inferDogSize = (weight: number | null, unit: string | null): string => {
  if (weight == null || Number.isNaN(weight)) return "";
  const normalizedUnit = String(unit || "").trim().toLowerCase();
  const kg = normalizedUnit === "lb" || normalizedUnit === "lbs" ? weight * 0.45359237 : weight;
  if (kg <= 10) return "Small";
  if (kg <= 25) return "Medium";
  if (kg <= 40) return "Large";
  return "Giant";
};

export const RequestForm = ({
  open,
  onClose,
  onSubmit,
  providerServices,
  initialCard,
  draftKey,
  submitLabel = "Send",
}: Props) => {
  const { user } = useAuth();
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [serviceTypeMenuOpen, setServiceTypeMenuOpen] = useState(false);
  const [petId, setPetId] = useState("");
  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState("");
  const [dogSize, setDogSize] = useState("");
  const [requestedDates, setRequestedDates] = useState<string[]>([]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [locationStyles, setLocationStyles] = useState<string[]>([]);
  const [locationStyleMenuOpen, setLocationStyleMenuOpen] = useState(false);
  const [locationArea, setLocationArea] = useState("");
  const [suggestedCurrency, setSuggestedCurrency] = useState(DEFAULT_CURRENCY);
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [suggestedRate, setSuggestedRate] = useState(DEFAULT_RATE);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [allowProfileAccess, setAllowProfileAccess] = useState(true);
  const [pets, setPets] = useState<PetOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const effectiveServiceTypes = providerServices.length > 0 ? providerServices : [...SERVICE_TYPES];

  const formatIsoDate = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const toDates = (items: string[]) =>
    items
      .map((value) => new Date(`${value}T00:00:00`))
      .filter((date) => !Number.isNaN(date.getTime()));

  const formatRangeLabel = (items: string[]) => {
    if (items.length === 0) return "Select dates";
    const sorted = [...items].sort();
    const format = (iso: string) => {
      const [year, month, day] = iso.split("-");
      if (!year || !month || !day) return iso;
      return `${day}-${month}-${year}`;
    };
    return `From ${format(sorted[0])} to ${format(sorted[sorted.length - 1])}`;
  };

  const toggleMultiValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

  const toDraftSnapshot = (): ServiceRequestCard => ({
    serviceType: String(serviceTypes[0] || "").trim(),
    serviceTypes,
    petId: petId.trim(),
    petName: petName.trim(),
    petType: petType.trim(),
    dogSize: dogSize.trim(),
    requestedDates,
    requestedDate: requestedDates[0],
    startTime,
    endTime,
    locationStyles,
    locationArea: locationArea.trim(),
    suggestedCurrency: suggestedPrice.trim() ? suggestedCurrency.trim().toUpperCase() : "",
    suggestedPrice: suggestedPrice.trim(),
    suggestedRate: suggestedPrice.trim() ? suggestedRate.trim() : "",
    additionalNotes: additionalNotes.trim(),
    allowProfileAccess,
  });

  useEffect(() => {
    if (!open || !user?.id) return;
    void (async () => {
      const { data } = await supabase
        .from("pets")
        .select("id,name,species,weight,weight_unit")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      const rows = (data || []) as Array<PetOption>;
      setPets(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          species: row.species,
          weight: row.weight,
          weight_unit: row.weight_unit,
        })),
      );
    })();
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return;
    const savedDraft = (() => {
      if (!draftKey || typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ServiceRequestCard;
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
      } catch {
        return null;
      }
    })();
    const seed = initialCard || savedDraft;

    if (seed) {
      const nextServiceTypes = Array.isArray(seed?.serviceTypes)
        ? seed.serviceTypes.filter(Boolean)
        : seed?.serviceType
          ? [String(seed.serviceType)]
          : [];
      setServiceTypes(nextServiceTypes);
      setPetId(String(seed?.petId || ""));
      setPetName(String(seed?.petName || ""));
      setPetType(String(seed?.petType || ""));
      setDogSize(String(seed?.dogSize || ""));
      const dates = Array.isArray(seed?.requestedDates)
        ? seed.requestedDates
        : seed?.requestedDate
          ? [String(seed.requestedDate)]
          : [];
      setRequestedDates(dates.filter(Boolean));
      setStartTime(String(seed?.startTime || "09:00"));
      setEndTime(String(seed?.endTime || "17:00"));
      setLocationStyles(
        Array.isArray(seed?.locationStyles) ? seed.locationStyles.filter(Boolean) : [],
      );
      setLocationArea(String(seed?.locationArea || ""));
      setSuggestedCurrency(String(seed?.suggestedCurrency || DEFAULT_CURRENCY));
      setSuggestedPrice(String(seed?.suggestedPrice || ""));
      setSuggestedRate(String(seed?.suggestedRate || DEFAULT_RATE));
      setAdditionalNotes(String(seed?.additionalNotes || ""));
      setAllowProfileAccess(seed?.allowProfileAccess !== false);
    } else {
      setServiceTypes([]);
      setPetId("");
      setPetName("");
      setPetType("");
      setDogSize("");
      setRequestedDates([]);
      setStartTime("09:00");
      setEndTime("17:00");
      setLocationStyles([]);
      setLocationArea("");
      setSuggestedCurrency(DEFAULT_CURRENCY);
      setSuggestedPrice("");
      setSuggestedRate(DEFAULT_RATE);
      setAdditionalNotes("");
      setAllowProfileAccess(true);
    }
    setServiceTypeMenuOpen(false);
    setLocationStyleMenuOpen(false);
    setDatePickerOpen(false);
    setAttempted(false);
  }, [draftKey, initialCard, open]);

  const missing = useMemo(
    () => ({
      serviceType: serviceTypes.length === 0,
      petId: !petId.trim(),
      petType: !petType.trim(),
      dogSize: petType.toLowerCase() === "dog" ? !dogSize.trim() : false,
      dates: requestedDates.length === 0,
      startTime: !startTime.trim(),
      endTime: !endTime.trim(),
      locationStyles: locationStyles.length === 0,
      locationArea: !locationArea.trim(),
    }),
    [dogSize, endTime, locationArea, locationStyles.length, petId, petType, requestedDates.length, serviceTypes.length, startTime]
  );

  const submit = async () => {
    setAttempted(true);
    const hasMissing = Object.values(missing).some(Boolean);
    if (hasMissing) return;
    const serviceType = serviceTypes[0] || "";
    setSubmitting(true);
    try {
      await onSubmit(toDraftSnapshot());
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = () => {
    if (!draftKey || typeof window === "undefined") {
      onClose();
      return;
    }
    window.localStorage.setItem(draftKey, JSON.stringify(toDraftSnapshot()));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Request a quote</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1 max-h-[calc(88vh-170px)]">
          <label className="space-y-1 block">
            <span className="text-[14px] font-medium text-muted-foreground">Service type</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setServiceTypeMenuOpen((value) => !value)}
                className="form-field-rest w-full h-[44px] px-4 text-left text-[15px] text-brandText flex items-center justify-between"
              >
                <span className={serviceTypes.length > 0 ? "truncate" : "truncate text-muted-foreground"}>
                  {serviceTypes.length > 0 ? serviceTypes.join(", ") : "Select"}
                </span>
                <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground shrink-0" />
              </button>
              {serviceTypeMenuOpen ? (
                <div className="absolute top-[calc(100%+6px)] left-0 z-[6000] w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                  {effectiveServiceTypes.map((service) => {
                    const selected = serviceTypes.includes(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => setServiceTypes((value) => toggleMultiValue(value, service))}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                      >
                        <span>{service}</span>
                        {selected ? <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" /> : <span className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {attempted && missing.serviceType ? <p className="text-[14px] text-[#ef6450]">Service type is required.</p> : null}
          </label>

          <label className="space-y-1 block">
            <span className="text-[14px] font-medium text-muted-foreground">Service details</span>
            <select
              value={petId}
              onChange={(event) => {
                const nextId = event.target.value;
                setPetId(nextId);
                const selected = pets.find((pet) => pet.id === nextId);
                setPetName(String(selected?.name || ""));
                const nextPetType = normalizePetType(selected?.species || "");
                setPetType(nextPetType);
                setDogSize(nextPetType.toLowerCase() === "dog" ? inferDogSize(selected?.weight ?? null, selected?.weight_unit ?? null) : "");
              }}
              className="form-field-rest w-full h-[44px] px-4"
            >
              <option value="">Select pet</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}{pet.species ? ` (${pet.species})` : ""}
                </option>
              ))}
            </select>
            {attempted && missing.petId ? <p className="text-[14px] text-[#ef6450]">Pet is required.</p> : null}
          </label>

          <div className="form-field-rest relative flex items-center h-[44px]">
            <input
              value={petType}
              placeholder="Pet type"
              className="field-input-core pr-10"
              readOnly
            />
            <ChevronDown size={16} strokeWidth={1.75} className="absolute right-4 text-muted-foreground pointer-events-none" />
          </div>
          {attempted && missing.petType ? <p className="-mt-1 text-[14px] text-[#ef6450]">Pet type is required.</p> : null}

          {petType.toLowerCase() === "dog" ? (
            <label className="space-y-1 block">
              <span className="text-[14px] font-medium text-muted-foreground">Dog size</span>
              <select
                value={dogSize}
                onChange={(event) => setDogSize(event.target.value)}
                className="form-field-rest w-full h-[44px] px-4"
              >
                <option value="">Select dog size</option>
                {DOG_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              {attempted && missing.dogSize ? <p className="text-[14px] text-[#ef6450]">Dog size is required for dogs.</p> : null}
            </label>
          ) : null}

          <label className="space-y-1 block">
            <span className="text-[14px] font-medium text-muted-foreground">Requested date(s)</span>
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className="form-field-rest w-full h-[44px] px-4 text-left text-[15px] text-brandText flex items-center justify-between"
            >
              <span className={requestedDates.length > 0 ? "truncate" : "truncate text-muted-foreground"}>
                {formatRangeLabel(requestedDates)}
              </span>
              <CalendarDays size={16} strokeWidth={1.75} className="text-muted-foreground shrink-0" />
            </button>
          </label>
          {attempted && missing.dates ? <p className="-mt-1 text-[14px] text-[#ef6450]">At least one date is required.</p> : null}

          <div className="grid grid-cols-2 gap-2">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="form-field-rest h-[44px] px-4" />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="form-field-rest h-[44px] px-4" />
          </div>
          {(attempted && (missing.startTime || missing.endTime)) ? <p className="-mt-1 text-[14px] text-[#ef6450]">Start and end time are required.</p> : null}

          <label className="space-y-1 block">
            <span className="text-[14px] font-medium text-muted-foreground">Location style</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setLocationStyleMenuOpen((value) => !value)}
                className="form-field-rest w-full h-[44px] px-4 text-left text-[15px] text-brandText flex items-center justify-between"
              >
                <span className={locationStyles.length > 0 ? "truncate" : "truncate text-muted-foreground"}>
                  {locationStyles.length > 0 ? locationStyles.join(", ") : "Select"}
                </span>
                <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground shrink-0" />
              </button>
              {locationStyleMenuOpen ? (
                <div className="absolute top-[calc(100%+6px)] left-0 z-[6000] w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                  {LOCATION_STYLES_LIST.map((locationStyle) => {
                    const selected = locationStyles.includes(locationStyle);
                    return (
                      <button
                        key={locationStyle}
                        type="button"
                        onClick={() => setLocationStyles((value) => toggleMultiValue(value, locationStyle))}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                      >
                        <span>{locationStyle}</span>
                        {selected ? <Check size={14} strokeWidth={2} className="text-brandBlue shrink-0" /> : <span className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {attempted && missing.locationStyles ? <p className="text-[14px] text-[#ef6450]">Location style is required.</p> : null}
          </label>

          <div className="form-field-rest relative flex items-center h-[44px]">
            <input value={locationArea} onChange={(e) => setLocationArea(e.target.value)} placeholder="Location / area" className="field-input-core" />
          </div>
          {attempted && missing.locationArea ? <p className="-mt-1 text-[14px] text-[#ef6450]">Location is required.</p> : null}

          <div className="form-field-rest flex items-center overflow-hidden h-[44px]">
            <select
              value={suggestedCurrency}
              onChange={(event) => setSuggestedCurrency(event.target.value)}
              className="h-full border-0 border-r border-border/30 bg-transparent text-[14px] text-muted-foreground px-2 focus:outline-none shrink-0"
            >
              <option value="">—</option>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            <input
              value={suggestedPrice}
              onChange={(event) => setSuggestedPrice(event.target.value)}
              placeholder="Price"
              className="field-input-core flex-1 min-w-0"
            />
            <select
              value={suggestedRate}
              onChange={(event) => setSuggestedRate(event.target.value)}
              className="h-full border-0 border-l border-border/30 bg-transparent text-[14px] text-muted-foreground px-2 focus:outline-none shrink-0"
            >
              <option value="">Rate</option>
              {RATE_OPTIONS.map((rateOption) => (
                <option key={rateOption} value={rateOption}>
                  {rateOption}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field-rest relative h-auto min-h-[112px] py-3">
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes"
              className="field-input-core min-h-[88px] resize-none rounded-none border-0 bg-transparent px-0 py-0 shadow-none outline-none focus-visible:ring-0"
            />
          </div>

          <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <input type="checkbox" checked={allowProfileAccess} onChange={(e) => setAllowProfileAccess(e.target.checked)} />
            Allow service provider to see your profile
          </label>
        </div>
        <DialogFooter className="!flex-row gap-2">
          <NeuButton variant="secondary" onClick={saveDraft}>Save Draft</NeuButton>
          <NeuButton onClick={() => void submit()} disabled={submitting}>
            {submitLabel}
          </NeuButton>
        </DialogFooter>
      </DialogContent>
      <Dialog open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select dates</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-border/60 bg-card">
            <Calendar
              mode="multiple"
              selected={toDates(requestedDates)}
              disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
              modifiers={{ today: [new Date()] }}
              modifiersClassNames={{
                today: "font-semibold text-brandBlue",
                selected: "bg-brandBlue text-white font-semibold",
              }}
              onSelect={(value) => {
                const selected = Array.isArray(value) ? value : [];
                setRequestedDates(selected.map((item) => formatIsoDate(item)).sort());
              }}
              className="p-2"
            />
          </div>
          <DialogFooter className="!flex-row gap-2">
            <NeuButton variant="secondary" onClick={() => setRequestedDates([])}>
              Clear
            </NeuButton>
            <NeuButton onClick={() => setDatePickerOpen(false)}>Done</NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
