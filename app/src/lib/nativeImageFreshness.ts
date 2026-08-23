const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const nativeFreshImageUri = (uri: string | null | undefined, version?: string | number | null) => {
  const cleanUri = cleanString(uri);
  if (!cleanUri) return "";
  if (/^(data:|blob:|file:)/i.test(cleanUri)) return cleanUri;
  const cleanVersion = cleanString(version);
  if (!cleanVersion) return cleanUri;
  if (cleanVersion === cleanUri) return cleanUri;
  return `${cleanUri}${cleanUri.includes("?") ? "&" : "?"}huddle_v=${encodeURIComponent(cleanVersion)}`;
};

export const nativeFreshImageKey = (uri: string | null | undefined, version?: string | number | null) => {
  const cleanUri = cleanString(uri);
  const cleanVersion = cleanString(version);
  return cleanVersion ? `${cleanUri}:${cleanVersion}` : cleanUri;
};

export const nativeMutableImageVersion = (uri: string | null | undefined, updatedAt?: string | number | null) => {
  const cleanUri = cleanString(uri);
  const cleanUpdatedAt = cleanString(updatedAt);
  if (!cleanUri) return "";
  return cleanUpdatedAt ? `${cleanUri}:${cleanUpdatedAt}` : cleanUri;
};
