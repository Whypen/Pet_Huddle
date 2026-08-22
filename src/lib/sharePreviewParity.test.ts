import { describe, expect, it } from "vitest";
import {
  buildAlertArea as serverArea,
  buildAlertPreviewTitle as serverAlertTitle,
  buildSharePreviewDescription as serverDescription,
  buildSharePreviewTitle as serverTitle,
} from "../../api/share";
import {
  buildAlertArea as clientArea,
  buildAlertPreviewTitle as clientAlertTitle,
  buildSharePreviewDescription as clientDescription,
  buildSharePreviewTitle as clientTitle,
} from "../../app/src/lib/sharePreview";

/**
 * ONE ALERT, ONE SENTENCE, WHEREVER IT IS SHOWN.
 *
 * `api/share.ts` is a Vercel function and cannot import across the app
 * boundary, so the preview grammar exists twice: once for external link
 * unfurls, once for internal huddle chat cards. Twice is only safe while the
 * two are provably identical — a reader must not see a Lost alert described
 * one way in WhatsApp and another way in a huddle chat.
 *
 * This suite is that proof. It fails the moment either copy drifts.
 */

const IDENTITIES: Array<[string | null, string | null]> = [
  ["Sam", "sam"], ["Sam", null], [null, "sam"], [null, null],
  ["Sam", "@sam"], ["  ", "  "], ["Ana María", "ana.maria"],
];

const SNIPPETS = [
  null, "", "   ",
  "Mochi finally learned to sit for treats today",
  "Check https://example.com and\nthis second line too",
  "A caption long enough to be cut somewhere sensible rather than mid-word, which is the entire point of the soft truncation helper",
  "Nospacesatallinthisonesoitcannotbreakonawordboundaryandmustfallbacktothehardcut",
];

const ALERTS = [
  { alertType: "Lost", petType: "Cat", area: "Kowloon City, Hong Kong", headline: "Ginger tabby, answers to Mochi" },
  { alertType: "Stray", petType: "Dog", area: "Sham Shui Po", headline: "Limping brown mongrel near the market" },
  { alertType: "Caution", petType: null, area: "Mid-Levels", headline: "Aggressive dog off-leash at the park steps" },
  { alertType: "Others", petType: null, area: "", headline: "Road closed after flooding" },
  { alertType: "unknown-type", petType: "Rabbit", area: "Tai Po", headline: "" },
  { alertType: "Lost", petType: "Cat", area: "Kowloon City", headline: "Ginger tabby", archived: true },
  { alertType: "", petType: "", area: "", headline: "" },
  { alertType: "Lost", petType: "CAT", area: "Kowloon City", headline: "A headline long enough that the composed alert line must be truncated at a word boundary" },
];

const AREAS: Array<[string | null, string | null]> = [
  ["Kowloon City", "Hong Kong"], ["Kowloon City", "Kowloon City"],
  ["Kowloon City", "kowloon city"], [null, "Hong Kong"], ["Kowloon City", null],
  [null, null], ["  ", " Hong Kong "],
];

describe("share preview grammar parity", () => {
  it("titles match for every identity and snippet", () => {
    for (const [name, social] of IDENTITIES) {
      for (const snippet of SNIPPETS) {
        expect(serverTitle(name, social, snippet)).toBe(clientTitle(name, social, snippet));
      }
    }
  });

  it("descriptions match for every snippet", () => {
    for (const snippet of SNIPPETS) {
      expect(serverDescription(snippet)).toBe(clientDescription(snippet));
    }
  });

  it("alert titles match for every type, species, area and state", () => {
    for (const alert of ALERTS) {
      expect(serverAlertTitle(alert)).toBe(clientAlertTitle(alert));
    }
  });

  it("area composition matches, including the dedupe", () => {
    for (const [district, city] of AREAS) {
      expect(serverArea(district, city)).toBe(clientArea(district, city));
    }
  });

  it("holds the grammar itself, so parity cannot be satisfied by two wrongs", () => {
    expect(clientAlertTitle(ALERTS[0])).toBe("Lost cat in Kowloon City, Hong Kong: Ginger tabby, answers to Mochi");
    expect(clientAlertTitle(ALERTS[2])).toBe("Caution in Mid-Levels: Aggressive dog off-leash at the park steps");
    expect(clientAlertTitle(ALERTS[3])).toBe("Alert on huddle: Road closed after flooding");
    expect(clientAlertTitle(ALERTS[5])).toBe("Resolved — Lost cat in Kowloon City: Ginger tabby");
    expect(clientArea("Kowloon City", "kowloon city")).toBe("Kowloon City");
  });
});
