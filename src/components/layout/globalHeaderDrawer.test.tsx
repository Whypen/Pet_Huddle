/**
 * The settings drawer as it actually renders inside `GlobalHeader`, with a
 * mocked signed-in session.
 *
 * `settingsMenu.test.tsx` covers `SettingsMenu` in isolation. This file exists
 * for the one thing isolation cannot prove: that the drawer and the
 * NOTIFICATION BELL coexist in the real header after a 239-line Sheet was cut
 * out of a 1,000-line file. A source-text assertion would pass on a string that
 * never renders; this renders it.
 *
 * Signed-in surfaces cannot be driven in this environment, so the session is
 * mocked. Structure is proven here; appearance is not.
 */

import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profile = {
  id: "u1",
  display_name: "Priya Ramesh",
  avatar_url: null,
  social_id: "priya",
  effective_tier: "gold",
  tier: "gold",
  onboarding_completed: true,
  account_status: "active",
  email_verified: true,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "priya@example.com", email_confirmed_at: "2026-01-01" },
    session: { access_token: "t" },
    profile,
    loading: false,
    hydrating: false,
    mfaPending: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

// The header fetches notifications and pets on mount. Neither is under test, so
// every query resolves empty rather than reaching the network.
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const result = Promise.resolve({ data: [], error: null, count: 0 });
  for (const method of ["select", "eq", "in", "order", "limit", "is", "neq", "not", "gte"]) {
    chain[method] = () => chain;
  }
  chain.then = (...args: unknown[]) => (result as unknown as { then: (...a: unknown[]) => unknown }).then(...args);
  return {
    supabase: {
      from: () => chain,
      rpc: () => result,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});

import { GlobalHeader } from "./GlobalHeader";

const renderHeader = () =>
  render(
    <MemoryRouter>
      <GlobalHeader />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("GlobalHeader — settings drawer, signed in", () => {
  it("uses an avatar trigger, not a gear", () => {
    const { container } = renderHeader();
    const trigger = screen.getByRole("button", { name: "Settings" });
    expect(within(trigger).getByText("Priya Ramesh")).toBeInTheDocument();
    expect(container.querySelector(".lucide-settings")).toBeNull();
  });

  it("opens the lightweight depth-one settings accordion", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    for (const label of ["Your account", "Who can see you", "Membership", "How huddle protects you", "Log out"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByText("Push notifications")).toBeNull();
  });

  it("renders Legal inside the drawer", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /How huddle protects you/ }));

    const terms = screen.getByRole("button", { name: /Terms of Service/ });
    fireEvent.click(terms);
    expect(screen.getByText("Back")).toBeInTheDocument();
  });
});

describe("GlobalHeader — the notification bell survives", () => {
  /**
   * The highest-risk assertion in this build. The settings Sheet was removed
   * from a 1,000-line file; the bell is a SEPARATE Sheet that had to be left
   * intact. This renders the real header and proves the bell is still there and
   * still its own control — not merely that a string survived in the source.
   */
  it("still renders the bell alongside the avatar trigger", () => {
    renderHeader();
    const bell = screen.getByRole("button", { name: /notification/i });
    expect(bell).toBeInTheDocument();
    // Distinct controls: the bell is not the settings trigger.
    expect(bell).not.toBe(screen.getByRole("button", { name: "Settings" }));
  });

  it("opens its own Sheet, independent of the settings popover", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /notification/i }));
    // The bell's Sheet titles itself "Notifications" (sr-only header plus a
    // visible heading), so more than one node legitimately carries the word.
    expect(screen.getAllByText("Notifications").length).toBeGreaterThan(0);
    // And it is not the settings drawer.
    expect(screen.queryByText("Who can see you")).toBeNull();
  });
});
