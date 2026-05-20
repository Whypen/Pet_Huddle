import AsyncStorage from "@react-native-async-storage/async-storage";

const PASSKEY_ENABLED_EMAILS_KEY = "huddle:native:passkey-enabled-emails";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const readEmailList = async () => {
  try {
    const raw = await AsyncStorage.getItem(PASSKEY_ENABLED_EMAILS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const writeEmailList = async (emails: string[]) => {
  const unique = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean))).slice(-20);
  await AsyncStorage.setItem(PASSKEY_ENABLED_EMAILS_KEY, JSON.stringify(unique));
};

export const hasNativePasskeyAccountHint = async (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const emails = await readEmailList();
  return emails.includes(normalized);
};

export const setNativePasskeyAccountHint = async (email: string, enabled: boolean) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const emails = await readEmailList();
  if (enabled) {
    await writeEmailList([...emails, normalized]);
    return;
  }
  await writeEmailList(emails.filter((entry) => entry !== normalized));
};
