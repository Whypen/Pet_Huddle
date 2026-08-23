import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import publicFeed from "../../api/public-feed";
import publicAlerts from "../../api/public-alerts";
import publicGroups from "../../api/public-groups";

type Captured = { code: number; body: Record<string, unknown> };
type SeenRequest = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

const makeRes = (captured: Captured) => ({
  setHeader: () => {},
  status: (code: number) => ({
    json: (body: unknown) => {
      captured.code = code;
      captured.body = body as Record<string, unknown>;
    },
  }),
});

const projectionRows = (url: string): unknown[] => {
  if (url.endsWith("/rpc/get_public_social_feed")) {
    return [{
      id: "t1", title: "Found a cat", content: "In the lobby", images: ["a.jpg"],
      likes: 3, created_at: "2026-08-01T00:00:00Z", category: "Pets",
      author_name: "Priya", author_avatar_url: "p.jpg", author_social_id: "priya01",
    }];
  }
  if (url.endsWith("/rpc/get_public_map_alerts")) {
    return [{
      id: "a1", alert_type: "Lost", area: "Sheung Wan",
      created_at: "2026-08-01T00:00:00Z", latitude: 22.2867, longitude: 114.1495,
    }];
  }
  if (url.endsWith("/rpc/get_public_groups_nearby")) {
    return [{
      id: "g1", name: "Sheung Wan Dogs", description: "Walks", cover_url: "c.jpg",
      area: "Sheung Wan", country: "Hong Kong", pet_focus: ["Dogs"], member_count: 2,
      next_event_title: "Sunday harbour walk",
      next_event_starts_at: "2026-08-09T02:00:00Z",
      next_event_ends_at: "2026-08-09T04:00:00Z",
    }, {
      id: "g2", name: "[UAT] Central test group", description: "Testing only", cover_url: "test.jpg",
      area: "Central", country: "Hong Kong", pet_focus: ["Dogs"], member_count: 1,
      next_event_title: null, next_event_starts_at: null, next_event_ends_at: null,
    }];
  }
  return [];
};

let seen: SeenRequest[];
const projectionRequest = () => seen.find((request) => !request.url.includes('consume_public_ingress_rate_limit'))!;

beforeEach(() => {
  seen = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const request = {
      url: String(url),
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
      headers: (init?.headers || {}) as Record<string, string>,
    };
    seen.push(request);
    if (request.url.endsWith('/rpc/consume_public_ingress_rate_limit')) {
      return { ok: true, json: async () => [{ allowed: true, retry_after_seconds: 0 }] };
    }
    return { ok: true, json: async () => projectionRows(request.url) };
  });
});

describe("anonymous projection boundary", () => {
  it("never reads or requires a service-role key", async () => {
    const captured = {} as Captured;
    await publicFeed({ query: {} }, makeRes(captured));
    expect(captured.code).toBe(200);
    expect(projectionRequest().headers.apikey).toBe("public-test-key");
    expect(projectionRequest().headers.authorization).toBe("Bearer public-test-key");

    const source = readFileSync(join(__dirname, "..", "..", "api", "_publicRead.ts"), "utf8");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("serviceRoleKey");
  });

  it("fails loudly when the public Supabase configuration is absent", async () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    const captured = {} as Captured;
    await publicFeed({ query: {} }, makeRes(captured));
    expect(captured.code).toBe(503);
  });
});

describe("public Social", () => {
  it("loads the bounded topic window needed by the app-parity client filters", () => {
    const source = readFileSync(join(__dirname, "publicRead.ts"), "utf8");
    expect(source).toContain("/api/public-feed?sort=${encodeURIComponent(sort)}&limit=50");
  });

  it("uses only get_public_social_feed and emits its narrow shape", async () => {
    const captured = {} as Captured;
    await publicFeed({ query: {}, headers: { "x-vercel-ip-country": "HK" } }, makeRes(captured));
    expect(projectionRequest().url).toMatch(/\/rpc\/get_public_social_feed$/);
    expect(projectionRequest().body).toEqual({ p_limit: 20, p_cursor: { country: "Hong Kong", sort: "Latest" } });
    expect(Object.keys((captured.body.posts as Record<string, unknown>[])[0]).sort()).toEqual([
      "author_avatar_url", "author_name", "author_social_id", "category", "content",
      "created_at", "id", "images", "is_sensitive", "likes", "title",
    ]);
  });

  it("converts an edge ISO country code to the native country label", async () => {
    await publicFeed(
      { query: {}, headers: { "x-vercel-ip-country": "GB" } },
      makeRes({} as Captured),
    );
    expect(projectionRequest().body).toEqual({
      p_limit: 20,
      p_cursor: { country: "United Kingdom", sort: "Latest" },
    });
  });

  it("caps the feed limit at 50 inside the RPC request body", async () => {
    await publicFeed({ query: { limit: "100000" }, headers: {} }, makeRes({} as Captured));
    expect(projectionRequest().body.p_limit).toBe(50);
  });

  it("ranks the visitor country like native Social without hiding global posts", () => {
    const migration = readFileSync(
      join(__dirname, "..", "..", "supabase", "migrations", "20260823123601_align_public_social_global_relevance.sql"),
      "utf8",
    );
    expect(migration).toContain("then 3");
    expect(migration).toContain("when 3 then 0.40::numeric else 0.15::numeric");
    expect(migration).toContain("when 3 then 21600::numeric else 0::numeric");
    const eligibilityWhere = migration.split("where coalesce(t.is_public, true) = true")[1]?.split("),\n  scored as")[0] ?? "";
    expect(eligibilityWhere).not.toContain("normalize_country_key(t.post_country)");
  });
});

