/**
 * HTML escaping for the server-rendered share pages.
 *
 * Extracted so `_alertPage.ts` and `share.ts` cannot drift into two different
 * escapes — everything rendered on these pages is attacker-influenced text
 * (alert titles and descriptions are user-written), so one implementation is
 * the point.
 */

export const escapeHtml = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
