import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialComposerBar } from "./SocialComposerBar";

afterEach(cleanup);

describe("SocialComposerBar", () => {
  it("is a real inline composer for signed-in members", () => {
    const onOpen = vi.fn();
    const onContentChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <SocialComposerBar
        avatarUrl={null}
        displayName="Hyphen"
        onOpen={onOpen}
        value=""
        expanded
        onContentChange={onContentChange}
        onSubmit={onSubmit}
        onMediaChange={vi.fn()}
        submitDisabled={false}
      />,
    );

    const composer = screen.getByPlaceholderText("What's happening?");
    fireEvent.focus(composer);
    fireEvent.change(composer, { target: { value: "Hello neighbours", selectionStart: 16 } });
    expect(onOpen).toHaveBeenCalled();
    expect(onContentChange).toHaveBeenCalledWith("Hello neighbours", 16);
    expect(screen.getByLabelText("Add photo or video")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Close composer" })).not.toBeInTheDocument();
  });

  it("stays a one-line trigger until focused or tapped", () => {
    render(<SocialComposerBar onOpen={vi.fn()} />);
    expect(screen.getByPlaceholderText("What's happening?")).toHaveAttribute("rows", "1");
    expect(screen.queryByRole("button", { name: "Add photo or video" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post" })).not.toBeInTheDocument();
  });
});
