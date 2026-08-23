import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { uploadNativeServiceCareEvidenceImage, type NativeSocialComposerMedia } from "./nativeSocial";
import { requestNativeStorageCleanupResult } from "./nativeStorageCleanup";

export type CareUpdateKind = "optional" | "photo" | "photo_note" | "summary";

export const CARE_UPDATE_PREFERENCE_OPTIONS = ["Optional", "Photo", "Summary", "Photo + summary"] as const;
export type CareUpdatePreference = (typeof CARE_UPDATE_PREFERENCE_OPTIONS)[number];

export function normalizeCareUpdatePreference(updatePreference?: string | null): CareUpdatePreference {
  const raw = (updatePreference || "").trim();
  if (!raw || raw === "No preference" || raw === "Update as needed" || raw === "Update as needed (Default)") return "Optional";
  if (raw === "Photos please" || raw === "Photo updates" || raw === "Photo") return "Photo";
  if (raw === "Daily update" || raw === "Daily summary" || raw === "Summary") return "Summary";
  if (raw === "Every visit" || raw === "Notes + photos" || raw === "Photo + summary") return "Photo + summary";
  return "Optional";
}

// Mirrors the owner's update preference normalisation used across the service
// chat, then collapses it to a compact "kind" that drives requested update
// content and reminders. Keep in lockstep with normalize_update_preference() and
// service_care_update_kind() in the Supabase migration.
export function deriveCareUpdateKind(updatePreference?: string | null): CareUpdateKind {
  switch (normalizeCareUpdatePreference(updatePreference)) {
    case "Photo": return "photo";
    case "Photo + summary": return "photo_note";
    case "Summary": return "summary";
    default: return "optional";
  }
}

export const careUpdatePhotoRequired = (kind: CareUpdateKind) => kind === "photo" || kind === "photo_note";
export const careUpdateNoteRequired = (kind: CareUpdateKind) => kind === "photo_note" || kind === "summary";
export const careUpdateIsRequested = (kind: CareUpdateKind) => kind !== "optional";

type CareUpdateCopy = {
  sheetTitle: string;
  sheetSubtitle: string;
  noteLabel: string;
  notePlaceholder: string;
  nudgeTitle: string;
  nudgeBody: string;
};

export function careUpdateCopy(kind: CareUpdateKind): CareUpdateCopy {
  switch (kind) {
    case "photo":
      return {
        sheetTitle: "Photo update",
        sheetSubtitle: "Send a photo, add a caption if you like",
        noteLabel: "Caption",
        notePlaceholder: "Add a caption",
        nudgeTitle: "Time for a photo",
        nudgeBody: "The owner asked for photos during care.",
      };
    case "photo_note":
      return {
        sheetTitle: "Photo + note update",
        sheetSubtitle: "Send a photo with a short note",
        noteLabel: "Short note",
        notePlaceholder: "Write a short note",
        nudgeTitle: "Time for a care update",
        nudgeBody: "The owner asked for a note with each photo.",
      };
    case "summary":
      return {
        sheetTitle: "Daily summary",
        sheetSubtitle: "Sum up the day, add a photo if you like",
        noteLabel: "Daily summary",
        notePlaceholder: "How did the day go?",
        nudgeTitle: "Add today's summary",
        nudgeBody: "The owner asked for a daily summary.",
      };
    default:
      return {
        sheetTitle: "Care update",
        sheetSubtitle: "Share a photo, a note, or both",
        noteLabel: "Note",
        notePlaceholder: "Add a note",
        nudgeTitle: "Send a quick update?",
        nudgeBody: "Owners love a photo during care.",
      };
  }
}

