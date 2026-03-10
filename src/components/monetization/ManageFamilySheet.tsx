// src/components/monetization/ManageFamilySheet.tsx
import { useState, useEffect, useCallback } from "react";
import { Plus, ShoppingBag, Check, Trash2 } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { FamilySearchDrawer } from "./FamilySearchDrawer";
import { SharePerksModal } from "./SharePerksModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const BRAND_BLUE = "#2145CF";
const SWIPE_THRESHOLD = -60;

const FEATURES_BASE = [
  "Your filters access",
  "Broadcast range & duration",
  "More Discovery",
];
const FEATURES_GOLD = ["Video uploads", "Top Profile Visibility"];

interface FamilyMember {
  id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  status: "pending" | "accepted" | "declined";
  peer: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function MemberRow({
  member,
  isOwner,
  onRemove,
}: {
  member: FamilyMember;
  isOwner: boolean;
  onRemove: (id: string) => void;
}) {
  const x = useMotionValue(0);
  const trashOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const [swiped, setSwiped] = useState(false);

  function handleDragEnd() {
    if (x.get() <= SWIPE_THRESHOLD) {
      setSwiped(true);
      animate(x, SWIPE_THRESHOLD);
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      setSwiped(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[12px]">
      {/* Trash background */}
      {isOwner && (
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-14 bg-red-500 rounded-[12px]"
          style={{ opacity: trashOpacity }}
        >
          <Trash2 size={16} color="#fff" strokeWidth={1.75} />
        </motion.div>
      )}
      <motion.div
        drag={isOwner ? "x" : false}
        dragConstraints={{ left: SWIPE_THRESHOLD, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative flex items-center gap-3 py-3 px-1 bg-[var(--surface-neu)] rounded-[12px]"
      >
        <img
          src={member.peer.avatar_url ?? "/placeholder.svg"}
          alt={member.peer.display_name ?? ""}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
            {member.peer.display_name}
          </p>
          <span className="text-[10px] font-[600] text-white bg-[var(--brand-blue)] rounded-full px-2 py-0.5">
            Family Member
          </span>
        </div>
        <span
          className={`text-[11px] font-[500] px-2 py-0.5 rounded-full ${
            member.status === "accepted"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {member.status === "accepted" ? "Active" : "Pending"}
        </span>
        {swiped && isOwner && (
          <button
            onClick={() => onRemove(member.id)}
            className="absolute inset-0 opacity-0"
            aria-label="Confirm remove"
          />
        )}
      </motion.div>
    </div>
  );
}

export function ManageFamilySheet({ isOpen, onClose }: Props) {
  const { profile } = useAuth() as ReturnType<typeof useAuth> & {
    fetchProfile?: (id: string) => Promise<void>;
  };
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);

  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const familySlots = profile?.family_slots ?? 0;
  const MAX_MEMBERS = 3;

  // Determine if current user is the owner of a family group
  const memberRow = members.find((m) => m.invitee_user_id === profile?.id);
  const ownerMembers = members.filter((m) => m.inviter_user_id === profile?.id);
  const isOwner = ownerMembers.length > 0 || !memberRow;
  const acceptedCount = ownerMembers.filter((m) => m.status !== "declined").length;
  const canAdd = isOwner && acceptedCount < familySlots && acceptedCount < MAX_MEMBERS;
  const canBuyMore = isOwner && acceptedCount >= familySlots && familySlots < MAX_MEMBERS;

  const loadMembers = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("family_members" as never)
      .select(
        `id, inviter_user_id, invitee_user_id, status,
         inviter:profiles!family_members_inviter_user_id_fkey(id,display_name,avatar_url,social_id),
         invitee:profiles!family_members_invitee_user_id_fkey(id,display_name,avatar_url,social_id)`
      )
      .or(`inviter_user_id.eq.${profile.id},invitee_user_id.eq.${profile.id}`) as unknown as {
      data: Array<{
        id: string;
        inviter_user_id: string;
        invitee_user_id: string;
        status: "pending" | "accepted" | "declined";
        inviter: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
        invitee: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
      }> | null;
    };

    const rows = (data ?? [])
      .filter((r) => r.status !== "declined")
      .map((r) => ({
        id: r.id,
        inviter_user_id: r.inviter_user_id,
        invitee_user_id: r.invitee_user_id,
        status: r.status,
        peer:
          r.inviter_user_id === profile.id
            ? r.invitee
            : r.inviter,
      }));
    setMembers(rows);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { if (isOpen) loadMembers(); }, [isOpen, loadMembers]);

  async function removeMember(rowId: string) {
    const { error } = await supabase
      .from("family_members" as never)
      .delete()
      .eq("id", rowId)
      .eq("inviter_user_id", profile?.id) as unknown as { error: unknown };
    if (error) { toast.error("Could not remove member."); return; }
    toast.success("Member removed.");
    loadMembers();
  }

  async function leaveFamily() {
    if (!memberRow) return;
    const { error } = await supabase
      .from("family_members" as never)
      .delete()
      .eq("id", memberRow.id)
      .eq("invitee_user_id", profile?.id) as unknown as { error: unknown };
    if (error) { toast.error("Could not leave family."); return; }
    toast.success("You have left the family.");
    onClose();
  }

  const features = tier === "gold" ? [...FEATURES_BASE, ...FEATURES_GOLD] : FEATURES_BASE;
  const linkedIds = ownerMembers.map((m) => m.invitee_user_id);

  return (
    <>
      <GlassSheet isOpen={isOpen} onClose={onClose} title="Family Account">
        <div className="px-4 pb-6 space-y-3">
          {/* Tier / slot subtitle — owner only */}
          {isOwner && (
            <p className="text-[12px] text-[var(--text-secondary)] -mt-1">
              {tier.charAt(0).toUpperCase() + tier.slice(1)} ·{" "}
              {acceptedCount} of {Math.min(familySlots, MAX_MEMBERS)} slot
              {familySlots !== 1 ? "s" : ""} used
            </p>
          )}

          {/* Owner row */}
          <div className="flex items-center gap-3 py-3 px-1">
            <img
              src={profile?.avatar_url ?? "/placeholder.svg"}
              alt="you"
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                {profile?.display_name}
              </p>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {isOwner ? "You · Owner" : ""}
              </span>
            </div>
          </div>

          {/* Member rows */}
          {loading ? (
            <p className="text-[13px] text-[var(--text-tertiary)] py-2">Loading…</p>
          ) : (
            ownerMembers.map((m) => (
              <MemberRow key={m.id} member={m} isOwner={true} onRemove={removeMember} />
            ))
          )}

          {/* Member view: show owner */}
          {memberRow && (
            <div className="flex items-center gap-3 py-3 px-1">
              <img
                src={memberRow.peer.avatar_url ?? "/placeholder.svg"}
                alt={memberRow.peer.display_name ?? ""}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                  {memberRow.peer.display_name}
                </p>
                <span className="text-[11px] text-[var(--text-tertiary)]">Family Owner</span>
              </div>
            </div>
          )}

          {ownerMembers.length === 0 && !loading && isOwner && (
            <p className="text-[13px] text-[var(--text-tertiary)] py-1">No members yet.</p>
          )}

          {/* Add / slot upsell */}
          {canAdd && (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center justify-center w-9 h-9 rounded-full border-[1.5px]"
              style={{ borderColor: BRAND_BLUE, color: BRAND_BLUE }}
              aria-label="Add member"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          )}
          {canBuyMore && (
            <button
              onClick={() => setShowSlotModal(true)}
              className="flex items-center gap-2 text-[13px] font-[500] py-2"
              style={{ color: BRAND_BLUE }}
            >
              <ShoppingBag size={15} strokeWidth={1.75} />
              Member slot
            </button>
          )}

          {/* What members get */}
          {isOwner && familySlots > 0 && (
            <div className="mt-2 rounded-[14px] overflow-hidden border border-[rgba(0,0,0,0.06)]"
              style={{ background: "rgba(255,255,255,0.7)" }}>
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <p className="text-[12px] font-[600] text-[var(--text-primary)]">
                  What members get
                </p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {features.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <Check size={12} strokeWidth={2.5} style={{ color: BRAND_BLUE }} />
                    <span className="text-[12px] text-[var(--text-primary)]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leave family (member view) */}
          {memberRow && (
            <button
              onClick={leaveFamily}
              className="w-full text-center text-[13px] font-[500] text-red-500 pt-2"
            >
              Leave Family
            </button>
          )}
        </div>
      </GlassSheet>

      <FamilySearchDrawer
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onInviteSent={loadMembers}
        linkedIds={linkedIds}
      />
      <SharePerksModal
        isOpen={showSlotModal}
        onClose={() => setShowSlotModal(false)}
        tier={tier}
      />
    </>
  );
}
