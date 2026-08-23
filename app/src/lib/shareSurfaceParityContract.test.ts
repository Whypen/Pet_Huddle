import { describe, expect, it } from "vitest";
import { buildShareModel } from "./shareModel";

/**
 * INTERNAL AND EXTERNAL SAY THE SAME THING.
 *
 * The same alert can travel two ways: out to WhatsApp as a link unfurl, or into
 * a huddle chat as a share card. They are rendered by different code on
 * different machines, and before this they disagreed — the chat card said
 * "Sam (@sam) on huddle" for a missing cat, which is the one fact a reader does
 * not need.
 *
 * `sharePreviewParity.test.ts` proves the two GRAMMARS are identical.
 * This suite proves the chat card actually USES the alert grammar.
 */

const ALERT = {
  origin: "https://huddle.pet",
  contentType: "alert" as const,
  contentId: "a-1",
  surface: "Map" as const,
  displayName: "Sam",
  socialId: "sam",
};

describe("map alert shared into a huddle chat", () => {
  it("says what the alert is, not who posted it", () => {
    const share = buildShareModel({
      ...ALERT,
      alertHeadline: "Ginger tabby, answers to Mochi",
      alertType: "Lost",
      contentSnippet: "Slipped out of the window last night.",
      incidentDistrict: "Kowloon City",
      petType: "Cat",
    });
    expect(share.title).toBe("Lost cat in Kowloon City: Ginger tabby, answers to Mochi");
    expect(share.title).not.toContain("@sam");
  });

  it("keeps attribution on its own line, where it belongs", () => {
    const share = buildShareModel({ ...ALERT, alertType: "Lost", petType: "Cat", incidentDistrict: "Kowloon City" });
    // The card shows WHO above WHAT — the two lines complement, never duplicate.
    expect(share.chatHeadline).toBe("Sam (@sam) on huddle's Map");
    expect(share.title).toBe("Lost cat in Kowloon City");
  });

  it("drops the species slot for Caution, as the alert composer never collects one", () => {
    const share = buildShareModel({
      ...ALERT,
      alertHeadline: "Aggressive dog off-leash at the park steps",
      alertType: "Caution",
      incidentDistrict: "Mid-Levels",
      petType: null,
    });
    expect(share.title).toBe("Caution in Mid-Levels: Aggressive dog off-leash at the park steps");
  });

  it("falls back to the brand line when the district is unknown", () => {
    const share = buildShareModel({ ...ALERT, alertHeadline: "Road closed", alertType: "Others" });
    expect(share.title).toBe("Alert on huddle: Road closed");
  });
});

describe("alert-derived post shared into a huddle chat", () => {
  const POST = {
    origin: "https://huddle.pet",
    contentType: "thread" as const,
    contentId: "t-2",
    surface: "Social" as const,
    displayName: "Sam",
    socialId: "sam",
  };

  it("reads as the alert while still opening the post", () => {
    const share = buildShareModel({
      ...POST,
      alertHeadline: "Ginger tabby, answers to Mochi",
      alertType: "Lost",
      contentSnippet: "Please help us find Mochi",
      incidentDistrict: "Kowloon City",
    });
    expect(share.title).toBe("Lost in Kowloon City: Ginger tabby, answers to Mochi");
    // Same look, different door: the link still resolves to the post.
    expect(share.canonicalUrl).toBe("https://huddle.pet/share/t-2");
    expect(share.appUrl).toContain("/threads?focus=t-2");
  });

  it("marks a found pet as resolved without losing the subject", () => {
    const share = buildShareModel({
      ...POST,
      alertHeadline: "Ginger tabby, answers to Mochi",
      alertType: "Lost",
      archived: true,
      incidentDistrict: "Kowloon City",
    });
    expect(share.title).toBe("Resolved — Lost in Kowloon City: Ginger tabby, answers to Mochi");
  });

  it("leaves an ordinary post on the identity grammar", () => {
    const share = buildShareModel({ ...POST, contentSnippet: "Mochi learned to sit today" });
    expect(share.title).toBe("Sam (@sam): Mochi learned to sit today");
  });
});