describe("public Map", () => {
  it("uses only get_public_map_alerts and preserves actual alert coordinates", async () => {
    const captured = {} as Captured;
    await publicAlerts({ query: {}, headers: {} }, makeRes(captured));
    expect(projectionRequest().url).toMatch(/\/rpc\/get_public_map_alerts$/);
    expect(projectionRequest().body).toEqual({
      p_bbox: { lat: 22.3193, lng: 114.1694, radius_m: 10000, limit: 100 },
    });
    const alert = (captured.body.alerts as Record<string, unknown>[])[0];
    expect(alert.latitude).toBe(22.2867);
    expect(alert.longitude).toBe(114.1495);
    expect(Object.keys(alert).sort()).toEqual([
      "alert_type", "area", "created_at", "id", "latitude", "longitude",
    ]);
  });

  it("bounds a stalled public projection instead of leaving Map loading forever", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as typeof fetch;

    const captured = {} as Captured;
    const request = publicAlerts({ query: {}, headers: {} }, makeRes(captured));
    await vi.advanceTimersByTimeAsync(8_000);
    await request;

    expect(captured.code).toBe(503);
    expect(captured.body).toEqual({ error: "public_read_unavailable", alerts: [] });
    vi.useRealTimers();
  });
});

describe("public Chats", () => {
  it("uses only get_public_groups_nearby and returns covers/events without chat data", async () => {
    const captured = {} as Captured;
    await publicGroups(
      { headers: { "x-vercel-ip-country": "HK", "x-vercel-ip-country-region": "Hong%20Kong", "x-vercel-ip-city": "Central" } },
      makeRes(captured),
    );
    expect(projectionRequest().url).toMatch(/\/rpc\/get_public_groups_nearby$/);
    expect(projectionRequest().body).toEqual({ p_country: "Hong Kong", p_district: "Central" });
    expect(Object.keys((captured.body.groups as Record<string, unknown>[])[0]).sort()).toEqual([
      "area", "country", "cover_url", "description", "id", "member_count", "name",
      "next_event_ends_at", "next_event_starts_at", "next_event_title", "pet_focus",
    ]);
    expect(captured.body.groups).toHaveLength(2);
    expect((captured.body.groups as Record<string, unknown>[])[0].name).toBe("Sheung Wan Dogs");
  });

  it("uses the visitor country rather than the country subdivision for UK groups", async () => {
    const captured = {} as Captured;
    await publicGroups(
      {
        headers: {
          "x-vercel-ip-country": "GB",
          "x-vercel-ip-country-region": "ENG",
          "x-vercel-ip-city": "London",
        },
      },
      makeRes(captured),
    );
    expect(projectionRequest().body).toEqual({ p_country: "United Kingdom", p_district: "London" });
  });
});

describe("migration contract", () => {
  const migration = readFileSync(
    join(__dirname, "..", "..", "supabase", "migrations", "20260808155307_web_public_read_projections.sql"),
    "utf8",
  );

  it("defines all four narrow projections with explicit grants", () => {
    for (const fn of [
      "get_public_social_feed", "get_public_map_alerts",
      "get_public_groups_nearby", "get_public_area_stats",
    ]) {
      expect(migration).toContain(`function public.${fn}`);
    }
    expect(migration.match(/revoke all on function/g)?.length).toBe(4);
    expect(migration.match(/to anon, authenticated;/g)?.length).toBe(4);
  });

  it("keeps every function SECURITY DEFINER with an empty search path", () => {
    expect(migration.match(/security definer/g)?.length).toBe(4);
    expect(migration.match(/set search_path = ''/g)?.length).toBe(4);
  });

  it("ties each projection to the app's canonical source instead of duplicating web rules", () => {
    const nativeSocial = readFileSync(
      join(__dirname, "..", "..", "app", "src", "screens", "NativeSocialScreen.tsx"),
      "utf8",
    );
    expect(nativeSocial).toContain("tags: [payload.category || \"Social\"]");
    expect(migration).toContain("t.tags[1]");
    expect(migration).toContain("from public.get_visible_broadcast_alerts(");
    expect(migration).toContain("from public.get_public_groups_for_country(");
  });

  it("does not expose forbidden identity, chat, or alert-detail fields", () => {
    const returnBlocks = Array.from(migration.matchAll(/returns table\(([\s\S]*?)\)\nlang/g), (match) => match[1]);
    expect(returnBlocks).toHaveLength(4);
    const publicShape = returnBlocks.join("\n");
    for (const forbidden of [
      "creator_id", "user_id", "room_code", "join_method", "location_street",
      "description text,\n  creator", "phone", "dob", "email",
    ]) {
      expect(publicShape).not.toContain(forbidden);
    }
  });
});
