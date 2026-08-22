import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/share";

/**
 * The rendered contract for every share link huddle can produce.
 *
 * These assert the ACTUAL HTML the crawler receives — WhatsApp, iMessage and
 * Telegram read nothing else — with the database stubbed. No server, no network.
 *
 * Two rules the whole suite exists to hold:
 *   1. The title must survive alone. iMessage renders the image, the title and
 *      the domain, and drops `og:description` entirely.
 *   2. There is NO image fallback. With no real picture the image tags are
 *      absent and the renderer draws its own text-only preview.
 */

const ROW = {
  thread: {
    id: "t-1", user_id: "u-1", is_sensitive: false,
    content: "Mochi finally learned to sit for treats today",
    images: ["https://db.supabase.co/storage/v1/object/public/social/post.jpg"],
  },
  profile: { id: "u-1", display_name: "Sam", social_id: "sam", bio: "Two cats, one couch", avatar_url: "https://db.supabase.co/storage/v1/object/public/avatars/sam.jpg" },
  alertLost: {
    id: "a-1", type: "Lost", pet_type: "Cat", title: "Ginger tabby, answers to Mochi",
    description: "Slipped out of the window last night. Very shy, please do not chase.",
    incident_district: "Kowloon City", incident_city: "Hong Kong",
    creator_id: "u-1", thread_id: null, archived_at: null, is_sensitive: false,
    images: ["https://db.supabase.co/storage/v1/object/public/alerts/mochi.jpg"], photo_url: null,
  },
};

type Rows = Record<string, unknown[]>;
let rows: Rows = {};

const respond = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);

const stubFetch = () => vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("consume_public_ingress_rate_limit")) return respond([{ allowed: true }]);
  const table = url.split("/rest/v1/")[1]?.split("?")[0] || "";
  // The alert PAGE select is narrower than the preview select; both hit the
  // same table, so the stub answers by table and lets the handler project.
  return respond(rows[table] ?? []);
});

const render = async (id: string) => {
  const res = { statusCode: 0, body: "", headers: {} as Record<string, string> };
  await handler(
    { headers: { host: "huddle.pet", "x-forwarded-proto": "https" }, query: { id } },
    {
      setHeader: (k: string, v: string) => { res.headers[k] = v; },
      status: (code: number) => ({ send: (body: string) => { res.statusCode = code; res.body = body; } }),
    },
  );
  return res.body;
};

const meta = (html: string, key: string) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return m ? m[1] : null;
};
const og = (html: string) => ({
  title: meta(html, "og:title"),
  description: meta(html, "og:description"),
  image: meta(html, "og:image"),
  card: meta(html, "twitter:card"),
  width: meta(html, "og:image:width"),
});

