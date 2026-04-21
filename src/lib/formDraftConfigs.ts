export const FORM_DRAFT_VERSION = 1;

export type DraftMode = "local-only" | "local-and-remote";

export type DraftStatus =
  | "idle"
  | "saving"
  | "saved"
  | "offline_draft"
  | "error"
  | "restored";

export type StoredFormDraft<TDraft> = {
  version: number;
  form: TDraft;
  draft_updated_at: string;
  baseline_updated_at: string | null;
  baseline_hash: string | null;
};

const normalizeDraftSegment = (value: string | null | undefined): string =>
  String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, "");

export const buildFormDraftKey = (...segments: Array<string | null | undefined>): string =>
  segments
    .map(normalizeDraftSegment)
    .filter(Boolean)
    .join(":");

export const draftKeys = {
  setProfile: (owner: string | null | undefined) =>
    buildFormDraftKey("huddle", "draft", "setprofile", owner),
  editProfile: (userId: string | null | undefined) =>
    buildFormDraftKey("huddle", "draft", "editprofile", userId),
  setPetProfile: (owner: string | null | undefined, petTempKey: string | null | undefined) =>
    buildFormDraftKey("huddle", "draft", "setpetprofile", owner, petTempKey),
  editPetProfile: (userId: string | null | undefined, petId: string | null | undefined) =>
    buildFormDraftKey("huddle", "draft", "editpetprofile", userId, petId),
  carerProfile: (userId: string | null | undefined) =>
    buildFormDraftKey("huddle", "draft", "carerprofile", userId),
};

export const isPersistableImageUrl = (value: string | null | undefined): boolean =>
  /^https?:\/\//i.test(String(value || "").trim());

export const isPersistableStoragePath = (value: string | null | undefined): boolean => {
  const path = String(value || "").trim();
  if (!path) return false;
  if (/^(blob:|data:|https?:\/\/)/i.test(path)) return false;
  return true;
};

