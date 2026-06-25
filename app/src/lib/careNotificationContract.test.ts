import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards against the two "schema/code drift" regressions found 2026-06-25, both of
// which silently rolled back the entire care-booking transaction (no UI signal):
//   1. insert_care_agreement_notification() inserted type 'service_booking', which
//      was missing from the notifications_type_check allow-list -> every quote,
//      signature, and booking confirmation rolled back.
//   2. can_deliver_notification() referenced notification_preferences.vet / .email
//      after those columns were renamed to care / systems -> every care/systems
//      notification (incl. send_service_request) rolled back.
// Both are statically checkable from the migration SQL, which is the source applied
// to prod. notification_type allow-lists are append-only, so "every type ever passed
// to the helper must be in the latest allow-list" is a robust, low-false-positive
// invariant.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = resolve(root, "supabase/migrations");
const allSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort() // timestamp-prefixed -> chronological
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

// Parse the argument list of a SQL function call starting at the '(' index,
// respecting single-quoted strings (incl. '' escapes) and nested parens.
const callArgsAt = (src: string, openParen: number): string[] => {
  const args: string[] = [];
  let cur = "";
  let depth = 0;
  let inStr = false;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (src[i + 1] === "'") { cur += "'"; i++; } else { inStr = false; }
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") { depth++; if (depth === 1) continue; cur += c; continue; }
    if (c === ")") { depth--; if (depth === 0) { args.push(cur.trim()); break; } cur += c; continue; }
    if (c === "," && depth === 1) { args.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  return args;
};

const latestAllowedNotificationTypes = (): Set<string> => {
  const re = /add constraint notifications_type_check\s+check\s*\(\s*type\s*=\s*any\s*\(\s*array\[([\s\S]*?)\]/gi;
  let last: string | null = null;
  for (const m of allSql.matchAll(re)) last = m[1];
  if (!last) throw new Error("notifications_type_check allow-list not found in migrations");
  return new Set([...last.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
};

// type is the 6th positional arg (index 5) of insert_care_agreement_notification(...)
const careNotificationTypesUsed = (): Set<string> => {
  const used = new Set<string>();
  for (const m of allSql.matchAll(/insert_care_agreement_notification\s*\(/gi)) {
    const openParen = (m.index ?? 0) + m[0].length - 1;
    const args = callArgsAt(allSql, openParen);
    const lit = (args[5] || "").match(/^'([a-z_]+)'$/);
    if (lit) used.add(lit[1]);
  }
  return used;
};

const latestFunctionBody = (name: string): string => {
  const re = new RegExp(`create or replace function public\\.${name}\\b`, "gi");
  let lastIdx = -1;
  for (const m of allSql.matchAll(re)) lastIdx = m.index ?? lastIdx;
  if (lastIdx < 0) throw new Error(`function ${name} not found in migrations`);
  const after = allSql.slice(lastIdx);
  const tag = after.match(/\$[a-zA-Z_]*\$/)?.[0];
  if (!tag) throw new Error(`dollar-quoted body for ${name} not found`);
  const start = after.indexOf(tag);
  const end = after.indexOf(tag, start + tag.length);
  return after.slice(start, end + tag.length);
};

describe("care notification schema/code drift guard", () => {
  it("every notification type passed to insert_care_agreement_notification is in the latest allow-list", () => {
    const allowed = latestAllowedNotificationTypes();
    const used = careNotificationTypesUsed();
    expect(used.size, "expected to find care notification type literals").toBeGreaterThan(0);
    const missing = [...used].filter((t) => !allowed.has(t));
    expect(missing, `notification type(s) not permitted by notifications_type_check: ${missing.join(", ")}`).toEqual([]);
  });

  it("service_booking is permitted (the 2026-06-25 booking-flow regression)", () => {
    expect(latestAllowedNotificationTypes().has("service_booking")).toBe(true);
  });

  it("can_deliver_notification references the renamed columns, not the dropped ones", () => {
    const body = latestFunctionBody("can_deliver_notification");
    // renamed-away columns must not be referenced as record fields
    expect(/v_pref\.vet\b/.test(body), "can_deliver_notification still references dropped column v_pref.vet").toBe(false);
    expect(/v_pref\.email\b/.test(body), "can_deliver_notification still references dropped column v_pref.email").toBe(false);
    // current columns must be referenced
    expect(/v_pref\.care\b/.test(body)).toBe(true);
    expect(/v_pref\.systems\b/.test(body)).toBe(true);
  });
});