beforeEach(() => {
  process.env.SUPABASE_URL = "https://db.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  vi.stubGlobal("fetch", stubFetch());
  rows = {};
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("post previews", () => {
  it("puts the post's own words in the title — iMessage shows nothing else", async () => {
    rows = { threads: [ROW.thread], profiles: [ROW.profile] };
    const p = og(await render("t-1"));
    expect(p.title).toBe("Sam (@sam): Mochi finally learned to sit for treats today");
    expect(p.description).toBe("Mochi finally learned to sit for treats today");
  });

  it("crops the photo to exactly the dimensions the tags declare", async () => {
    rows = { threads: [ROW.thread], profiles: [ROW.profile] };
    const p = og(await render("t-1"));
    expect(p.image).toContain("/storage/v1/render/image/public/");
    expect(p.image).toContain("width=1200&amp;height=630&amp;resize=cover");
    expect(p.width).toBe("1200");
    expect(p.card).toBe("summary_large_image");
  });

  it("omits every image tag for a text-only post rather than shipping a logo", async () => {
    rows = { threads: [{ ...ROW.thread, images: [] }], profiles: [ROW.profile] };
    const html = await render("t-1");
    expect(og(html).image).toBeNull();
    expect(html).not.toContain("og:image");
    expect(html).not.toContain("huddle-logo.jpg");
    expect(og(html).card).toBe("summary");
    expect(og(html).title).toBe("Sam (@sam): Mochi finally learned to sit for treats today");
  });

  it("never leaks a sensitive post's media into a third-party preview", async () => {
    rows = { threads: [{ ...ROW.thread, is_sensitive: true }], profiles: [ROW.profile] };
    const html = await render("t-1");
    expect(html).not.toContain("post.jpg");
    expect(og(html).image).toBeNull();
    // The caption travels as far as the picture would, so it is withheld too.
    expect(html).not.toContain("learned to sit");
    expect(og(html).title).toBe("Sam (@sam) on huddle");
    expect(og(html).description).toBe("Sensitive content. Open in huddle to view.");
  });
});

describe("alert previews", () => {
  it("leads with type, species and district — not the poster's name", async () => {
    rows = { broadcast_alerts: [ROW.alertLost], profiles: [ROW.profile] };
    const p = og(await render("alert_a-1"));
    expect(p.title).toBe("Lost cat in Kowloon City, Hong Kong: Ginger tabby, answers to Mochi");
    expect(p.title).not.toContain("@sam");
  });

  it("drops the species slot where pet_type is structurally null", async () => {
    rows = { broadcast_alerts: [{ ...ROW.alertLost, type: "Caution", pet_type: null, title: "Aggressive dog off-leash at the park steps" }] };
    expect(og(await render("alert_a-1")).title)
      .toBe("Caution in Kowloon City, Hong Kong: Aggressive dog off-leash at the park...");
  });

  it("says resolved WHAT — the original line survives the prefix", async () => {
    rows = { broadcast_alerts: [{ ...ROW.alertLost, archived_at: "2026-08-01T00:00:00Z" }] };
    const p = og(await render("alert_a-1"));
    expect(p.title).toBe("Resolved — Lost cat in Kowloon City, Hong Kong: Ginger tabby, answers to...");
    expect(p.image).toBeNull();
  });

  it("goes text-only for a photoless alert instead of a stand-in image", async () => {
    rows = { broadcast_alerts: [{ ...ROW.alertLost, images: [], photo_url: null, type: "Stray", pet_type: "Dog", title: "Limping brown mongrel near the market" }] };
    const html = await render("alert_a-1");
    expect(og(html).title).toContain("Stray dog in Kowloon City, Hong Kong: Limping brown mongrel");
    expect(html).not.toContain("og:image");
    expect(html).not.toContain("huddle-logo.jpg");
  });

  it("falls back to the brand line, never to a broken one, when the area is unknown", async () => {
    rows = { broadcast_alerts: [{ ...ROW.alertLost, incident_district: null, incident_city: null }] };
    expect(og(await render("alert_a-1")).title).toContain("Lost cat on huddle:");
  });
});

describe("verified-only alerts", () => {
  const RESTRICTED = { ...ROW.alertLost, verified_only: true };

  it("gets a real preview instead of unfurling as a bare SPA link", async () => {
    rows = { broadcast_alerts: [RESTRICTED] };
    const p = og(await render("alert_a-1"));
    expect(p.title).toBe("Lost in Kowloon City, Hong Kong");
    expect(p.description).toBe("Shared with verified members. Open huddle to view.");
  });

  it("redacts everything a crawler is not entitled to", async () => {
    rows = { broadcast_alerts: [RESTRICTED] };
    const html = await render("alert_a-1");
    expect(html).not.toContain("mochi.jpg");          // no photo
    expect(html).not.toContain("Ginger tabby");        // no headline
    expect(html).not.toContain("Slipped out");         // no description
    // Species is withheld too — checked on the meta lines, since "location" in
    // the page's own script legitimately contains the substring "cat".
    expect(og(html).title).not.toMatch(/\bcat\b/i);
    expect(og(html).description).not.toMatch(/\bcat\b/i);
    expect(og(html).image).toBeNull();
  });

  it("never renders the full public alert page for a restricted alert", async () => {
    rows = { broadcast_alerts: [RESTRICTED] };
    const html = await render("alert_a-1");
    // The full alert page carries the replies footer; the redacted card does not.
    expect(html).not.toContain("Replies are visible");
    expect(html).toContain("Get huddle");
  });

  it("still renders the full page for an ordinary alert", async () => {
    rows = { broadcast_alerts: [{ ...ROW.alertLost, verified_only: false }] };
    expect(await render("alert_a-1")).toContain("Ginger tabby");
  });
});

describe("alert-derived posts", () => {
  it("borrows the alert's title — a missing pet is not an ordinary post", async () => {
    rows = {
      threads: [{ ...ROW.thread, id: "t-2", content: "Please help us find Mochi" }],
      profiles: [ROW.profile],
      broadcast_alerts: [{ ...ROW.alertLost, thread_id: "t-2" }],
    };
    const p = og(await render("t-2"));
    expect(p.title).toBe("Lost cat in Kowloon City, Hong Kong: Ginger tabby, answers to Mochi");
  });

  it("opens the POST while reading as the alert — same look, different door", async () => {
    rows = {
      threads: [{ ...ROW.thread, id: "t-2" }],
      profiles: [ROW.profile],
      broadcast_alerts: [{ ...ROW.alertLost, thread_id: "t-2" }],
    };
    expect(meta(await render("t-2"), "og:url")).toBe("https://huddle.pet/share/t-2");
  });

  it("leaves an ordinary post alone when no alert is behind it", async () => {
    rows = { threads: [ROW.thread], profiles: [ROW.profile], broadcast_alerts: [] };
    expect(og(await render("t-1")).title).toBe("Sam (@sam): Mochi finally learned to sit for treats today");
  });
});

describe("people previews", () => {
  it("keeps a face square instead of sawing it into a 1.91:1 strip", async () => {
    rows = { profiles: [ROW.profile] };
    const html = await render("profile_u-1");
    const p = og(html);
    expect(p.title).toBe("Sam (@sam) on huddle");
    expect(p.description).toBe("Two cats, one couch");
    expect(p.image).toContain("width=400&amp;height=400&amp;resize=cover");
    expect(p.width).toBe("400");
    expect(meta(html, "og:image:height")).toBe("400");
    // A square declared as summary_large_image gets letterboxed by the renderer.
    expect(p.card).toBe("summary");
  });

  it("gives the carer card the same square treatment", async () => {
    rows = { profiles: [ROW.profile], pet_care_profiles: [{ services_offered: ["Boarding"], listed: true }] };
    const p = og(await render("carer_u-1"));
    expect(p.image).toContain("width=400&amp;height=400");
    expect(p.card).toBe("summary");
  });

  it("keeps posts and alerts on the wide banner", async () => {
    rows = { broadcast_alerts: [ROW.alertLost] };
    const p = og(await render("alert_a-1"));
    expect(p.image).toContain("width=1200&amp;height=630");
    expect(p.card).toBe("summary_large_image");
  });

  it("names the carer's trade in the title", async () => {
    rows = { profiles: [ROW.profile], pet_care_profiles: [{ services_offered: ["Boarding", "Walking"], listed: true }] };
    const p = og(await render("carer_u-1"));
    expect(p.title).toBe("Sam · Pet Care on huddle");
    expect(p.description).toContain("Boarding · Walking");
  });
});

describe("the landing page a recipient without the app actually sees", () => {
  /**
   * The page used to replace itself with the App Store 80ms after load, so a
   * recipient tapped a preview card and arrived in the store having never seen
   * what they were sent. The preview sold something the page never delivered.
   */
  it("never bounces a visitor to the store", async () => {
    rows = { threads: [ROW.thread], profiles: [ROW.profile] };
    const html = await render("t-1");
    expect(html).not.toContain("location.replace");
    expect(html).not.toContain("setTimeout");
  });

  it("shows the post itself before asking for an install", async () => {
    rows = { threads: [ROW.thread], profiles: [ROW.profile] };
    const html = await render("t-1");
    expect(html).toContain("Mochi finally learned to sit for treats today");
    expect(html).toContain("post.jpg");
    expect(html).toContain("Get huddle");
  });

  it("offers a QR so a desktop reader can continue on their phone", async () => {
    rows = { threads: [ROW.thread], profiles: [ROW.profile] };
    expect(await render("t-1")).toContain("<svg");
  });

  it("shows the alert itself, and asks honestly rather than promising to open an app", async () => {
    rows = { broadcast_alerts: [ROW.alertLost] };
    const html = await render("alert_a-1");
    expect(html).toContain("Ginger tabby");
    expect(html).toContain("Get huddle");
    expect(html).not.toContain(">Open in huddle<");
  });
});

describe("failure states", () => {
  it("degrades to plain, never to broken, when the row is gone", async () => {
    rows = {};
    const html = await render("t-missing");
    expect(og(html).title).toBe("Social Post on huddle");
    expect(html).not.toContain("og:image");
  });

  /**
   * DISPROVES THE ORIGINAL DIAGNOSIS.
   *
   * A missing Supabase config cannot be why production previews were generic:
   * `checkDistributedRateLimit` needs the SAME url + service key and refuses
   * FIRST, so the request 503s at the gate and never reaches the card. Anything
   * that renders the generic card therefore had working config and an empty
   * query result. The console.error added to `resolveSupabaseConfig` stays as
   * defence, but the real cause is a row that did not come back.
   */
  it("503s at the rate-limit gate — config absence never reaches the preview", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    const res = { statusCode: 0, body: "" };
    await handler(
      { headers: { host: "huddle.pet" }, query: { id: "t-1" } },
      {
        setHeader: () => {},
        status: (code: number) => ({ send: (body: string) => { res.statusCode = code; res.body = body; } }),
      },
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("og:image");
  });
});
