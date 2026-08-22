/**
 * Two-pane chats.
 *
 * The assertion that matters most is the NEGATIVE one: below `lg`, exactly one
 * pane mounts and behaviour is unchanged. Every existing user is on that path,
 * and rendering both panes on a phone would mount a second conversation view —
 * invisible in a screenshot, expensive in practice.
 *
 * Structure is proven here; appearance is not.
 */

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatsTwoPane } from "./ChatsTwoPane";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Drives the lg breakpoint; `useIsDesktop` reads matchMedia and innerWidth. */
const setViewport = (width: number) => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.matchMedia = ((query: string) => ({
    matches: width >= 1024 && query.includes("min-width: 1024px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
};

const List = () => <div data-testid="list">CONVERSATION LIST</div>;
const Conversation = () => <div data-testid="conversation">CONVERSATION VIEW</div>;

const renderPane = (opts: { width: number; path: string; mobilePane: "list" | "conversation" }) => {
  setViewport(opts.width);
  return render(
    <MemoryRouter initialEntries={[opts.path]}>
      <ChatsTwoPane
        list={<List />}
        conversation={<Conversation />}
      />
    </MemoryRouter>,
  );
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("below lg — existing behaviour is unchanged", () => {
  it("/chats mounts ONLY the list", () => {
    renderPane({ width: 390, path: "/chats", mobilePane: "list" });
    expect(screen.getByTestId("list")).toBeInTheDocument();
    // The regression that would hurt every phone user: a second view mounting.
    expect(screen.queryByTestId("conversation")).toBeNull();
  });

  it("/chat-dialogue mounts ONLY the conversation", () => {
    renderPane({ width: 390, path: "/chat-dialogue?room=r1", mobilePane: "conversation" });
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
    expect(screen.queryByTestId("list")).toBeNull();
  });

  it("does not render the two-pane empty state on mobile", () => {
    renderPane({ width: 390, path: "/chats", mobilePane: "list" });
    expect(screen.queryByText(/Choose a conversation/i)).toBeNull();
  });
});

describe("lg and above — two panes", () => {
  it("keeps the list mounted alongside the conversation", () => {
    renderPane({ width: 1280, path: "/chat-dialogue?room=r1", mobilePane: "conversation" });
    // Both, simultaneously — selecting a conversation must not lose the list.
    expect(screen.getByTestId("list")).toBeInTheDocument();
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
  });

  it("shows the list plus a real empty state when no room is selected", () => {
    renderPane({ width: 1280, path: "/chats", mobilePane: "list" });
    expect(screen.getByTestId("list")).toBeInTheDocument();
    expect(screen.queryByTestId("conversation")).toBeNull();
    // A designed screen, not a blank div or a spinner.
    expect(screen.getByText(/Choose a conversation/i)).toBeInTheDocument();
  });

  it("drives the right pane from the URL, so a refresh or shared link lands the same", () => {
    renderPane({ width: 1280, path: "/chats?room=r1", mobilePane: "list" });
    // `?room=` on /chats is enough — the URL is the single source of truth.
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
    expect(screen.getByTestId("list")).toBeInTheDocument();
  });
});

describe("lg+ — selecting a conversation must not remount the list", () => {
  /**
   * Renders through the SAME parent/child route shape as FullAppRoutes.tsx: one
   * parent element shared by /chats and /chat-dialogue, children rendering null.
   *
   * That structure is the point. Two sibling routes each with their own element
   * tear down the shell on navigation; a parent stays mounted while its matched
   * child changes. Rendering ChatsTwoPane directly would never exercise it —
   * which is exactly why the earlier version of this test could not prove the
   * fix.
   */
  const mounts = { count: 0 };

  const CountingList = () => {
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return <div data-testid="list">CONVERSATION LIST</div>;
  };

  const Selector = () => {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate("/chat-dialogue?room=r1")}>
        select
      </button>
    );
  };

  it("keeps the list mounted across selection, through the real route structure", () => {
    mounts.count = 0;
    setViewport(1280);

    render(
      <MemoryRouter initialEntries={["/chats"]}>
        <Selector />
        <Routes>
          <Route
            element={
              <ChatsTwoPane list={<CountingList />} conversation={<Conversation />} />
            }
          >
            <Route path="/chats" element={null} />
            <Route path="/chat-dialogue" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(mounts.count).toBe(1);
    expect(screen.queryByTestId("conversation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "select" }));

    // Right pane swapped in…
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
    // …and the list was never torn down.
    expect(screen.getByTestId("list")).toBeInTheDocument();
    expect(mounts.count).toBe(1);
  });

  it("does not remount the list when navigating back to /chats", () => {
    mounts.count = 0;
    setViewport(1280);

    const Back = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate("/chats")}>
          back
        </button>
      );
    };

    render(
      <MemoryRouter initialEntries={["/chat-dialogue?room=r1"]}>
        <Back />
        <Routes>
          <Route
            element={
              <ChatsTwoPane list={<CountingList />} conversation={<Conversation />} />
            }
          >
            <Route path="/chats" element={null} />
            <Route path="/chat-dialogue" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(mounts.count).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByTestId("list")).toBeInTheDocument();
    expect(mounts.count).toBe(1);
  });
});

describe("web Chats scope", () => {
  it("does not enter or prefetch native-only Discover and Care scopes", () => {
    const source = readFileSync(join(__dirname, "Chats.tsx"), "utf8");
    const initialTab = source.match(/const \[mainTab[\s\S]*?\n\s*\}\);/)?.[0] || "";
    const hydration = source.match(/\/\/ Web exposes Friends and Groups only\.[\s\S]*?\n\s*\}, \[authLoading/)?.[0] || "";

    expect(initialTab).not.toContain('return "service"');
    expect(hydration).not.toContain('loadConversations("all")');
    expect(hydration).not.toContain('loadConversations("service")');
    const tabs = source.match(/const mainTabs:[\s\S]*?\n\];/)?.[0] || "";
    expect(tabs).toContain('{ id: "friends", label: "Friends"');
    expect(tabs).toContain('{ id: "groups", label: "Group Chats"');
    expect(tabs).not.toContain('{ id: "service"');
  });
});
