/**
 * CreateGroupSheet — single-scroll bottom sheet for creating public/private pet groups.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, MapPin, Trash2 } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { FormField } from "@/components/ui/FormField";
import { NeuButton } from "@/components/ui/NeuButton";
import { NeuDropdown } from "@/components/ui/NeuDropdown";
import { searchLocations, type LocationSuggestion } from "@/lib/locationSearch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { updateGroupChatMetadata } from "@/lib/groupChats";
import { countWords, resolveCountryByPrecedence } from "@/lib/locationLabels";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateGroupSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (chatId: string) => void;
}

type Visibility  = "public" | "private";
type JoinMethod  = "request" | "instant";

// Aligned with CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS in profileOptions.ts
const PET_FOCUS_OPTIONS = [
  "Dogs",
  "Cats",
  "Birds",
  "Fish",
  "Reptiles",
  "Small Mammals",
  "Rabbits",
  "Farm Animals",
  "All Pets",
] as const;

const roomCodePlaceholder = "— —";
const DESCRIPTION_WORD_LIMIT = 100;
const optionCardClass =
  "min-w-0 overflow-hidden rounded-[14px] border border-[rgba(66,73,101,0.14)] bg-white/72 px-3 py-3 shadow-[inset_2px_2px_5px_rgba(163,168,190,0.16),inset_-1px_-1px_4px_rgba(255,255,255,0.82)] transition-colors min-h-[92px]";
const activeOptionCardClass =
  "border-[#2147C9] bg-[#2147C9] text-white shadow-[0_16px_34px_rgba(33,71,201,0.24)]";

// ── Collapse animation preset ─────────────────────────────────────────────────

const collapseVariants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit:    { height: 0, opacity: 0 },
};

const collapseTransition = {
  duration: 0.18,
  ease: [0.40, 0.00, 0.20, 1.00] as [number, number, number, number],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateGroupSheet({
  isOpen,
  onClose,
  onGroupCreated,
}: CreateGroupSheetProps) {
  const { user } = useAuth();

  // Form state
  const [groupName,        setGroupName]        = useState("");
  const [locationLabel,    setLocationLabel]    = useState("");
  const [selectedPetFocus, setSelectedPetFocus] = useState<string[]>([]);
  const [description,      setDescription]      = useState("");
  const [visibility,       setVisibility]       = useState<Visibility>("public");
  const [joinMethod,       setJoinMethod]       = useState<JoinMethod>("request");
  const [photoPreview,     setPhotoPreview]     = useState<string | null>(null);
  const [photoFile,        setPhotoFile]        = useState<File | null>(null);
  const [isCreating,       setIsCreating]       = useState(false);

  // Pre-fetched country / district hints from the user's profile, populated
  // when the sheet opens. Country becomes a static pill; district pre-fills as
  // a one-tap suggestion the user can accept or override.
  const [profileCountryLabel, setProfileCountryLabel] = useState<string | null>(null);
  const [profileDistrictHint, setProfileDistrictHint] = useState<string | null>(null);

  // Location autocomplete state
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const locationAbortRef = useRef<AbortController | null>(null);
  const locationDebounceRef = useRef<number | null>(null);
  // Mark when the user accepted a suggestion so the next change doesn't re-fire search.
  const lastSuggestionAcceptedRef = useRef<string | null>(null);

  // Cover photo file input — referenced by camera pill / empty-state CTA on the preview card.
  const createCoverInputRef = useRef<HTMLInputElement | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhotoFile(null);
    setGroupName("");
    setLocationLabel("");
    setSelectedPetFocus([]);
    setDescription("");
    setVisibility("public");
    setJoinMethod("request");
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPhotoFile(file);
    e.target.value = "";
  };

  // Debounced location search bound to the locationLabel input.
  // Skip when the value matches a just-accepted suggestion or is too short.
  useEffect(() => {
    const trimmed = locationLabel.trim();
    if (lastSuggestionAcceptedRef.current && lastSuggestionAcceptedRef.current === trimmed) {
      return;
    }
    if (trimmed.length < 2) {
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
      return;
    }
    if (locationDebounceRef.current) window.clearTimeout(locationDebounceRef.current);
    locationDebounceRef.current = window.setTimeout(async () => {
      if (locationAbortRef.current) locationAbortRef.current.abort();
      const ctrl = new AbortController();
      locationAbortRef.current = ctrl;
      setLocationSearching(true);
      try {
        const results = await searchLocations(trimmed, profileCountryLabel, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setLocationSuggestions(results);
        setLocationSearchOpen(results.length > 0);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Fall back to no suggestions; user can still type freely.
        setLocationSuggestions([]);
      } finally {
        if (!ctrl.signal.aborted) setLocationSearching(false);
      }
    }, 280);
    return () => {
      if (locationDebounceRef.current) window.clearTimeout(locationDebounceRef.current);
    };
  }, [locationLabel, profileCountryLabel]);

  // Fetch profile country + district hint once when the sheet opens so the
  // location field is pre-contextualised. We don't block submission on this.
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("location_country, location_district, location_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as {
        location_country?: string | null;
        location_district?: string | null;
        location_name?: string | null;
      };
      const country = (row.location_country || "").trim();
      const district =
        (row.location_district || "").trim() ||
        // Fall back to first comma-token of `location_name` when district isn't set
        ((row.location_name || "").split(",")[0] || "").trim();
      setProfileCountryLabel(country || null);
      setProfileDistrictHint(district || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id]);

  // ── Create handler ────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error("Add a group name to continue.");
      return;
    }
    if (!user?.id) {
      toast.error("Sign in to create a group.");
      return;
    }
    if (countWords(description) > DESCRIPTION_WORD_LIMIT) {
      toast.error(`Description must be ${DESCRIPTION_WORD_LIMIT} words or fewer.`);
      return;
    }
    setIsCreating(true);
    try {
      const [{ data: liveLocation }, { data: profileLocation }] = await Promise.all([
        supabase
          .from("user_locations")
          .select("location_name")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("location_country, location_name, location_pinned_until")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      const liveLocationRow = (liveLocation || null) as {
        location_name?: string | null;
      } | null;
      const profileLocationRow = (profileLocation || null) as {
        location_country?: string | null;
        location_name?: string | null;
        location_pinned_until?: string | null;
      } | null;
      const pinActive = (() => {
        const raw = profileLocationRow?.location_pinned_until;
        if (!raw) return false;
        const pinnedUntil = new Date(raw).getTime();
        return Number.isFinite(pinnedUntil) && pinnedUntil > Date.now();
      })();
      const groupCountry = resolveCountryByPrecedence({
        gpsCountry: null,
        gpsLocationName: liveLocationRow?.location_name || null,
        pinCountry: pinActive ? profileLocationRow?.location_country || null : null,
        pinLocationName: pinActive ? profileLocationRow?.location_name || null : null,
        profileCountry: profileLocationRow?.location_country || null,
        profileLocationName: profileLocationRow?.location_name || null,
      });

      // 1. Insert chat
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .insert({
          type: "group",
          name: groupName.trim(),
          visibility,
          join_method: visibility === "public" ? joinMethod : "request",
          location_label: locationLabel.trim() || null,
          location_country: groupCountry,
          pet_focus: selectedPetFocus.length > 0 ? selectedPetFocus : null,
          description: description.trim() || null,
          created_by: user.id,
        })
        .select("id, room_code")
        .single();

      if (chatError || !chat) throw chatError ?? new Error("No chat returned");

      // 2. Add creator to chat_participants (role = admin, drives admin RLS checks)
      const { error: participantError } = await supabase
        .from("chat_participants")
        .insert({ chat_id: chat.id, user_id: user.id, role: "admin" });
      if (participantError) throw participantError;

      // 2b. Add creator to chat_room_members (primary membership table — drives My Groups listing)
      const { error: memberError } = await supabase
        .from("chat_room_members")
        .insert({ chat_id: chat.id, user_id: user.id });
      if (memberError) throw memberError;

      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/groups/${chat.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        if (pub?.publicUrl) {
          await updateGroupChatMetadata({
            chatId: chat.id,
            avatarUrl: pub.publicUrl,
            updateAvatar: true,
          });
        }
      }

      // 3. Insert system message into chat_messages (the active message table)
      const roomCode = (chat as { id: string; room_code?: string | null }).room_code ?? null;
      const systemText =
        visibility === "private"
          ? `Room Code: ${roomCode ?? roomCodePlaceholder}`
          : joinMethod === "request"
          ? "This is a public group. People can request to join and you approve them."
          : "This is a public group. Anyone can join instantly.";

      // Store as JSON so ChatDialogue can identify and render it as a system pill
      await supabase
        .from("chat_messages")
        .insert({
          chat_id: chat.id,
          sender_id: user.id,
          content: JSON.stringify({ kind: "system", text: systemText }),
        });
      // Non-blocking — a missing system message doesn't break the group

      toast.success("Your group is live!");
      onClose();
      resetForm();
      onGroupCreated(chat.id);
    } catch (err) {
      console.error("Create group error:", err);
      toast.error("Could not create group. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Create a group"
      contentClassName="!pr-0 !pl-0 pb-2"
      className="!px-3 !pt-4 huddle-sheet-bottom-padding"
    >
      {/* Scrollable body */}
      <div className="flex flex-col space-y-5 px-1">

        {/* Row 1: Group name (full-width — cover upload moved to the preview card below) */}
        <div className="flex flex-row items-start gap-3">
          <div className="flex-1 min-w-0">
            <FormField
              label="Group name"
              placeholder="Sunday Small Dog Walks"
              value={groupName}
              className="[&_.form-field-rest]:px-3 [&_.field-input-core]:pl-0 [&_.field-input-core]:pr-0"
              onChange={e => setGroupName(e.target.value)}
            />
          </div>
        </div>

        {/* Field 2: Location — country pill (from profile) + searchable district.
            Type to search via Nominatim; results are biased to the profile country.
            User can still type any free-text and submit without picking a suggestion. */}
        <div className="relative">
          <p className="text-[13px] font-semibold text-[var(--text-primary)] pl-1 mb-[6px]">
            Location
          </p>
          {profileCountryLabel ? (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[rgba(33,69,207,0.16)] bg-[rgba(33,69,207,0.06)] px-2.5 py-1 text-[12px] font-[600] text-[#2145CF]">
              <MapPin className="h-3 w-3" strokeWidth={1.75} />
              {profileCountryLabel}
            </div>
          ) : null}
          <FormField
            placeholder="Search district or neighbourhood"
            value={locationLabel}
            className="[&_.form-field-rest]:px-3 [&_.field-input-core]:pl-0 [&_.field-input-core]:pr-0"
            onChange={(e) => {
              lastSuggestionAcceptedRef.current = null;
              setLocationLabel(e.target.value);
            }}
            onFocus={() => {
              if (locationSuggestions.length > 0) setLocationSearchOpen(true);
            }}
          />

          {/* Suggestion popover — sits below the input.
              z-[5300] beats GlassSheet (4210) and NeuDropdown (5200). */}
          {locationSearchOpen && (locationSuggestions.length > 0 || locationSearching) ? (
            <div
              className="absolute left-0 right-0 z-[5300] mt-1 rounded-[12px] glass-card max-h-[260px] overflow-y-auto p-1 shadow-[0_10px_24px_rgba(20,24,38,0.12)]"
              role="listbox"
            >
              {locationSearching && locationSuggestions.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-[rgba(74,73,101,0.6)]">Searching…</div>
              ) : (
                locationSuggestions.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    role="option"
                    onClick={() => {
                      setLocationLabel(s.primary);
                      lastSuggestionAcceptedRef.current = s.primary;
                      setLocationSearchOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-[10px] hover:bg-[rgba(255,255,255,0.58)] transition-colors"
                  >
                    <div className="text-[14px] font-[600] text-[var(--text-primary)]">{s.primary}</div>
                    <div className="text-[11px] text-[rgba(74,73,101,0.55)] truncate">{s.full}</div>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {/* Quick suggestion: user's own district from profile */}
          {profileDistrictHint && profileDistrictHint.toLowerCase() !== locationLabel.trim().toLowerCase() ? (
            <button
              type="button"
              onClick={() => {
                setLocationLabel(profileDistrictHint);
                lastSuggestionAcceptedRef.current = profileDistrictHint;
                setLocationSearchOpen(false);
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-[rgba(66,73,101,0.18)] bg-white/72 px-3 py-1 text-[12px] font-[500] text-[rgba(74,73,101,0.85)] transition-colors hover:bg-white"
            >
              <span>Use my district —</span>
              <span className="font-[600] text-[#2145CF]">{profileDistrictHint}</span>
            </button>
          ) : null}
        </div>

        {/* Field 3: Pet focus — single-value dropdown (shared NeuDropdown).
            DB column `pet_focus` stays an array so multi-value migration later
            doesn't need a schema change; we always send `[value]`. */}
        <NeuDropdown
          label="Pet focus"
          placeholder="Choose a focus"
          value={selectedPetFocus[0] ?? undefined}
          onValueChange={(value) => setSelectedPetFocus(value ? [value] : [])}
          options={PET_FOCUS_OPTIONS.map((option) => ({ value: option, label: option }))}
        />

        {/* Field 4: Description — unified preview card.
            Mirrors the Explore card: 16:9 live cover + name + location + pet
            focus chips overlaid, with description as the editable body. Lets
            the creator see their group exactly as members will see it. */}
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-primary)] pl-1 mb-[6px]">
            Description
          </p>
          <article className="glass-card overflow-hidden">
            <div className="group/cover relative w-full aspect-[16/9] overflow-hidden rounded-[20px_20px_0_0] bg-[rgba(20,24,38,0.04)]">
              {photoPreview ? (
                <img src={photoPreview} alt={groupName || "Group"} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #2145CF 0%, #3A5FE8 100%)" }} aria-hidden />
              )}
              <div className="absolute top-0 inset-x-0 h-[28%] pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(20,24,38,0.45), transparent)" }} aria-hidden />
              <div className="absolute bottom-0 inset-x-0 h-[60%] pointer-events-none" style={{ background: "linear-gradient(to top, rgba(20,24,38,0.78), rgba(20,24,38,0.10) 60%, transparent)" }} aria-hidden />
              <span className="absolute top-3 right-3 text-[11px] font-[500] px-[10px] py-[4px] rounded-full text-white" style={{ background: "rgba(20,24,38,0.55)" }}>
                1 member
              </span>
              <div className="absolute bottom-3 left-4 right-4 pointer-events-none flex flex-col gap-[4px]">
                <span className="text-[18px] font-[600] leading-[1.2] text-white truncate drop-shadow-sm">
                  {groupName.trim() || "Your group name"}
                </span>
                {locationLabel.trim() ? (
                  <span className="flex items-center gap-[4px] text-[12px] font-[500] text-white/85 truncate">
                    <MapPin size={12} strokeWidth={1.75} className="flex-shrink-0" aria-hidden />
                    {locationLabel}
                  </span>
                ) : null}
                {selectedPetFocus.length > 0 ? (
                  <div className="flex gap-[6px] overflow-x-auto scrollbar-none -mx-1 px-1 pb-[2px]">
                    {selectedPetFocus.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="flex-shrink-0 text-[10px] font-[500] uppercase tracking-[0.04em] px-[8px] py-[3px] rounded-full text-white"
                        style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.28)" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Hidden file input — single source for all cover-edit triggers */}
              <input
                ref={createCoverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={handlePhotoChange}
              />

              {/* Camera + trash cluster — visible when a cover is set.
                  Identical to Manage Group: 44×44 pills, hover-reveal trash on desktop. */}
              {photoPreview ? (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return null;
                      });
                      setPhotoFile(null);
                    }}
                    aria-label="Remove cover photo"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-[0.94] opacity-0 group-hover/cover:opacity-100 focus-visible:opacity-100 md:opacity-100"
                    style={{ background: "rgba(20,24,38,0.62)", border: "1px solid rgba(255,255,255,0.30)", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}
                  >
                    <Trash2 className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => createCoverInputRef.current?.click()}
                    aria-label="Change cover photo"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-[0.94]"
                    style={{ background: "rgba(20,24,38,0.62)", border: "1px solid rgba(255,255,255,0.30)", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}
                  >
                    <Camera className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                /* Empty-state — full-cover tap target invites adding a cover */
                <button
                  type="button"
                  onClick={() => createCoverInputRef.current?.click()}
                  aria-label="Add cover photo"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-[13px] font-[600]"
                >
                  <Camera className="h-6 w-6" strokeWidth={1.75} />
                  <span>Add a cover photo</span>
                  <span className="text-[11px] font-[500] text-white/75">16:9, daylight is your friend</span>
                </button>
              )}
            </div>
            <div className="px-4 py-3">
              <textarea
                value={description}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (countWords(nextValue) > DESCRIPTION_WORD_LIMIT) return;
                  setDescription(nextValue);
                }}
                rows={3}
                placeholder="Tell people what this group is about and how you usually meet."
                className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-brandText outline-none focus:outline-none placeholder:text-[rgba(74,73,101,0.55)]"
              />
            </div>
          </article>
        </div>

        {/* Section: Visibility */}
        <div className="mt-5">
          <p className="text-[13px] font-semibold text-[var(--text-primary)] pl-1 mb-[6px]">
            Visibility
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Public option */}
            <div
              role="button"
              tabIndex={0}
              className={cn(
                optionCardClass,
                "flex min-w-0 flex-row items-start gap-2 cursor-pointer text-left",
                visibility === "public" && activeOptionCardClass
              )}
              data-active={visibility === "public" ? "true" : undefined}
              onClick={() => setVisibility("public")}
              onKeyDown={e => (e.key === "Enter" || e.key === " ") && setVisibility("public")}
            >
              <span className="mt-0.5 flex-shrink-0">
                {visibility === "public" ? (
                  <span className="block w-[10px] h-[10px] rounded-full bg-white" />
                ) : (
                  <span className="block w-[10px] h-[10px] rounded-full border-2"
                    style={{ borderColor: "var(--blue, #3B82F6)" }} />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-semibold">Public</span>
                <span className={cn("text-[11px] mt-0.5 leading-snug opacity-80", visibility === "public" && "text-white/90")}>
                  Visible in Explore. Pet lovers nearby can find it.
                </span>
              </span>
            </div>

            {/* Private option */}
            <div
              role="button"
              tabIndex={0}
              className={cn(
                optionCardClass,
                "flex min-w-0 flex-row items-start gap-2 cursor-pointer text-left",
                visibility === "private" && activeOptionCardClass
              )}
              data-active={visibility === "private" ? "true" : undefined}
              onClick={() => {
                setVisibility("private");
                setJoinMethod("request");
              }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  setVisibility("private");
                  setJoinMethod("request");
                }
              }}
            >
              <span className="mt-0.5 flex-shrink-0">
                {visibility === "private" ? (
                  <span className="block w-[10px] h-[10px] rounded-full bg-white" />
                ) : (
                  <span className="block w-[10px] h-[10px] rounded-full border-2"
                    style={{ borderColor: "var(--blue, #3B82F6)" }} />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-semibold">Private</span>
                <span className={cn("text-[11px] mt-0.5 leading-snug opacity-80", visibility === "private" && "text-white/90")}>
                  Hidden. People join with a code.
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Section: Join method — only when public */}
        <AnimatePresence initial={false}>
          {visibility === "public" && (
            <motion.div
              key="join-method"
              variants={collapseVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={collapseTransition}
              style={{ overflow: "hidden" }}
            >
              <div className="pt-1">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] pl-1 mb-[6px]">
                  How can people join?
                </p>
                <div className="space-y-2">

                  {/* Request to join */}
                  <button
                    type="button"
                    className={cn(
                      optionCardClass,
                      "w-full min-w-0 flex flex-row items-start gap-3 text-left",
                      joinMethod === "request" && activeOptionCardClass
                    )}
                    data-active={joinMethod === "request" ? "true" : undefined}
                    onClick={() => setJoinMethod("request")}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {joinMethod === "request" ? (
                        <span className="block w-[8px] h-[8px] rounded-full bg-white" />
                      ) : (
                        <span className="block w-[8px] h-[8px] rounded-full border-2"
                          style={{ borderColor: "var(--blue, #3B82F6)" }} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold">
                        Send a join request{" "}
                        <span className={cn("text-[11px] font-normal opacity-70", joinMethod === "request" && "text-white/80")}>
                          (recommended)
                        </span>
                      </span>
                      <span className={cn("text-[11px] mt-0.5 opacity-70", joinMethod === "request" && "text-white/90")}>
                        You approve each new member.
                      </span>
                    </span>
                  </button>

                  {/* Join instantly */}
                  <button
                    type="button"
                    className={cn(
                      optionCardClass,
                      "w-full min-w-0 flex flex-row items-start gap-3 text-left",
                      joinMethod === "instant" && activeOptionCardClass
                    )}
                    data-active={joinMethod === "instant" ? "true" : undefined}
                    onClick={() => setJoinMethod("instant")}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {joinMethod === "instant" ? (
                        <span className="block w-[8px] h-[8px] rounded-full bg-white" />
                      ) : (
                        <span className="block w-[8px] h-[8px] rounded-full border-2"
                          style={{ borderColor: "var(--blue, #3B82F6)" }} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold">Join instantly</span>
                      <span className={cn("text-[11px] mt-0.5 opacity-70", joinMethod === "instant" && "text-white/90")}>
                        Anyone can join right away.
                      </span>
                    </span>
                  </button>

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>{/* end scrollable body */}

      {/* Sticky footer CTA */}
      <div className="pt-3 border-t border-white/20 mt-5">
        <NeuButton
          onClick={handleCreate}
          disabled={!groupName.trim() || isCreating}
          loading={isCreating}
          className="w-full"
          size="lg"
        >
          Create group
        </NeuButton>
      </div>

    </GlassSheet>
  );
}
