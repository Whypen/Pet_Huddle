// src/components/monetization/ManageFamilySheet.tsx
import { useState, useEffect, useCallback } from "react";
import { Minus, Plus, UserMinus } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { FamilySearchDrawer } from "./FamilySearchDrawer";
import { SharePerksModal } from "./SharePerksModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizeQuotaTier } from "@/config/quotaConfig";
import { NeuIconButton } from "@/components/ui/NeuIconButton";

const BRAND_BLUE = "#2145CF";
const MAX_MEMBERS = 4;

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
  return (
    <div className="flex items-center gap-3 py-3">
      <img
        src={member.peer.avatar_url ?? "/placeholder.svg"}
        alt={member.peer.display_name ?? ""}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
          {member.peer.display_name}
        </p>
        <p className="text-[11px] text-[var(--text-tertiary)]">Member</p>
      </div>
      {isOwner && (
        <NeuIconButton
          onClick={() => onRemove(member.id)}
          aria-label="Remove member"
          destructive
          className="w-9 h-9"
        >
          <Minus size={16} strokeWidth={2.25} />
        </NeuIconButton>
      )}
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

  const tier = normalizeQuotaTier(profile?.effective_tier || profile?.tier || "free");
  const rawPurchasedSlots = Number(profile?.family_slots ?? 0);
  const purchasedFamilySlots =
    Number.isFinite(rawPurchasedSlots) && rawPurchasedSlots > 0 ? Math.floor(rawPurchasedSlots) : 0;
  const includedSlots = tier === "free" ? 0 : 1;

  const memberRow = members.find((m) => m.invitee_user_id === profile?.id);
  const ownerMembers = members.filter((m) => m.inviter_user_id === profile?.id);
  const isOwner = ownerMembers.length > 0 || !memberRow;
  const acceptedCount = ownerMembers.filter((m) => m.status !== "declined").length;
  const usedSlots = acceptedCount;
  const totalSlots = Math.min(MAX_MEMBERS, includedSlots + purchasedFamilySlots);

  const linkedIds = ownerMembers.map((m) => m.invitee_user_id);

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

  function handleAddPress() {
    if (totalSlots === 0) {
      // No slots purchased — open upsell
      setShowSlotModal(true);
    } else if (acceptedCount < totalSlots) {
      // Has capacity — invite someone
      setShowSearch(true);
    } else {
      // All slots used — offer to buy more (if under max)
      setShowSlotModal(true);
    }
  }

  const title = isOwner ? `Family Account (${usedSlots}/${totalSlots})` : "Family Account";

  return (
    <>
      <GlassModal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-sm">
        <div className="px-1 pb-2">
          {/* Owner row */}
          <div className="flex items-center gap-3 py-3">
            <img
              src={profile?.avatar_url ?? "/placeholder.svg"}
              alt="you"
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                {profile?.display_name}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">Owner</p>
            </div>
          </div>

          {/* Member rows (owner's invited members) */}
          {loading ? (
            <p className="text-[13px] text-[var(--text-tertiary)] py-2">Loading…</p>
          ) : (
            ownerMembers.map((m) => (
              <MemberRow key={m.id} member={m} isOwner={true} onRemove={removeMember} />
            ))
          )}

          {/* Member view: show the owner they belong to */}
          {memberRow && (
            <div className="flex items-center gap-3 py-3">
              <img
                src={memberRow.peer.avatar_url ?? "/placeholder.svg"}
                alt={memberRow.peer.display_name ?? ""}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                  {memberRow.peer.display_name}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)]">Owner</p>
              </div>
              <NeuIconButton
                onClick={leaveFamily}
                aria-label="Leave family"
                destructive
                className="w-9 h-9"
              >
                <UserMinus size={16} strokeWidth={2.1} />
              </NeuIconButton>
            </div>
          )}

          {/* Empty state */}
          {ownerMembers.length === 0 && !loading && isOwner && (
            <p className="text-[13px] text-[var(--text-tertiary)] py-1">No members yet.</p>
          )}

          {/* [+] add button — always visible for owner */}
          {isOwner && (
            <div className="mt-4">
              <button
                onClick={handleAddPress}
                className="flex items-center justify-center w-9 h-9 rounded-full border-[1.5px]"
                style={{ borderColor: BRAND_BLUE, color: BRAND_BLUE }}
                aria-label="Add member"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            </div>
          )}

        </div>
      </GlassModal>

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