// "1 Jan, 2026 · 2:14pm" — built manually so iOS and Android render identically
// (avoids platform differences in AM/PM casing and separators).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatCareUpdateStamp(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = MONTHS[date.getMonth()] || "";
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${day} ${month}, ${year} · ${hours12}:${minutes}${period}`;
}

// Whether a single sent update satisfies the owner's requested kind. Used to
// compute reminder/progress state only; it never gates completion.
export function careUpdateQualifies(kind: CareUpdateKind, update: { photoUrl?: string | null; note?: string | null }): boolean {
  const hasPhoto = Boolean((update.photoUrl || "").trim());
  const hasNote = Boolean((update.note || "").trim());
  switch (kind) {
    case "photo": return hasPhoto;
    case "photo_note": return hasPhoto && hasNote;
    case "summary": return hasNote;
    default: return hasPhoto || hasNote;
  }
}

export type SubmitCareUpdateMessage = {
  id: string;
  chat_id?: string | null;
  sender_id: string;
  content: string;
  created_at: string;
};
export type SubmitCareUpdateResult = { ok: true; message?: SubmitCareUpdateMessage | null } | { ok: false; code: string; message: string };
export type NativeCareUpdateStatus = {
  ok?: boolean;
  service_chat_id?: string | null;
  update_kind?: CareUpdateKind | string | null;
  required?: boolean | null;
  required_count?: number | null;
  total_required_count?: number | null;
  due_count?: number | null;
  submitted_count?: number | null;
  met?: boolean | null;
  latest_update_at?: string | null;
};

const CARE_UPDATE_ERROR_COPY: Record<string, string> = {
  care_update_photo_required: "Add a live photo before sending this update.",
  care_update_note_required: "Add a short note before sending this update.",
  care_update_empty: "Add a photo or note before sending this update.",
  care_update_image_info_timeout: "The photo could not be prepared. Retake it and try again.",
  care_update_image_prepare_timeout: "The photo could not be prepared. Retake it and try again.",
  care_update_image_read_timeout: "The photo could not be prepared. Retake it and try again.",
  care_update_not_confirmed: "Unable to send this care update. Try again.",
  care_update_upload_timeout: "The photo upload took too long. Check your connection and try again.",
  care_not_in_progress: "You can share updates once the care session has started.",
  not_provider: "Only the carer can share care updates.",
  request_timeout: "The update took too long to confirm. Try again.",
};

export function careUpdateErrorMessage(code: string | null | undefined, fallback: string): string {
  if (!code) return fallback;
  return CARE_UPDATE_ERROR_COPY[code] || fallback;
}

const uploadedCareEvidencePath = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { bucket?: unknown; path?: unknown };
    if (parsed?.bucket === "service_care_evidence" && typeof parsed.path === "string") return parsed.path;
  } catch {
    return null;
  }
  return null;
};

export async function getNativeCareUpdateStatus(serviceChatId: string): Promise<NativeCareUpdateStatus | null> {
  const exactServiceChatId = (serviceChatId || "").trim();
  if (!exactServiceChatId) return null;
  const { data, error } = await nativeExactTokenRpc<NativeCareUpdateStatus>("get_service_care_update_status_by_service_id", { p_service_chat_id: exactServiceChatId });
  if (error) throw error;
  return data && typeof data === "object" ? data as NativeCareUpdateStatus : null;
}

export async function submitNativeCareUpdate(options: {
  accessToken?: string | null;
  sessionKey?: string | null;
  userId: string;
  serviceChatId: string;     // exact service_chats.id for both the RPC and storage path
  media?: NativeSocialComposerMedia | null;
  note?: string | null;
  petName?: string | null;
}): Promise<SubmitCareUpdateResult> {
  let photoUrl: string | null = null;
  let uploadedPath: string | null = null;
  try {
    if (options.media) {
      photoUrl = await uploadNativeServiceCareEvidenceImage({
        accessToken: options.accessToken,
        media: options.media,
        scope: "update",
        serviceChatId: options.serviceChatId,
        sessionKey: options.sessionKey,
        userId: options.userId,
      });
      uploadedPath = uploadedCareEvidencePath(photoUrl);
    }
    const { data, error } = await nativeExactTokenRpc<{ ok?: boolean; update_kind?: string | null; message?: Partial<SubmitCareUpdateMessage> | null }>("submit_service_care_update_by_service_id", {
      p_service_chat_id: options.serviceChatId,
      p_photo_url: photoUrl,
      p_note: (options.note || "").trim() || null,
      p_pet_name: (options.petName || "").trim() || null,
    }, options.accessToken);
    if (error) {
      if (uploadedPath) {
        void requestNativeStorageCleanupResult("service_care_evidence", uploadedPath, "submit_service_care_update_failed", options.accessToken);
      }
      const code = (error as { message?: string }).message || "";
      return { ok: false, code, message: careUpdateErrorMessage(code, "Unable to send this care update. Try again.") };
    }
    if (data?.ok !== true) {
      if (uploadedPath) {
        void requestNativeStorageCleanupResult("service_care_evidence", uploadedPath, "submit_service_care_update_failed", options.accessToken);
      }
      return { ok: false, code: "care_update_not_confirmed", message: "Unable to send this care update. Try again." };
    }
    const message = data.message && typeof data.message === "object"
      ? {
        id: String(data.message.id || ""),
        chat_id: typeof data.message.chat_id === "string" ? data.message.chat_id : null,
        sender_id: String(data.message.sender_id || ""),
        content: String(data.message.content || ""),
        created_at: String(data.message.created_at || new Date().toISOString()),
      }
      : null;
    return { ok: true, message: message?.id && message.sender_id && message.content ? message : null };
  } catch (error) {
    if (uploadedPath) {
      void requestNativeStorageCleanupResult("service_care_evidence", uploadedPath, "submit_service_care_update_failed", options.accessToken);
    }
    const code = error instanceof Error ? error.message : "";
    return { ok: false, code, message: careUpdateErrorMessage(code, "Unable to send this care update. Try again.") };
  }
}
