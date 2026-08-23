import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { normalizeNativeCountryLabel } from "./nativeLocation";
import { requestNativeContactPermissionDetail } from "./nativeContactPermissions";

export type NativeContactFriend = { userId: string; contactKey: string; localName: string; requestSent: boolean };
export type NativeContactFriendRequest = { requestId: string; inviterId: string; displayName: string; createdAt: string; source: "qr_code" | "contact_list" };
export type NativeContactFriendResponse = { roomId: string | null; targetUserId: string; accepted: boolean };

type NativeContactFriendScan = { permission: Contacts.PermissionStatus; friends: NativeContactFriend[] };

const CONTACT_SCAN_CACHE_MS = 5 * 60 * 1000;
const CONTACT_HASH_BATCH_SIZE = 50;
let contactScanCache: { accessToken: string | null; countryCode?: CountryCode; expiresAt: number; value: NativeContactFriendScan } | null = null;
let contactScanInFlight: { accessToken: string | null; countryCode?: CountryCode; promise: Promise<NativeContactFriendScan> } | null = null;

const requireRpc = async <T,>(name: string, params: Record<string, unknown>, accessToken?: string | null) => {
  const { data, error } = await nativeExactTokenRpc<T>(name, params, accessToken);
  if (error) throw new Error(error.message || name);
  return data as T;
};

export const setNativeContactDiscovery = (enabled: boolean, accessToken?: string | null) =>
  requireRpc<boolean>("set_native_contact_discovery", { p_enabled: enabled }, accessToken);

export const resolveNativeContactCountryCode = (value?: string | null): CountryCode | undefined => {
  const normalized = normalizeNativeCountryLabel(value)?.code || String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized as CountryCode : undefined;
};

export async function findNativeContactFriends(accessToken?: string | null, defaultCountry?: string | null) {
  const token = accessToken || null;
  const countryCode = resolveNativeContactCountryCode(defaultCountry);
  if (contactScanCache
    && contactScanCache.expiresAt > Date.now()
    && contactScanCache.accessToken === token
    && contactScanCache.countryCode === countryCode) return contactScanCache.value;
  if (contactScanInFlight
    && contactScanInFlight.accessToken === token
    && contactScanInFlight.countryCode === countryCode) return contactScanInFlight.promise;

  const promise = scanNativeContactFriends(token, countryCode);
  contactScanInFlight = { accessToken: token, countryCode, promise };
  try {
    const value = await promise;
    if (value.permission === "granted") contactScanCache = { accessToken: token, countryCode, expiresAt: Date.now() + CONTACT_SCAN_CACHE_MS, value };
    return value;
  } finally {
    if (contactScanInFlight?.promise === promise) contactScanInFlight = null;
  }
}

async function scanNativeContactFriends(accessToken: string | null, countryCode?: CountryCode): Promise<NativeContactFriendScan> {
  const permission = await requestNativeContactPermissionDetail();
  if (permission.status !== "granted") return { permission: permission.status, friends: [] as NativeContactFriend[] };
  const result = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] });
  const namesByDigits = new Map<string, string>();
  for (const contact of result.data) {
    for (const phone of contact.phoneNumbers || []) {
      const parsed = parsePhoneNumberFromString(phone.number || "", countryCode);
      if (!parsed?.isValid()) continue;
      const digits = parsed.number.replace(/\D/g, "");
      if (!namesByDigits.has(digits)) namesByDigits.set(digits, contact.name || "Contact");
    }
  }
  const names = new Map<string, string>();
  const uniqueContacts = [...namesByDigits.entries()].slice(0, 1000);
  for (let offset = 0; offset < uniqueContacts.length; offset += CONTACT_HASH_BATCH_SIZE) {
    const batch = uniqueContacts.slice(offset, offset + CONTACT_HASH_BATCH_SIZE);
    const hashes = await Promise.all(batch.map(([digits]) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digits)));
    hashes.forEach((key, index) => names.set(key, batch[index][1]));
  }
  const keys = [...names.keys()].slice(0, 1000);
  const rows = keys.length ? await requireRpc<Array<{ user_id: string; contact_key: string; request_sent: boolean }>>(
    "find_native_contact_friends", { p_contact_keys: keys }, accessToken,
  ) : [];
  return {
    permission: permission.status,
    friends: (rows || []).map((row) => ({ userId: row.user_id, contactKey: row.contact_key, localName: names.get(row.contact_key) || "Contact", requestSent: row.request_sent === true })),
  };
}

export const sendNativeContactFriendRequest = (inviteeId: string, contactKey: string, accessToken?: string | null) =>
  requireRpc<string>("send_native_contact_friend_request", { p_contact_key: contactKey, p_invitee_id: inviteeId }, accessToken)
    .then((requestId) => {
      if (contactScanCache?.accessToken === (accessToken || null)) {
        contactScanCache.value = {
          ...contactScanCache.value,
          friends: contactScanCache.value.friends.map((friend) => friend.userId === inviteeId ? { ...friend, requestSent: true } : friend),
        };
      }
      return requestId;
    });

export async function getMyNativeContactFriendRequests(accessToken?: string | null) {
  const rows = await requireRpc<Array<{ request_id: string; inviter_id: string; display_name: string; created_at: string; source: string }>>(
    "get_my_native_contact_friend_requests", {}, accessToken,
  );
  return (rows || []).map((row) => ({
    requestId: row.request_id,
    inviterId: row.inviter_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    source: row.source === "qr_code" ? "qr_code" as const : "contact_list" as const,
  }));
}

export async function respondNativeContactFriendRequest(requestId: string, accept: boolean, accessToken?: string | null) {
  const rows = await requireRpc<Array<{ room_id: string | null; target_user_id: string; accepted: boolean }>>(
    "respond_native_contact_friend_request", { p_request_id: requestId, p_accept: accept }, accessToken,
  );
  const row = rows?.[0];
  if (!row) throw new Error("request_not_found");
  return { roomId: row.room_id, targetUserId: row.target_user_id, accepted: row.accepted } satisfies NativeContactFriendResponse;
}
