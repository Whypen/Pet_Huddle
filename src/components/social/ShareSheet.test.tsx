import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareSheet } from "./ShareSheet";
import type { ShareModel } from "@/lib/shareModel";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: null }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const share: ShareModel = {
  contentType: "thread",
  contentId: "thread-1",
  surface: "Social",
  shareId: "thread-1",
  canonicalUrl: "https://huddle.pet/share/thread-1",
  appUrl: "https://huddle.pet/threads?focus=thread-1",
  title: "Neighbour on huddle",
  description: "A neighbourhood post",
  imageUrl: "https://huddle.pet/huddle-logo.jpg",
  chatHeadline: "Neighbour on huddle's Social",
  countThreadId: "thread-1",
  nativeShareText: "See this post on huddle.",
};

afterEach(cleanup);

describe("ShareSheet public and responsive contract", () => {
  it("uses a centered desktop dialog and hides internal chats when signed out", () => {
    render(<ShareSheet open onClose={vi.fn()} share={share} />);

    expect(screen.getByText("Share")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share…" })).toBeInTheDocument();
    expect(screen.queryByText("Huddle Chats")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search User name or Social ID")).not.toBeInTheDocument();

    const panel = screen.getByText("Share").closest("div")?.parentElement;
    expect(panel).not.toHaveAttribute("data-huddle-bottom-sheet");
    expect(panel).toHaveClass("md:rounded-[28px]");
  });
});
