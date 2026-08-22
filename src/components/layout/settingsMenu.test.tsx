import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/HuddleCodeDialogs", () => ({
  MyHuddleCodeDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="My huddle Code">Code controls</div> : null,
  AddFriendDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Add a Friend">Add friend controls</div> : null,
}));

// The legal documents are generated full HTML documents rendered in a
// sandboxed iframe. JSDOM does not settle that iframe reliably, so this
// component test owns the drawer interaction while legal document integrity is
// covered by the dedicated legal:verify gate.
vi.mock("@/components/legal/LegalContent", () => ({
  LegalContent: ({ type }: { type: string }) => <div data-testid="legal-content">{type}</div>,
}));

import { SettingsMenu } from "./SettingsMenu";

const onLogout = vi.fn();
const onManageMembership = vi.fn();

const openMenu = () => {
  render(
    <SettingsMenu
      displayName="Priya Ramesh"
      avatarUrl={null}
      isVerified
      tierLabel="Gold"
      socialId="priya"
      accountEmail="priya@example.com"
      onLogout={onLogout}
      onManageMembership={onManageMembership}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("settings drawer contract", () => {
  it("uses the avatar trigger and the exact lightweight accordion", () => {
    openMenu();
    expect(screen.getAllByText("Priya Ramesh").length).toBeGreaterThan(0);
    expect(screen.getByText("@priya · Gold")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What do you need?")).toBeInTheDocument();

    const labels = ["Your account", "Who can see you", "Membership", "How huddle protects you"];
    for (const label of labels) expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();

    expect(screen.queryByText("Notification settings")).toBeNull();
    expect(screen.queryByText("Family Account")).toBeNull();
    expect(screen.queryByText("Identity Verification")).toBeNull();
    expect(screen.queryByText("Linked devices")).toBeNull();
    expect(screen.queryByRole("img", { name: /QR code/i })).toBeNull();
  });

  it("keeps profile utilities in the current-page drawer", async () => {
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Priya Ramesh/i }));
    expect(screen.getByRole("button", { name: /My huddle Code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a Friend/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit profile/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /My huddle Code/ }));
    expect(await screen.findByRole("dialog", { name: "My huddle Code" })).toBeInTheDocument();
  });

  it("keeps account, visibility, membership and legal content depth-one", () => {
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Your account/ }));
    expect(screen.getByText("priya@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change password/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete account/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Who can see you/ }));
    expect(screen.getByText("Appear in Discovery")).toBeInTheDocument();
    expect(screen.getByText("Incognito on Map")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Membership/ }));
    fireEvent.click(screen.getByRole("button", { name: /Manage billing/ }));
    expect(onManageMembership).toHaveBeenCalledTimes(1);
  });

  it("searches sub-rows directly and keeps logout explicit", () => {
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("What do you need?"), { target: { value: "password" } });
    expect(screen.getByRole("button", { name: /Change password/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Membership/ })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("What do you need?"), { target: { value: "nothing-like-this" } });
    expect(screen.getByRole("button", { name: /Nothing here matches/ })).toBeInTheDocument();
  });

  it("keeps every canonical legal document in-drawer", () => {
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /How huddle protects you/ }));
    for (const label of ["Privacy Policy", "Terms of Service", "Community Guidelines", "Privacy Choices", "Personal Information Collection Notice", "Cookies and Similar Technologies Notice"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: /Terms of Service/ }));
    expect(screen.getByText("Back")).toBeInTheDocument();
  }, 10_000);

  it("keeps notification preference storage out of the lightweight web route", () => {
    const settingsSource = readFileSync(join(__dirname, "..", "..", "..", "src/pages/Settings.tsx"), "utf8");
    expect(settingsSource).not.toContain('from("notification_preferences")');
    expect(settingsSource).not.toContain("Push notifications");
  });

  it("preserves the originating surface from both desktop-rail settings triggers", () => {
    const railSource = readFileSync(join(__dirname, "DesktopSurfaceRail.tsx"), "utf8");
    expect(railSource).toContain('const returnTo = `${pathname}${search}`;');
    expect(railSource.match(/navigate\("\/edit-profile", \{ state: \{ returnTo \} \}\)/g)).toHaveLength(2);
    expect(railSource.match(/navigate\("\/member", \{ state: \{ returnTo \} \}\)/g)).toHaveLength(2);
    expect(railSource).not.toContain('onManageMembership={() => navigate("/member")}');
  });
});
