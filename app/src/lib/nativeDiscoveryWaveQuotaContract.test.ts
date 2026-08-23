import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeNativeStableDiscoveryDeck,
  nativeDiscoveryCycleIsActive,
  nativeDiscoveryCycleStartedAtStorageKey,
  nativeDiscoveryPassedCycleStorageKey,
  nativeDiscoveryStableDeckStorageKey,
  nativeDiscoveryTailRefillAttemptKey,
  selectNativeDailyUnpassedProfiles,
  shouldRefillNativeDiscoveryTail,
} from "./nativeDiscoveryDeckPolicy";
import { getQuotaCapsForTier } from "./quotaConfig_v1";

const repoRoot = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("native Discover Wave allowance", () => {
  it("uses 10 Free Waves, 20 Plus Waves, and unlimited Gold Waves", () => {
    expect(getQuotaCapsForTier("free").discoveryViewsPerDay).toBe(10);
    expect(getQuotaCapsForTier("plus").discoveryViewsPerDay).toBe(20);
    expect(getQuotaCapsForTier("gold").discoveryViewsPerDay).toBeNull();
  });

  it("commits Wave quota and relationship in one retry-safe RPC", () => {
    const source = read("app/src/screens/NativeChatsScreen.tsx");
    const client = read("app/src/lib/nativePublicProfile.ts");
    expect(source).not.toContain("check_and_increment_discovery_wave_quota");
    expect(client).toContain('"send_native_discovery_wave_atomic"');
    expect(client).not.toContain('"send_discovery_wave"');
    const starBlock = source.slice(source.indexOf("const executeConfirmedStar"), source.indexOf("const handleDiscoverRefresh"));
    const passBlock = source.slice(source.indexOf("const handlePassDiscovery"), source.indexOf("const handleWaveDiscoveryIntent"));
    expect(starBlock).not.toContain("bumpNativeDiscoverySeen");
    expect(passBlock).not.toContain("bumpNativeDiscoverySeen");
    expect(source).not.toContain("discoveryQuotaLocked");
  });

  it("ships an atomic database contract with matching tier limits", () => {
    const sql = read("supabase/migrations/20260719020000_discovery_fixed_24h_cycle.sql");
    expect(sql).toContain("when viewer_tier = 'plus' then 20 else 10");
    expect(sql).toMatch(/viewer_tier = 'gold'[\s\S]*return true/);
    expect(sql).toMatch(/select \* into quota_row[\s\S]*for update/);
    expect(sql).toMatch(/discovery_views_today >= daily_limit[\s\S]*return false/);
    expect(sql).toMatch(/discovery_views_today := quota_row\.discovery_views_today \+ 1/);
    expect(sql).toContain("discovery_cycle_started_at + interval '24 hours' <= now()");
  });
});

describe("native Discover fixed 24-hour stable deck policy", () => {
  const cards = (...ids: string[]) => ids.map((id) => ({ id, payload: `snapshot-${id}` }));

  it("expires exactly 24 hours after the fixed cycle start", () => {
    const startedAt = "2026-07-18T16:00:00.000Z";
    const startMs = Date.parse(startedAt);
    expect(nativeDiscoveryCycleIsActive(startedAt, startMs)).toBe(true);
    expect(nativeDiscoveryCycleIsActive(startedAt, startMs + 24 * 60 * 60 * 1000 - 1)).toBe(true);
    expect(nativeDiscoveryCycleIsActive(startedAt, startMs + 24 * 60 * 60 * 1000)).toBe(false);
    expect(nativeDiscoveryCycleIsActive(null, startMs)).toBe(false);
    expect(nativeDiscoveryPassedCycleStorageKey("user")).toContain("discovery-passed-cycle");
    expect(nativeDiscoveryCycleStartedAtStorageKey("user")).toContain("discovery-cycle-started-at");
    expect(nativeDiscoveryStableDeckStorageKey("user")).toContain("discovery-stable-deck");
  });

  it("keeps one server-owned cycle for every tier, including unlimited Gold", () => {
    const source = read("app/src/screens/NativeChatsScreen.tsx");
    const sql = read("supabase/migrations/20260725110100_native_discovery_wave_atomic.sql");
    expect(sql).toContain("public.check_and_increment_discovery_wave_quota()");
    expect(sql).toContain("public.send_discovery_wave(p_target_user_id)");
    expect(sql).toContain("native_discovery_action_receipts");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("excludes every card passed today without falling back to it", () => {
    const eligible = cards("A", "B", "C", "D", "E");
    expect(selectNativeDailyUnpassedProfiles(eligible, new Set(["A", "C", "E"]))).toEqual(cards("B", "D"));
    expect(selectNativeDailyUnpassedProfiles(eligible, new Set(["A", "B", "C", "D", "E"]))).toEqual([]);
  });

  it("preserves the committed prefix by identity and appends only unique newcomers", () => {
    const current = cards("A", "B", "C", "D");
    const incoming = cards("C", "D", "E", "E", "F", "G", "H", "I");
    const merged = mergeNativeStableDiscoveryDeck(current, incoming);
    expect(merged.map((card) => card.id)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(merged.slice(0, 4).every((card, index) => card === current[index])).toBe(true);
  });

  it("never mutates the visible deck or incoming results", () => {
    const current = Object.freeze(cards("A", "B", "C", "D"));
    const incoming = Object.freeze(cards("D", "E", "F"));
    const currentBefore = JSON.stringify(current);
    const incomingBefore = JSON.stringify(incoming);
    mergeNativeStableDiscoveryDeck([...current], [...incoming]);
    expect(JSON.stringify(current)).toBe(currentBefore);
    expect(JSON.stringify(incoming)).toBe(incomingBefore);
  });

  it("refills at one through four cards, never at zero or five-plus", () => {
    const base = { loadSettled: true, loading: false, visible: true };
    expect(shouldRefillNativeDiscoveryTail({ ...base, deckLength: 0 })).toBe(false);
    for (const deckLength of [1, 2, 3, 4]) expect(shouldRefillNativeDiscoveryTail({ ...base, deckLength })).toBe(true);
    for (const deckLength of [5, 6, 7, 8]) expect(shouldRefillNativeDiscoveryTail({ ...base, deckLength })).toBe(false);
  });

  it("does not refill while hidden, loading, or unsettled", () => {
    expect(shouldRefillNativeDiscoveryTail({ deckLength: 4, loadSettled: true, loading: false, visible: false })).toBe(false);
    expect(shouldRefillNativeDiscoveryTail({ deckLength: 4, loadSettled: true, loading: true, visible: true })).toBe(false);
    expect(shouldRefillNativeDiscoveryTail({ deckLength: 4, loadSettled: false, loading: false, visible: true })).toBe(false);
  });

  it("produces one attempt key per exact cycle and remaining order", () => {
    const firstCycle = "2026-07-19T00:00:00.000Z";
    const nextCycle = "2026-07-20T00:00:00.000Z";
    expect(nativeDiscoveryTailRefillAttemptKey(firstCycle, ["A", "B"])).toBe(nativeDiscoveryTailRefillAttemptKey(firstCycle, ["A", "B"]));
    expect(nativeDiscoveryTailRefillAttemptKey(firstCycle, ["A", "B"])).not.toBe(nativeDiscoveryTailRefillAttemptKey(firstCycle, ["B", "A"]));
    expect(nativeDiscoveryTailRefillAttemptKey(firstCycle, ["A", "B"])).not.toBe(nativeDiscoveryTailRefillAttemptKey(nextCycle, ["A", "B"]));
  });
});
