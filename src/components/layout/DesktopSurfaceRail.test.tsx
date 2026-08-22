import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { DesktopSurfaceRail } from "./DesktopSurfaceRail";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "member@huddle.pet" }, profile: {}, signOut: vi.fn() }),
}));

vi.mock("@/components/layout/SettingsMenu", () => ({
  SettingsMenu: ({ triggerContent }: { triggerContent: ReactNode }) => <div>{triggerContent}</div>,
}));

vi.mock("@/components/layout/SettingsAvatar", () => ({
  SettingsAvatar: () => <span>Avatar</span>,
}));

vi.mock("@/components/brand/HuddleWordmark", () => ({
  HuddleWordmark: () => <span>Huddle</span>,
}));

vi.mock("@/components/brand/WebBrandMedia", () => ({
  WebBrandMedia: () => <span>H</span>,
}));

vi.mock("@/components/icons/HuddleIcons", () => ({
  HuddleGlyph: () => <span>Icon</span>,
  HuddleNavIcon: () => <span>Icon</span>,
}));

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
});

describe("DesktopSurfaceRail collapse interaction", () => {
  it("visibly collapses while the pointer is still inside, then previews on re-entry", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/social"]}>
        <DesktopSurfaceRail><main>Social</main></DesktopSurfaceRail>
      </MemoryRouter>,
    );
    const rail = container.querySelector("aside");
    expect(rail).toHaveStyle({ width: "256px" });

    fireEvent.mouseEnter(rail!);
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(rail).toHaveStyle({ width: "76px" });
    expect(localStorage.getItem("huddle_web_rail")).toBe("collapsed");

    fireEvent.mouseLeave(rail!);
    fireEvent.mouseEnter(rail!);
    expect(rail).toHaveStyle({ width: "256px" });

    fireEvent.click(screen.getByRole("button", { name: "Keep navigation expanded" }));
    expect(rail).toHaveStyle({ width: "256px" });
    expect(localStorage.getItem("huddle_web_rail")).toBe("expanded");
  });
});
