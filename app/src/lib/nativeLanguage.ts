import { useCallback } from "react";

import enCopy from "../i18n/en.json";
import zhTwCopy from "../i18n/zh-TW.json";

type CopyMap = Record<string, string>;

const dictionaries: Record<string, CopyMap> = {
  en: enCopy as CopyMap,
  "zh-TW": zhTwCopy as CopyMap,
};

const normalizeLocale = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (/^zh[-_]?tw$/i.test(raw) || /^zh[-_]?hk$/i.test(raw) || /^zh[-_]?hant/i.test(raw)) return "zh-TW";
  return "en";
};

export function useLanguage() {
  const language = normalizeLocale(process.env.EXPO_PUBLIC_HUDDLE_LOCALE);
  const t = useCallback((key: string) => dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key, [language]);
  return { language, t };
}
