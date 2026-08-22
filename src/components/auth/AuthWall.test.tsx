/** Behavioural tests for the shared signed-out interaction wall. */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthWall } from "./AuthWall";
import { readAuthIntent } from "@/lib/authIntent";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

const renderWall = (props: Partial<React.ComponentProps<typeof AuthWall>> = {}) =>
  render(
    <MemoryRouter>
      <AuthWall isOpen onClose={props.onClose ?? vi.fn()} {...props} />
    </MemoryRouter>,
  );

describe("AuthWall", () => {
  beforeEach(() => {
    sessionStorage.clear();
    navigateSpy.mockClear();
  });
  afterEach(cleanup);

  it("renders nothing when closed — it must never appear on page load", () => {
    render(
      <MemoryRouter>
        <AuthWall isOpen={false} onClose={vi.fn()} intent="post" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes dialog semantics the shared overlays do not provide", () => {
    renderWall({ intent: "join-group" });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Labelled by its own heading rather than a hardcoded string.
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("names the action instead of saying 'continue'", () => {
    renderWall({ intent: "broadcast" });
    expect(screen.getByText("Broadcasting an alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to broadcast" })).toBeInTheDocument();
  });

  it("falls back to neutral copy when no intent is supplied", () => {
    renderWall();
    expect(screen.getByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument();
  });

  it("stores the intent BEFORE navigating, so it survives the OAuth unload", () => {
    renderWall({ intent: "join-group", targetId: "g-7", returnTo: "/chats" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    const stored = readAuthIntent();
    expect(stored).toMatchObject({ type: "join-group", targetId: "g-7", returnTo: "/chats" });
    expect(navigateSpy).toHaveBeenCalledWith("/join?next=%2Fchats");
  });

  it("sends sign-in to the new /join flow, never legacy /auth", () => {
    renderWall({ intent: "post" });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(navigateSpy).toHaveBeenCalledWith("/join?next=%2F&mode=signin");
  });

  it("does not store an intent when there is nothing to resume", () => {
    renderWall();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(readAuthIntent()).toBeNull();
    // No intent to store, so ?next= is the ONLY thing carrying the destination
    // — which is why it is on the URL and not only in storage.
    expect(navigateSpy).toHaveBeenCalledWith("/join?next=%2F");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderWall({ intent: "post", onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("traps Tab inside the dialog — aria-modal alone does not do this", () => {
    renderWall({ intent: "post" });
    const dialog = screen.getByRole("dialog");
    const buttons = screen.getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    // Forward from the last control wraps to the first.
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(first);

    // Backward from the first control wraps to the last.
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("pulls focus back in if it has escaped the dialog", () => {
    renderWall({ intent: "post" });
    const dialog = screen.getByRole("dialog");
    // Simulate focus sitting outside the wall (e.g. the trigger was removed).
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("renders a context slot above the headline when given one", () => {
    renderWall({ intent: "see-alert", context: <p>Lost · Sheung Wan · 2h ago</p> });
    expect(screen.getByText("Lost · Sheung Wan · 2h ago")).toBeInTheDocument();
  });

  it("uses the centred modal geometry at every viewport", () => {
    renderWall({ intent: "post" });
    const dialog = screen.getByRole("dialog");
    expect(dialog.closest(".fixed.inset-0.flex.items-center.justify-center")).not.toBeNull();
  });

  it("uses the stronger auth-only scrim without changing every shared modal", () => {
    renderWall({ intent: "post" });
    const dialog = screen.getByRole("dialog");
    const modalRoot = dialog.closest(".fixed.inset-0.flex.items-center.justify-center");
    expect(modalRoot?.previousElementSibling).toHaveClass("!bg-foreground/[0.55]");
  });
});
