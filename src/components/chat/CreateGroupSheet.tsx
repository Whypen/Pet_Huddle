/**
 * CreateGroupSheet — single-scroll bottom sheet for creating public/private pet groups.
 */

import { useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { FormField, FormTextArea } from "@/components/ui/FormField";
import { NeuButton } from "@/components/ui/NeuButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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

  const togglePetFocus = (option: string) => {
    if (option === "All Pets") {
      setSelectedPetFocus(prev =>
        prev.includes("All Pets") ? [] : ["All Pets"]
      );
      return;
    }
    setSelectedPetFocus(prev => {
      const withoutAll = prev.filter(p => p !== "All Pets");
      return withoutAll.includes(option)
        ? withoutAll.filter(p => p !== option)
        : [...withoutAll, option];
    });
  };

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
    setIsCreating(true);
    try {
      // 1. Insert chat
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .insert({
          type: "group",
          name: groupName.trim(),
          visibility,
          join_method: visibility === "public" ? joinMethod : "request",
          location_label: locationLabel.trim() || null,
          pet_focus: selectedPetFocus.length > 0 ? selectedPetFocus : null,
          description: description.trim() || null,
          created_by: user.id,
        })
        .select("id, room_code")
        .single();

      if (chatError || !chat) throw chatError ?? new Error("No chat returned");

      // 1b. Upload group photo if provided
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `groups/${chat.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, { upsert: true });
        if (!uploadErr) {
          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
          if (pub?.publicUrl) {
            await supabase.from("chats").update({ avatar_url: pub.publicUrl }).eq("id", chat.id);
          }
        }
      }

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

      // 3. Insert system message into chat_messages (the active message table)
      const roomCode = (chat as { id: string; room_code?: string | null }).room_code ?? null;
      const systemText =
        visibility === "private"
          ? `Room Code: ${roomCode ?? roomCodePlaceholder} — Share this with people you trust`
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
      contentClassName="pb-2"
      className="!px-4"
    >
      {/* Scrollable body */}
      <div className="flex flex-col space-y-5">

        {/* Row 1: Photo + Group name */}
        <div className="flex flex-row items-start gap-3">
          {/* Photo circle */}
          <label className="cursor-pointer flex-shrink-0" aria-label="Upload group photo">
            <div className="w-[52px] h-[52px] rounded-full overflow-hidden bg-white/40 border border-white/50 flex items-center justify-center">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Group photo preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon size={20} strokeWidth={1.75} className="text-[var(--text-tertiary)]" />
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </label>

          {/* Group name field */}
          <div className="flex-1 min-w-0">
            <FormField
              label="Group name"
              placeholder="Sunday Small Dog Walks"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
          </div>
        </div>

        {/* Field 2: Location — no hint text */}
        <FormField
          label="Location"
          placeholder="Neighbourhood or area, e.g. Kadıköy"
          value={locationLabel}
          onChange={e => setLocationLabel(e.target.value)}
        />

        {/* Field 3: Pet focus */}
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-primary)] pl-1 mb-[6px]">
            Pet focus
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {PET_FOCUS_OPTIONS.map(option => (
              <button
                key={option}
                type="button"
                className="neu-chip text-[13px] px-3 py-1.5"
                data-active={selectedPetFocus.includes(option) ? "true" : undefined}
                onClick={() => togglePetFocus(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Field 4: Description */}
        <FormTextArea
          label="Description"
          placeholder="Tell people what this group is about and how you usually meet."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

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
              className="neu-chip px-3 py-3 flex flex-row items-start gap-2 cursor-pointer text-left"
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
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold">Public</span>
                <span className="text-[11px] mt-0.5 leading-snug opacity-80">
                  Visible in Explore. Pet lovers nearby can find it.
                </span>
              </span>
            </div>

            {/* Private option */}
            <div
              role="button"
              tabIndex={0}
              className="neu-chip px-3 py-3 flex flex-row items-start gap-2 cursor-pointer text-left"
              data-active={visibility === "private" ? "true" : undefined}
              onClick={() => setVisibility("private")}
              onKeyDown={e => (e.key === "Enter" || e.key === " ") && setVisibility("private")}
            >
              <span className="mt-0.5 flex-shrink-0">
                {visibility === "private" ? (
                  <span className="block w-[10px] h-[10px] rounded-full bg-white" />
                ) : (
                  <span className="block w-[10px] h-[10px] rounded-full border-2"
                    style={{ borderColor: "var(--blue, #3B82F6)" }} />
                )}
              </span>
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold">Private</span>
                <span className="text-[11px] mt-0.5 leading-snug opacity-80">
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
                    className="neu-chip w-full px-3 py-3 flex flex-row items-start gap-3 text-left"
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
                    <span className="flex flex-col">
                      <span className="text-[13px] font-semibold">
                        Send a join request{" "}
                        <span className="text-[11px] font-normal opacity-70">(recommended)</span>
                      </span>
                      <span className="text-[11px] mt-0.5 opacity-70">
                        You approve each new member.
                      </span>
                    </span>
                  </button>

                  {/* Join instantly */}
                  <button
                    type="button"
                    className="neu-chip w-full px-3 py-3 flex flex-row items-start gap-3 text-left"
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
                    <span className="flex flex-col">
                      <span className="text-[13px] font-semibold">Join instantly</span>
                      <span className="text-[11px] mt-0.5 opacity-70">
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
