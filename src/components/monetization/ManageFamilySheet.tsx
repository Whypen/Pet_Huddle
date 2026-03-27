// src/components/monetization/ManageFamilySheet.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, UserMinus, X } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { FamilySearchDrawer } from "./FamilySearchDrawer";
import { SharePerksModal } from "./SharePerksModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const BRAND_BLUE = "#2145CF";
const MAX_FAMILY_MEMBERS = 4;

type MemberRole = "owner" | "member";

interface FamilyMemberRow {
  id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  status: "pending" | "accepted" | "declined";
  inviter: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
  invitee: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
}

interface ProfileLite {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  social_id: string | null;
  tier?: string | null;
  family_slots?: number | null;
}

interface FamilyState {
  ownerId: string;
  ownerProfile: ProfileLite;
  currentUserRole: MemberRole;
  acceptedRows: FamilyMemberRow[];
  members: ProfileLite[];
  usedSlots: number;
  totalSlots: number;
  linkedIds: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const coerceNonNegativeInt = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

const normalizeTier = (tier: unknown): "free" | "plus" | "gold" => {
  const t = String(tier || "free").toLowerCase();
  if (t === "gold") return "gold";
  if (t === "plus" || t === "premium") return "plus";
  return "free";
};

const baseSlotsForTier = (tier: "free" | "plus" | "gold"): number => {
  return tier === "free" ? 1 : 2;
};

async function fetchProfileById(userId: string): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, social_id, tier, family_slots")
    .eq("id", userId)
    .maybeSingle() as unknown as { data: ProfileLite | null };
  return data ?? null;
}

async function resolveFamilyOwnerId(userId: string): Promise<string> {
  let current = userId;
  const visited = new Set<string>([userId]);

  for (let i = 0; i < 10; i += 1) {
    const { data } = await supabase
      .from("family_members" as never)
      .select("inviter_user_id")
      .eq("invitee_user_id", current)
      .eq("status", "accepted")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle() as unknown as { data: { inviter_user_id: string } | null };

    const parent = data?.inviter_user_id;
    if (!parent || visited.has(parent)) break;
    visited.add(parent);
    current = parent;
  }

  return current;
}

async function loadConnectedAcceptedRows(ownerId: string): Promise<FamilyMemberRow[]> {
  const visited = new Set<string>([ownerId]);
  let frontier = new Set<string>([ownerId]);
  const rowMap = new Map<string, FamilyMemberRow>();

  for (let i = 0; i < 10; i += 1) {
    const ids = Array.from(frontier);
    if (!ids.length) break;

    const { data } = await supabase
      .from("family_members" as never)
      .select(
        `id, inviter_user_id, invitee_user_id, status,
         inviter:profiles!family_members_inviter_user_id_fkey(id,display_name,avatar_url,social_id),
         invitee:profiles!family_members_invitee_user_id_fkey(id,display_name,avatar_url,social_id)`
      )
      .eq("status", "accepted")
      .in("inviter_user_id", ids) as unknown as { data: FamilyMemberRow[] | null };

    const nextFrontier = new Set<string>();
    for (const row of data ?? []) {
      rowMap.set(row.id, row);
      if (!visited.has(row.invitee_user_id)) {
        visited.add(row.invitee_user_id);
        nextFrontier.add(row.invitee_user_id);
      }
    }
    frontier = nextFrontier;
  }

  return Array.from(rowMap.values());
}

