import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostMediaCarousel } from "./PostMediaCarousel";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("PostMediaCarousel", () => {
  it("renders every media item and applies the app sensitive-media treatment", () => {
    render(
      <PostMediaCarousel
        isSensitive
        items={[
          { src: "https://images.example/one.jpg", alt: "First" },
          { src: "https://images.example/two.jpg", alt: "Second" },
        ]}
      />,
    );

    expect(screen.getByAltText("First")).toHaveStyle({ filter: "blur(100px)" });
    expect(screen.getByAltText("Second")).toHaveStyle({ filter: "blur(100px)" });
    expect(screen.getAllByText("Tap to view")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Next image" })).toBeInTheDocument();
    expect(screen.getByAltText("First").parentElement).toHaveStyle({ width: "100%" });
  });

  it("keeps carousel navigation inside the media control", () => {
    const parentAction = vi.fn();
    render(
      <div onClick={parentAction}>
        <PostMediaCarousel
          items={[
            { src: "https://images.example/one.jpg", alt: "First" },
            { src: "https://images.example/two.jpg", alt: "Second" },
          ]}
        />
      </div>,
    );

    const next = screen.getByRole("button", { name: "Next image" });
    const rail = screen.getByAltText("First").parentElement?.parentElement as HTMLDivElement;
    rail.scrollTo = vi.fn();
    fireEvent.pointerDown(next);
    fireEvent.click(next);
    expect(parentAction).not.toHaveBeenCalled();
    expect(rail.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("supports the app's double-tap reaction without opening the media viewer", () => {
    const onDoubleTap = vi.fn();
    render(
      <PostMediaCarousel
        items={[{ src: "https://images.example/post.jpg", alt: "Neighbourhood post" }]}
        onDoubleTap={onDoubleTap}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("button"));

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("drags the carousel with a mouse as well as native touch scrolling", () => {
    render(
      <PostMediaCarousel
        items={[
          { src: "https://images.example/one.jpg", alt: "First" },
          { src: "https://images.example/two.jpg", alt: "Second" },
        ]}
      />,
    );

    const firstSlide = screen.getByAltText("First").parentElement as HTMLDivElement;
    const rail = firstSlide.parentElement as HTMLDivElement;
    Object.defineProperty(rail, "scrollLeft", { configurable: true, writable: true, value: 0 });
    const down = createEvent.pointerDown(firstSlide);
    Object.defineProperties(down, { pointerId: { value: 1 }, clientX: { value: 180 } });
    fireEvent(firstSlide, down);
    const move = createEvent.pointerMove(firstSlide);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 80 } });
    fireEvent(firstSlide, move);

    expect(rail.scrollLeft).toBe(100);
  });

  it("uses the native staged sensitive-media interaction", () => {
    render(
      <PostMediaCarousel
        isSensitive
        items={[{ src: "https://images.example/sensitive.jpg", alt: "Sensitive" }]}
      />,
    );

    const media = screen.getByAltText("Sensitive").parentElement as HTMLElement;
    expect(screen.getByText("Tap to view")).toBeInTheDocument();
    fireEvent.click(media);
    expect(screen.getByText("Tap again to enlarge")).toBeInTheDocument();
    expect(screen.getByAltText("Sensitive")).toHaveStyle({ filter: "blur(0px)" });
    fireEvent.click(media);
    expect(screen.getByRole("button", { name: "Close media viewer" })).toBeInTheDocument();
  });
});
