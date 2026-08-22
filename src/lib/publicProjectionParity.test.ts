import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import publicFeed from "../../api/public-feed";
import publicGroups from "../../api/public-groups";

type Captured = {
  code: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

const response = (captured: Captured) => ({
  setHeader: (name: string, value: string) => {
    captured.headers[name] = value;
  },
  status: (code: number) => ({
    json: (body: unknown) => {
      captured.code = code;
      captured.body = body as Record<string, unknown>;
    },
  }),
});

const captured = (): Captured => ({ code: 0, body: {}, headers: {} });

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
});

describe("public projection parity", () => {
  it("keeps the document and installed-web-app chrome white", () => {
    const root = join(__dirname, "..", "..");
    const html = readFileSync(join(root, "index.html"), "utf8");
    const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"));

    expect(html).toContain('<meta name="theme-color" content="#ffffff"');
    expect(html).toContain('<body style="background-color:#ffffff;">');
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest.theme_color).toBe("#ffffff");
  });

  it("returns every row authorized by the Social projection without a web-only label filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => String(url).includes("consume_public_ingress_rate_limit")
        ? [{ allowed: true, retry_after_seconds: 0 }]
        : [{
            id: "post-1",
            title: "Release test",
            content: "Projection-approved content",
            images: [],
            likes: 0,
            created_at: "2026-08-23T00:00:00Z",
            category: "Social",
            author_name: "huddle",
            author_avatar_url: null,
            author_social_id: "huddle",
            is_sensitive: false,
          }],
    })));

    const result = captured();
    await publicFeed({ query: {}, headers: { "x-vercel-ip-country": "HK" } }, response(result));

    expect(result.code).toBe(200);
    expect(result.body.posts).toHaveLength(1);
    expect((result.body.posts as Array<{ title: string }>)[0].title).toBe("Release test");
    expect(result.headers["Cache-Control"]).toContain("private");
  });

  it("returns every row authorized by the Groups projection without a web-only label filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => String(url).includes("consume_public_ingress_rate_limit")
        ? [{ allowed: true, retry_after_seconds: 0 }]
        : [{
            id: "group-1",
            name: "[UAT] Existing app group",
            description: "Visible through the canonical projection",
            cover_url: null,
            area: "Central",
            country: "Hong Kong",
            pet_focus: ["Dogs"],
            member_count: 2,
            next_event_title: null,
            next_event_starts_at: null,
            next_event_ends_at: null,
          }],
    })));

    const result = captured();
    await publicGroups({ headers: { "x-vercel-ip-country": "HK" } }, response(result));

    expect(result.code).toBe(200);
    expect(result.body.groups).toHaveLength(1);
    expect((result.body.groups as Array<{ name: string }>)[0].name).toBe("[UAT] Existing app group");
    expect(result.headers["Cache-Control"]).toContain("private");
  });
});
