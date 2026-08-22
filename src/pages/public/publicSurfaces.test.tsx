/**
 * The whole promise of the logged-out surfaces is "read freely, every write
 * hits the wall". Two things can quietly break that:
 *
 *  1. An action wired to a no-op instead of `requireAuth` — looks fine, does
 *     nothing, and a visitor concludes the product is broken.
 *  2. A `supabase.from(...)` creeping into a logged-out path, which 401s with no
 *     session and gives two data paths fighting.
 *
 * Neither shows up in a screenshot, so both are asserted here.
 */

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicSocial from "./PublicSocial";
import PublicChats from "./PublicChats";
import { SharedAlertDetail } from "./SharedAlertDetail";
import { AuthGateContext, type AuthGateValue } from "@/components/auth/authGateContext";
import { __resetPublicReadCacheForTests } from "@/lib/publicRead";

const requireAuth = vi.fn();

const renderWithGate = (ui: React.ReactElement, path = "/") => {
  const value: AuthGateValue = { requireAuth, isSignedIn: false };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthGateContext.Provider value={value}>{ui}</AuthGateContext.Provider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  __resetPublicReadCacheForTests();
  requireAuth.mockReset();
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () =>
      String(url).includes("public-feed")
        ? {
            posts: [{
              id: "p1", title: "Found a cat", content: "In the lobby", images: ["https://images.example/one.jpg", "https://images.example/two.jpg"],
              likes: 2, created_at: new Date().toISOString(), category: "Pets",
              author_name: "Priya", author_avatar_url: null, is_sensitive: true,
            }],
          }
        : {
            groups: [{
              id: "g1", name: "Sheung Wan Dogs", description: "Walks",
              cover_url: null, area: "Sheung Wan", country: "HK", member_count: 4, pet_focus: ["Dogs"],
            }],
          },
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("logged-out Social", () => {
  it("renders posts through the app's ThreadCard, not rebuilt markup", async () => {
    const { container } = renderWithGate(<PublicSocial />);
    expect(await screen.findByText("Found a cat")).toBeInTheDocument();
    expect(screen.getAllByText("Priya").length).toBeGreaterThan(0);
    // Markers only the real card produces — a silent revert to hand-rolled
    // markup would fail here.
    expect(container.querySelector("[data-thread-id=\"p1\"]")).not.toBeNull();
    expect(screen.getByLabelText("Save post")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle post pin")).toBeInTheDocument();
  });

  it("routes Support through the auth gate rather than doing nothing", async () => {
    const { container } = renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    // The real card labels this with title=, not aria-label — matched here
    // rather than adding an attribute the app does not have.
    fireEvent.click(container.querySelector("[title=\"Support\"]")!);
    expect(requireAuth).toHaveBeenCalledWith("like", expect.any(Function), { targetId: "p1" });
  });

  it("routes Reply through the auth gate", async () => {
    renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    fireEvent.click(screen.getByLabelText("Toggle replies"));
    expect(requireAuth).toHaveBeenCalledWith("reply", expect.any(Function), { targetId: "p1" });
  });

  it("keeps public carousel navigation readable without opening the auth wall", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(requireAuth).not.toHaveBeenCalled();
    expect(screen.getByAltText("Found a cat 2")).toBeInTheDocument();
  });

  it("uses the app sensitive-media treatment without removing carousel items", async () => {
    renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    expect(screen.getByAltText("Found a cat 1")).toHaveStyle({ filter: "blur(100px)" });
    expect(screen.getByAltText("Found a cat 2")).toHaveStyle({ filter: "blur(100px)" });
    expect(screen.getAllByText("Tap to view")).toHaveLength(2);
  });

  it("routes a public media double-tap through the same Support wall", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        posts: [{
          id: "p1", title: "Found a cat", content: "In the lobby", images: ["https://images.example/one.jpg"],
          likes: 2, created_at: new Date().toISOString(), category: "Pets",
          author_name: "Priya", author_avatar_url: null, is_sensitive: false,
        }],
      }),
    }));
    renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    fireEvent.doubleClick(screen.getByAltText("Found a cat 1").parentElement!);
    expect(requireAuth).toHaveBeenCalledWith("like", expect.any(Function), { targetId: "p1" });
  });

  it("routes avatar taps through the auth wall", async () => {
    renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    fireEvent.click(screen.getByRole("button", { name: "View Priya's profile" }));
    expect(requireAuth).toHaveBeenCalledWith("profile", expect.any(Function), {
      targetId: "p1",
    });
  }, 10_000);

  it("says the fetch failed instead of pretending the feed is empty", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) }));
    renderWithGate(<PublicSocial />);
    await waitFor(() => expect(screen.getByText(/Couldn't load posts/)).toBeInTheDocument());
    // "Nothing posted here yet" would be a lie the visitor acts on.
    expect(screen.queryByText(/Nothing posted here yet/)).toBeNull();
  });

  it("reuses the warm feed when the visitor returns instead of refetching", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        posts: [{
          id: "p1", title: "Found a cat", content: "In the lobby", images: [],
          likes: 2, created_at: new Date().toISOString(), category: "Pets",
          author_name: "Priya", author_avatar_url: null,
        }],
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const first = renderWithGate(<PublicSocial />);
    await screen.findByText("Found a cat");
    first.unmount();

    renderWithGate(<PublicSocial />);
    expect(screen.getByText("Found a cat")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("shared alert read bypass", () => {
  const alert = {
    id: "11111111-1111-4111-8111-111111111111",
    alert_type: "Lost",
    title: "Missing near the park",
    description: "Small brown dog wearing a blue collar.",
    photo_url: null,
    media_urls: [],
    support_count: 3,
    created_at: new Date().toISOString(),
    creator_id: "22222222-2222-4222-8222-222222222222",
    creator_display_name: "Sam",
    creator_avatar_url: null,
  };

  it("shows full read detail but walls every action", () => {
    renderWithGate(<SharedAlertDetail alert={alert} onClose={vi.fn()} />);
    expect(screen.getByText(alert.title)).toBeInTheDocument();
    expect(screen.getByText(alert.description)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Support alert" }));
    fireEvent.click(screen.getByRole("button", { name: "Share alert" }));
    fireEvent.click(screen.getByRole("button", { name: "More alert actions" }));
    fireEvent.click(screen.getByRole("button", { name: /Sam/ }));

    expect(requireAuth).toHaveBeenCalledTimes(4);
    expect(requireAuth).toHaveBeenCalledWith("see-alert", expect.any(Function), { targetId: alert.id });
  });
});

describe("logged-out Groups", () => {
  it("renders the app's own ExploreGroupCard, not a rebuilt one", async () => {
    renderWithGate(<PublicChats />, "/groups");
    expect(await screen.findByText("Sheung Wan Dogs")).toBeInTheDocument();
    // Fields the shared card renders — proof the real component is in use.
    expect(screen.getByText(/4 members/)).toBeInTheDocument();
    expect(screen.getByText("Dogs")).toBeInTheDocument();
  });

  it("gates joining through the auth wall", async () => {
    renderWithGate(<PublicChats />, "/groups");
    await screen.findByText("Sheung Wan Dogs");
    fireEvent.click(screen.getByRole("button", { name: /^join Sheung Wan Dogs$/i }));
    expect(requireAuth).toHaveBeenCalledWith("join-group", expect.any(Function), { targetId: "g1" });
  });

  it("keeps a zero-group public result quiet instead of inventing copy", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ groups: [] }),
    }));

    renderWithGate(<PublicChats />, "/groups");
    await waitFor(() => expect(screen.queryByText("Loading groups…")).not.toBeInTheDocument());
    expect(screen.getByText("No public groups nearby yet. Be the first to start a local pack!")).toBeInTheDocument();
    expect(screen.queryByText("Be the first to start a local pack!")).not.toBeInTheDocument();
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it("shows the app RPC's upcoming-event state on the group cover", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-08T12:00:00Z"));
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        groups: [{
          id: "g1", name: "Sheung Wan Dogs", description: "Walks",
          cover_url: null, area: "Sheung Wan", country: "HK", member_count: 4, pet_focus: ["Dogs"],
          next_event_title: "Harbour walk",
          next_event_starts_at: "2026-08-08T14:15:00Z",
          next_event_ends_at: "2026-08-08T15:15:00Z",
        }],
      }),
    }));

    renderWithGate(<PublicChats />, "/groups");
    expect(await screen.findByText("Event in 2h 15m")).toBeInTheDocument();
  });
});

