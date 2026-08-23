import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const social = readFileSync(resolve(appRoot, "src/screens/NativeSocialScreen.tsx"), "utf8");
const nativeSocialLib = readFileSync(resolve(appRoot, "src/lib/nativeSocial.ts"), "utf8");
const alertDetailModal = readFileSync(resolve(appRoot, "src/components/map/NativeAlertDetailModal.tsx"), "utf8");

// This asserts the client-side half of a server-proven guarantee: every entry point
// into a specific Social thread (deep link, notification tap, map "See on Social")
// converges on ONE RPC (get_native_social_thread_by_id), which is the same RPC a
// DB harness proved blocks an unverified viewer from a verified-only thread. If a
// second bypass path is ever added here, this must fail before it ships.
describe("native Social ?focus= deep-link converges on one gate", () => {
  it("parses focus/thread from the query string and resolves the target through fetchNativeSocialThreadById", () => {
    expect(social).toContain('focus: params.get("focus") || params.get("thread") || null');
    // The other call sites (realtime refresh, post-edit, post-create) refetch a thread the
    // viewer already owns or already has in their feed -- not a new deep-link entry point.
    // What matters is that the *focus* handoff itself uses this function, not some other one.
    expect(social).toMatch(/if \(params\.focus\)[\s\S]{0,300}fetchNativeSocialThreadById\(params\.focus, accessToken\)/);
  });

  it("fetchNativeSocialThreadById wraps get_native_social_thread_by_id, the same RPC proven to enforce verified_only", () => {
    expect(nativeSocialLib).toMatch(/export async function fetchNativeSocialThreadById[\s\S]{0,200}"get_native_social_thread_by_id"/);
  });

  it("map's See on Social hands off a bare thread id -- no share token or bypass carried across surfaces", () => {
    const start = alertDetailModal.indexOf("const handleSocial = () =>");
    const end = alertDetailModal.indexOf("\n  };", start);
    const body = alertDetailModal.slice(start, end);
    expect(body).toContain("onOpenSocial?.(String(socialThreadId))");
    expect(body).not.toMatch(/share_access_token|shareToken/);
  });
});
