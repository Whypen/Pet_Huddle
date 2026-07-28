import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { missingScopes, randomToken, sha256 } from "./huddleGrowth.ts";

Deno.test("Growth Agent scope checks are case-insensitive and fail closed", () => {
  assertEquals(missingScopes(["ADS_READ", "pages_manage_posts"], ["ads_read"]), []);
  assertEquals(missingScopes(["ads_read"], ["ads_management", "leads_retrieval"]), ["ads_management", "leads_retrieval"]);
});

Deno.test("Growth Agent state hashes are stable and non-reversible", async () => {
  const hash = await sha256("huddle-growth-state");
  assertMatch(hash, /^[a-f0-9]{64}$/);
  assertEquals(hash, await sha256("huddle-growth-state"));
  assert(hash !== "huddle-growth-state");
});

Deno.test("Growth Agent OAuth state tokens are URL-safe", () => {
  const token = randomToken(24);
  assertMatch(token, /^[A-Za-z0-9_-]+$/);
});
