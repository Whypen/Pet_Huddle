import { supabase } from "@/integrations/supabase/client";

export type GroupMetadataRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  location_label: string | null;
  location_country: string | null;
  pet_focus: string[] | null;
  join_method: string | null;
  visibility: "public" | "private" | null;
  room_code: string | null;
  created_by: string | null;
  created_at: string | null;
  last_message_at: string | null;
  member_count: number | null;
};

type UpdateGroupChatMetadataInput = {
  chatId: string;
  avatarUrl?: string | null;
  description?: string | null;
  updateAvatar?: boolean;
  updateDescription?: boolean;
};

export const updateGroupChatMetadata = async ({
  chatId,
  avatarUrl = null,
  description = null,
  updateAvatar = false,
  updateDescription = false,
}: UpdateGroupChatMetadataInput) => {
  const { data, error } = await (supabase.rpc as (
    fn: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)("update_group_chat_metadata", {
    p_chat_id: chatId,
    p_avatar_url: avatarUrl,
    p_description: description,
    p_update_avatar: updateAvatar,
    p_update_description: updateDescription,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? (data[0] as GroupMetadataRow | undefined) : undefined;
  if (!row?.id) {
    throw new Error("Group metadata update returned no row");
  }
  return row;
};

export const groupActivityRankValue = (lastMessageAt?: string | null, createdAt?: string | null) => {
  const source = lastMessageAt || createdAt || null;
  if (!source) return 0;
  const stamp = new Date(source).getTime();
  if (!Number.isFinite(stamp)) return 0;
  return stamp;
};
