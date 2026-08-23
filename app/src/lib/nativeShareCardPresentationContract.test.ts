import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "../components/share/NativeShareCard.tsx"), "utf8");

describe("native share-card presentation", () => {
  it("renders a role immediately while measured overflow settles", () => {
    expect(source()).toContain('join(" · ") || "ANIMAL FRIEND"');
    expect(source()).toContain("adjustsFontSizeToFit={items.length > 1}");
    expect(source()).not.toContain('style={[textStyle, { opacity: 0 }]}');
  });

  it("clips wordmark transparency before attaching the tier suffix", () => {
    const value = source();
    expect(value).toContain("<View style={styles.wordmarkClip}>");
    expect(value).toMatch(/wordmarkClip: \{ width: 69, height: 20, overflow: "hidden" \}/);
    expect(value).toMatch(/wordmarkRow: \{ flexDirection: "row", alignItems: "center" \}/);
    expect(value).toContain("transform: [{ translateY: 2 }]");
  });

  it("fits names on one line and uses two lines only when their measured width requires it", () => {
    const value = source();
    expect(value).toContain("function MeasuredFittingName");
    expect(value).toContain("numberOfLines={needsTwoLines ? 2 : 1}");
    expect(value).toContain('<MeasuredFittingName name={data.name} width={width - 40} />');
  });

  it("uses the shared memory-disk image cache without a fade transition", () => {
    expect(source()).toContain('cachePolicy="memory-disk" contentFit="cover"');
    expect(source()).toContain("transition={0}");
  });
});