export function ManageFamilySheet({ isOpen, onClose }: Props) {
  const { profile } = useAuth();
  const [familyState, setFamilyState] = useState<FamilyState | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);

  const currentUserId = String(profile?.id || "").trim();

  const loadFamilyState = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);

    try {
      const ownerId = await resolveFamilyOwnerId(currentUserId);
      const ownerProfile = (await fetchProfileById(ownerId)) ?? {
        id: ownerId,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        social_id: profile?.social_id ?? null,
        tier: profile?.tier ?? "free",
        family_slots: 0,
      };

      const acceptedRows = await loadConnectedAcceptedRows(ownerId);
      const memberById = new Map<string, ProfileLite>();

      memberById.set(ownerId, {
        id: ownerId,
        display_name: ownerProfile.display_name ?? null,
        avatar_url: ownerProfile.avatar_url ?? null,
        social_id: ownerProfile.social_id ?? null,
        tier: ownerProfile.tier ?? null,
        family_slots: ownerProfile.family_slots ?? 0,
      });

      for (const row of acceptedRows) {
        memberById.set(row.inviter.id, {
          id: row.inviter.id,
          display_name: row.inviter.display_name,
          avatar_url: row.inviter.avatar_url,
          social_id: row.inviter.social_id,
        });
        memberById.set(row.invitee.id, {
          id: row.invitee.id,
          display_name: row.invitee.display_name,
          avatar_url: row.invitee.avatar_url,
          social_id: row.invitee.social_id,
        });
      }

      const members = Array.from(memberById.values());
      const ownerTier = normalizeTier(ownerProfile.tier);
      const purchasedSlots = coerceNonNegativeInt(ownerProfile.family_slots);
      const totalSlots = Math.min(MAX_FAMILY_MEMBERS, baseSlotsForTier(ownerTier) + purchasedSlots);
      const usedSlots = Math.max(1, members.length);
      const linkedIds = members.map((m) => m.id);
      const currentUserRole: MemberRole = currentUserId === ownerId ? "owner" : "member";

      setFamilyState({
        ownerId,
        ownerProfile,
        currentUserRole,
        acceptedRows,
        members,
        usedSlots,
        totalSlots,
        linkedIds,
      });
    } finally {
      setLoading(false);
    }
  }, [currentUserId, profile?.avatar_url, profile?.display_name, profile?.social_id, profile?.tier]);

  useEffect(() => {
    if (isOpen) void loadFamilyState();
  }, [isOpen, loadFamilyState]);

  const canAddMember = useMemo(() => {
    if (!familyState) return false;
    return familyState.usedSlots < familyState.totalSlots;
  }, [familyState]);

  async function removeMember(targetUserId: string) {
    if (!familyState || !currentUserId || currentUserId !== familyState.ownerId) return;

    const { error } = await supabase
      .from("family_members" as never)
      .delete()
      .eq("status", "accepted")
      .eq("invitee_user_id", targetUserId) as unknown as { error: unknown };

    if (error) {
      toast.error("Could not remove member.");
      return;
    }

    toast.success("Member removed.");
    await loadFamilyState();
  }

  async function quitFamily() {
    if (!familyState || !currentUserId || familyState.currentUserRole !== "member") return;

    const { error } = await supabase
      .from("family_members" as never)
      .delete()
      .eq("status", "accepted")
      .eq("invitee_user_id", currentUserId) as unknown as { error: unknown };

    if (error) {
      toast.error("Could not quit family.");
      return;
    }

    toast.success("You have left the family.");
    onClose();
  }

  function handleAddPress() {
    if (!familyState) return;
    if (canAddMember) {
      setShowSearch(true);
      return;
    }
    setShowSlotModal(true);
  }

  return (
    <>
      <GlassModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-sm"
        hideClose
      >
        <div className="px-1 pb-2">
          <div className="mb-3">
            <div className="flex items-start justify-between">
              <h2 className="text-base font-bold text-brandText">
                Family Account ({familyState?.usedSlots ?? 1}/{familyState?.totalSlots ?? 1})
              </h2>
              <button
                onClick={onClose}
                className="ml-auto p-1 rounded-full hover:bg-black/5 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-brandText/60" />
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-[1.25] text-left text-[var(--text-tertiary)]">
              Shared perks, not shared stars or quotas
            </p>
          </div>

          {loading ? (
            <p className="text-[13px] text-[var(--text-tertiary)] py-2">Loading…</p>
          ) : (
            <div className="space-y-3">
              {(familyState?.members || []).map((member) => {
                const isOwnerRow = member.id === familyState?.ownerId;
                const isCurrentUser = member.id === currentUserId;
                const canOwnerRemove =
                  familyState?.currentUserRole === "owner" &&
                  !isOwnerRow &&
                  !isCurrentUser;
                const canMemberQuitHere =
                  familyState?.currentUserRole === "member" &&
                  isCurrentUser &&
                  !isOwnerRow;

                return (
                  <div key={member.id} className="flex items-center gap-3 py-1">
                    <img
                      src={member.avatar_url ?? "/placeholder.svg"}
                      alt={member.display_name ?? ""}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                        {member.display_name || "Unknown user"}
                      </p>
                      <p className="text-[12px] text-[var(--text-tertiary)]">
                        {isOwnerRow ? "Owner" : "Member"}
                      </p>
                    </div>

                    {canOwnerRemove ? (
                      <button
                        onClick={() => void removeMember(member.id)}
                        className="flex items-center justify-center w-11 h-11 rounded-full bg-[var(--surface-neu)] text-red-500 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                        aria-label="Remove member"
                      >
                        <UserMinus size={18} strokeWidth={2.25} />
                      </button>
                    ) : null}

                    {canMemberQuitHere ? (
                      <button
                        onClick={() => void quitFamily()}
                        className="flex items-center justify-center w-11 h-11 rounded-full bg-[var(--surface-neu)] text-red-500 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                        aria-label="Quit family"
                      >
                        <UserMinus size={18} strokeWidth={2.25} />
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {!familyState?.members?.length && (
                <p className="text-[13px] text-[var(--text-tertiary)] py-1">No members yet.</p>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            {familyState && familyState.usedSlots < MAX_FAMILY_MEMBERS ? (
              <button
                onClick={handleAddPress}
                className="flex items-center justify-center w-9 h-9 rounded-full border-[1.5px]"
                style={{ borderColor: BRAND_BLUE, color: BRAND_BLUE }}
                aria-label="Add member"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        </div>
      </GlassModal>

      <FamilySearchDrawer
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onInviteSent={() => void loadFamilyState()}
        linkedIds={familyState?.linkedIds ?? []}
      />
      <SharePerksModal
        isOpen={showSlotModal}
        onClose={() => setShowSlotModal(false)}
        tier={normalizeTier(familyState?.ownerProfile.tier)}
      />
    </>
  );
}