describe("page naming", () => {
  it("keeps route names in navigation without duplicating them as page titles", async () => {
    renderWithGate(<PublicChats />, "/groups");
    expect(await screen.findByText("Sheung Wan Dogs")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Chats" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Groups" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Social" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Map" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Chats" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Groups" }).length).toBeGreaterThan(0);
  });
});

describe("Social composer bar", () => {
  it("renders identically when logged out — it is never hidden", async () => {
    renderWithGate(<PublicSocial />);
    expect(
      await screen.findByPlaceholderText("What's happening?"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  });

  it("opens the wall with the post intent rather than a composer that cannot post", async () => {
    renderWithGate(<PublicSocial />);
    fireEvent.click(
      await screen.findByPlaceholderText("What's happening?"),
    );
    expect(requireAuth).toHaveBeenCalledWith("post", expect.any(Function));
  });

  it("keeps the compact signed-out composer to the benchmark's single trigger row", async () => {
    renderWithGate(<PublicSocial />);
    expect(await screen.findByPlaceholderText("What's happening?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  });

  it("keeps primary mobile actions at the 44px minimum target", async () => {
    renderWithGate(<PublicSocial />);
    expect(await screen.findByPlaceholderText("What's happening?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "Sort" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "All" })).toHaveClass("min-w-11");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveClass("h-11");
  });
});

describe("nav reactivity", () => {
  // Regression guard. PublicChrome previously read window.location.pathname
  // during render. That is not reactive, so on client-side navigation the
  // active tab did not follow the visitor and ?next= carried a stale path —
  // someone on /map tapping Create account could be returned to /social.
  //
  // A cold page load hides it (window.location happens to be right), which is
  // why the cold-navigation check did not catch it. Rendering at a router
  // location that differs from window.location is what exposes it: under jsdom
  // window.location.pathname is "/", so a window.location implementation marks
  // nothing active and points ?next= at "/".
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthGateContext.Provider value={{ requireAuth, isSignedIn: false }}>
          <PublicChats />
        </AuthGateContext.Provider>
      </MemoryRouter>,
    );

  it("marks the tab matching the router location, not window.location", async () => {
    renderAt("/chats");
    const active = await screen.findAllByRole("link", { name: "Chats" });
    expect(active.every((link) => link.getAttribute("aria-current") === "page")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Social" }).every((link) => !link.hasAttribute("aria-current"))).toBe(true);
    expect(screen.getAllByRole("link", { name: "Map" }).every((link) => !link.hasAttribute("aria-current"))).toBe(true);
  });

  it("carries the router location in ?next=, so sign-up returns you where you were", async () => {
    renderAt("/chats");
    const cta = await screen.findByRole("link", { name: "Create account" });
    expect(cta).toHaveAttribute("href", "/join?next=%2Fchats");
  });
});

describe("logged-out data path", () => {
  it("keeps ordinary previews off direct table access and limits the share bypass to the app RPC", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = [
      "src/pages/public/PublicSocial.tsx",
      "src/pages/public/PublicChats.tsx",
      "src/pages/public/PublicMap.tsx",
      "src/pages/public/PublicChrome.tsx",
      "src/lib/publicRead.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      // Comments in these files explain WHY there is no client call, and say
      // "supabase.from(...)" to do it. Strip comments so the assertion is about
      // code, not prose — otherwise documenting the rule breaks the test.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code).not.toMatch(/supabase\s*\.\s*(from|auth)\s*\(/);
      if (file.endsWith("PublicMap.tsx")) {
        expect(code).toContain('"get_broadcast_alert_by_share_token"');
        expect(code).toContain("<AlertMarkersOverlay");
        expect(code).not.toContain("new mapboxgl.Marker");
        expect(code).not.toMatch(/supabase\s*\.\s*rpc\s*\([^)]*["'](?!get_broadcast_alert_by_share_token)/);
      } else {
        expect(code).not.toMatch(/supabase\s*\.\s*rpc\s*\(/);
        expect(code).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      }
    }
  });
});
