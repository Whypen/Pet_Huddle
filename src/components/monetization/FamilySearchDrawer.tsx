// src/components/monetization/FamilySearchDrawer.tsx
import { useState, useEffect } from "react";
import { Search, UserPlus } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { NeuIconButton } from "@/components/ui/NeuIconButton";

interface SearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  social_id: string | null;
  tier: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInviteSent: () => void;
  /** IDs already linked (to exclude from results) */
  linkedIds: string[];
}

export function FamilySearchDrawer({ isOpen, onClose, onInviteSent, linkedIds }: Props) {
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = query.trim().replace(/^@/, "");
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, social_id, tier")
        .or(`display_name.ilike.%${q}%,social_id.ilike.%${q}%`)
        .neq("id", profile?.id ?? "")
        .limit(10) as unknown as { data: SearchResult[] | null };
      const filtered = (data ?? []).filter(
        (r) => !linkedIds.includes(r.id)
      );
      setResults(filtered);
    }, 300);
    return () => clearTimeout(t);
  }, [query, linkedIds, profile?.id]);

  async function sendInvite(target: SearchResult) {
    if (!profile?.id) return;
    setInviting(target.id);
    try {
      const { data: row, error } = await supabase
        .from("family_members" as "profiles")
        .insert({
          inviter_user_id: profile.id,
          invitee_user_id: target.id,
          status: "accepted",
        } as never)
        .select("id")
        .single() as unknown as { data: { id: string } | null; error: unknown };

      if (error) throw error;

      // Insert notification for invitee
      await supabase.from("notifications").insert({
        user_id: target.id,
        type: "family_invite",
        title: "Family Invite",
        body: `${profile.display_name} has invited you to join their family!`,
        message: `${profile.display_name} has invited you to join their family!`,
        metadata: { inviter_id: profile.id, family_member_id: (row as { id: string }).id },
        data: { kind: "family_invite", href: "/settings" },
        read: false,
        is_read: false,
      } as never);

      toast.success(`Invite sent to ${target.display_name ?? "user"}`);
      onInviteSent();
      onClose();
    } catch {
      toast.error("Could not send invite. Please try again.");
    } finally {
      setInviting(null);
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Search user"
      maxWidth="max-w-md"
      backdropClassName="z-[9800]"
      containerClassName="z-[9810]"
      className="max-h-[min(82vh,calc(100svh-56px))] overflow-y-auto"
    >
      <div className="px-4 pb-4 pt-7 space-y-3">
        {/* Search field */}
        <div className="relative z-20 focus-within:z-30">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.75} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username / Social ID"
            className="w-full pl-9 pr-4 py-3 rounded-[12px] bg-[var(--surface-neu)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none border border-transparent focus:border-[var(--brand-blue)]"
          />
        </div>

        {/* Results */}
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-2">
            <img
              src={r.avatar_url ?? "/placeholder.svg"}
              alt={r.display_name ?? ""}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                {r.display_name}
              </p>
              {r.social_id && (
                <p className="text-[11px] text-[var(--text-tertiary)]">@{r.social_id}</p>
              )}
            </div>
            <NeuIconButton
              onClick={() => sendInvite(r)}
              disabled={inviting === r.id}
              aria-label={inviting === r.id ? "Inviting" : `Invite ${r.display_name ?? "user"}`}
              className="w-9 h-9 text-[#2145CF]"
            >
              <UserPlus size={12} strokeWidth={2} />
            </NeuIconButton>
          </div>
        ))}

        {query.length > 0 && results.length === 0 && (
          <p className="text-center text-[13px] text-[var(--text-tertiary)] py-4">
            No users found
          </p>
        )}
      </div>
    </GlassModal>
  );
}
