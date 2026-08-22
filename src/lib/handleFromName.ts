/**
 * Handle (social_id) generation.
 *
 * `profiles.social_id` is NOT NULL with no default, and the plan is explicit
 * that nobody is asked to invent a unique handle at signup — it is derived from
 * the name with a uniqueness suffix and stays editable later in the profile
 * editor, which is where the app already offers an availability check.
 *
 * Length and charset match the editor's rule (EditProfile.tsx:1093):
 * `^[a-z0-9._]{6,15}$`, checked against `is_social_id_taken`.
 */

import { supabase } from "@/integrations/supabase/client";

export const HANDLE_MIN_LENGTH = 6;
export const HANDLE_MAX_LENGTH = 15;

/** Lower-cased, stripped to the charset the column accepts, padded to the minimum. */
export const seedHandleFromName = (name: string): string => {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, HANDLE_MAX_LENGTH);
  if (base.length >= HANDLE_MIN_LENGTH) return base;
  // Pad rather than reject: "Bo" is a real name and must not block signup.
  const padded = `${base}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/g, "");
  return padded.slice(0, Math.max(HANDLE_MIN_LENGTH, base.length + 4));
};

/**
 * A handle that is free at the time of checking, with a numeric suffix on
 * collision (the stem is trimmed so the result never exceeds the max).
 *
 * If the availability check itself fails we fall back to a random suffix rather
 * than blocking signup — the unique constraint is the real guarantee, and a
 * person who cannot finish signing up is the worse outcome.
 */
export const generateUniqueHandle = async (name: string): Promise<string> => {
  const seed = seedHandleFromName(name);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? "" : String(attempt + 1);
    const candidate = `${seed.slice(0, HANDLE_MAX_LENGTH - suffix.length)}${suffix}`;
    const { data: taken, error } = await supabase.rpc("is_social_id_taken", {
      p_social_id: candidate.toLowerCase(),
    });
    if (error) break;
    if (!taken) return candidate;
  }

  const random = Math.floor(1000 + Math.random() * 9000).toString();
  return `${seed.slice(0, HANDLE_MAX_LENGTH - random.length)}${random}`;
};
