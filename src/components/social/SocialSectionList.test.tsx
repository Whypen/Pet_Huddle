import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialSectionList } from "./SocialSectionList";
import { SOCIAL_SECTIONS } from "./socialSections";

afterEach(cleanup);

describe("Social section navigation", () => {
  it("stays locked to the native section order", () => {
    const nativeSource = readFileSync(
      join(process.cwd(), "app/src/screens/NativeSocialScreen.tsx"),
      "utf8",
    );
    const match = nativeSource.match(/const SOCIAL_TAGS = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const nativeSections = Array.from(match?.[1].matchAll(/"([^"]+)"/g) ?? []).map((entry) => entry[1]);
    expect([...SOCIAL_SECTIONS]).toEqual(nativeSections);
  });

  it("renders one familiar section list and reports the selected destination", () => {
    const onSelect = vi.fn();
    render(<SocialSectionList selected={null} onSelect={onSelect} />);

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "All",
      ...SOCIAL_SECTIONS,
    ]);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(onSelect).toHaveBeenCalledWith("Events");
  });

  it("keeps mobile taps selectable instead of treating touch jitter as a drag", () => {
    const onSelect = vi.fn();
    render(<SocialSectionList selected={null} onSelect={onSelect} />);
    const pets = screen.getByRole("button", { name: "Pets" });

    fireEvent.pointerDown(pets, { pointerId: 7, pointerType: "touch", clientX: 160 });
    fireEvent.pointerMove(pets, { pointerId: 7, pointerType: "touch", clientX: 154 });
    fireEvent.pointerUp(pets, { pointerId: 7, pointerType: "touch", clientX: 154 });
    fireEvent.click(pets);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("Pets");
  });

  it("shows directional overflow affordances as the topic rail scrolls", () => {
    render(<SocialSectionList selected={null} onSelect={vi.fn()} />);
    const rail = screen.getByRole("navigation", { name: "Social topics" });
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 320 },
      scrollWidth: { configurable: true, value: 640 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });

    fireEvent.scroll(rail);
    expect(screen.getByTestId("topic-overflow-right")).toBeInTheDocument();
    expect(screen.queryByTestId("topic-overflow-left")).not.toBeInTheDocument();

    rail.scrollLeft = 320;
    fireEvent.scroll(rail);
    expect(screen.getByTestId("topic-overflow-left")).toBeInTheDocument();
    expect(screen.queryByTestId("topic-overflow-right")).not.toBeInTheDocument();
  });
});
