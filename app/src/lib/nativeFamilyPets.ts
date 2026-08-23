import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export type NativeFamilySharedPet = {
  id: string;
  owner_id: string;
  name: string;
  species: string;
  breed?: string | null;
  photo_url?: string | null;
  photo_presentation?: { home?: { centerX?: number; centerY?: number; widthPct?: number; sourceAspect?: number } } | null;
  weight?: number | null;
  weight_unit?: string | null;
  dob?: string | null;
  is_active?: boolean | null;
  updated_at?: string | null;
  is_family_shared?: boolean;
  shared_by_display_name?: string | null;
};

export type NativeFamilyPetContext = {
  code?: string | null;
  family_linked: boolean;
  can_share_with_family: boolean;
  is_creator: boolean;
  is_family_shared: boolean;
};

const nativeFamilyRpc = async <T,>(fn: string, params: Record<string, unknown>, accessToken?: string | null) => {
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, accessToken);
  if (error) throw error;
  return data as T;
};

export const fetchNativeFamilySharedPetCandidates = (accessToken?: string | null) =>
  nativeFamilyRpc<NativeFamilySharedPet[]>("get_native_family_shared_pet_candidates", {}, accessToken);

export const addNativeFamilySharedPets = (petIds: string[], accessToken?: string | null) =>
  nativeFamilyRpc<{ code?: string; added_count?: number }>("add_native_family_shared_pets", { p_pet_ids: petIds }, accessToken);

export const removeNativeFamilySharedPet = (petId: string, accessToken?: string | null) =>
  nativeFamilyRpc<{ code?: string }>("remove_native_family_shared_pet", { p_pet_id: petId }, accessToken);

export const fetchNativeAccessiblePets = (accessToken?: string | null) =>
  nativeFamilyRpc<NativeFamilySharedPet[]>("get_native_accessible_pets", {}, accessToken);

export const fetchNativeAccessiblePet = (petId: string, accessToken?: string | null) =>
  nativeFamilyRpc<Record<string, unknown> | null>("get_native_accessible_pet", { p_pet_id: petId }, accessToken);

export const fetchNativeFamilyPetContext = (petId?: string | null, accessToken?: string | null) =>
  nativeFamilyRpc<NativeFamilyPetContext>("get_native_family_pet_context", { p_pet_id: petId || null }, accessToken);
