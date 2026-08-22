import type { CSSProperties } from "react";

// Web counterpart of app/src/components/NativeAuroraCover.tsx. The palette,
// hash and blob ranges are intentionally identical so a missing cover has the
// same deterministic identity on both clients.
const AURORA_ACCENTS: Array<[string, string, string]> = [
  ["#2145CF", "#3A5FE8", "#BFFF00"],
  ["#3A5FE8", "#2145CF", "#FF751F"],
  ["#2145CF", "#0C1E5C", "#BFFF00"],
  ["#FF751F", "#2145CF", "#3A5FE8"],
  ["#2145CF", "#CFAB21", "#BFFF00"],
  ["#3A5FE8", "#FF751F", "#2145CF"],
];

const INK = "#1B3AA0";
const INK_DEEP = "#0C1E5C";

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const layoutForSeed = (seed: string) => {
  const hash = fnv1a(seed || "huddle");
  const [accentA, accentB, accentPop] = AURORA_ACCENTS[hash % AURORA_ACCENTS.length];
  const pick = (shift: number, range: number) => (hash >>> shift) % range;
  return [
    { x: 62 + pick(2, 24), y: 18 + pick(5, 24), r: 62 + pick(8, 20), color: accentA, opacity: 0.9 },
    { x: 12 + pick(11, 26), y: 66 + pick(14, 26), r: 55 + pick(17, 20), color: accentB, opacity: 0.82 },
    { x: 30 + pick(20, 45), y: 55 + pick(23, 35), r: 26 + pick(26, 16), color: accentPop, opacity: 0.7 },
  ];
};

export function AuroraCover({ seed, initial }: { seed: string; initial?: string | null }) {
  const blobs = layoutForSeed(seed);
  const letter = String(initial || "").match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || "";
  const style = {
    backgroundColor: INK_DEEP,
    backgroundImage: [
      ...blobs.map((blob) => `radial-gradient(circle at ${blob.x}% ${blob.y}%, ${blob.color}${Math.round(blob.opacity * 255).toString(16).padStart(2, "0")}, transparent ${blob.r}%)`),
      `linear-gradient(145deg, ${INK}, ${INK_DEEP})`,
    ].join(","),
  } satisfies CSSProperties;

  return (
    <div className="relative h-full w-full overflow-hidden" style={style} aria-hidden>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.14] to-transparent" />
      {letter ? <span className="absolute left-3 top-3 text-lg font-extrabold text-white/85">{letter}</span> : null}
    </div>
  );
}
