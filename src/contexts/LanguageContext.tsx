export type Language = "en";

type TranslateVars = Record<string, string | number>;

const ENGLISH_COPY: Record<string, string> = {
  "settings.privacy_policy": "Privacy Policy",
  "settings.terms": "Terms of Service",
  "settings.title": "Settings",
  "settings.account_settings": "Account Settings",
  "settings.profile": "Profile",
  "settings.account_security": "Account & Security",
  "settings.pending": "Identity pending",
  "settings.verified_badge": "Verified huddler",
  "social.verified": "Verified",
  "social.wave": "Wave",
  "social.support": "Support",
  "social.match": "Double Wave!",
  "social.user.marcus.name": "Marcus",
  "social.user.emma.name": "Emma",
  "social.user.james.name": "James",
  "map.distance_km": "{count} km",
  "map.distance_km_max": "{count}+ km",
  "nav.home": "Home",
  "nav.social": "Social",
  "nav.chats": "Chats",
  "nav.ai_vet": "AI Vet",
  "nav.map": "Map",
  "app.name": "huddle",
};

const humanizeKey = (key: string) => {
  if (!key.includes(".")) return key;

  const leaf = key.split(".").at(-1) || key;
  return leaf
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const interpolate = (template: string, vars?: TranslateVars) => {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
};

const t = (key: string, vars?: TranslateVars) => {
  const template = ENGLISH_COPY[key] ?? humanizeKey(key);
  return interpolate(template, vars);
};

export const useLanguage = () => ({
  language: "en" as const,
  setLanguage: () => undefined,
  t,
});
