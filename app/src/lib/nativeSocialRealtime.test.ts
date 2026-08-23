import { describe, expect, it } from "vitest";
import { NATIVE_SOCIAL_GLOBAL_REALTIME_TOPIC, nativeSocialRealtimeTopic } from "./nativeSocialRealtime";

// Client half of a cross-boundary contract: this value is the verified output of
// private.social_realtime_topic() in Postgres. Drift stops new-post pings silently —
// no error, the publisher just writes to a topic nobody listens on.
describe("nativeSocialRealtimeTopic", () => {
  it("is a single global topic matching private.social_realtime_topic()", () => {
    expect(nativeSocialRealtimeTopic()).toBe("social:global");
    expect(NATIVE_SOCIAL_GLOBAL_REALTIME_TOPIC).toBe("social:global");
  });

  it("never varies by reader or post, so an alert cross-post cannot miss its audience", () => {
    // Regression guard: alert threads are inserted with post_country NULL. When the
    // topic was country-scoped they published to social:global while readers listened
    // on social:<country>, so an open Social screen got no signal.
    const readerA = nativeSocialRealtimeTopic();
    const readerB = nativeSocialRealtimeTopic();
    expect(readerA).toBe(readerB);
  });
});
