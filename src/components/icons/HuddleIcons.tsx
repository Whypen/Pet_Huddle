import type { SVGProps } from "react";
import {
  GLYPHS,
  NAV_ICONS,
  type HuddleGlyphName,
  type HuddleNavIconName,
} from "./huddleIconPaths";

export type { HuddleGlyphName, HuddleNavIconName };

/**
 * Web-only icons. These two have no native counterpart — the app has no rail,
 * so it has no Create or More affordance. Everything else is reused, not redrawn.
 */
export type HuddleWebIconName = "create" | "more";

export function HuddleNavIcon({
  name,
  size = 24,
  color = "currentColor",
  ...rest
}: { name: HuddleNavIconName; size?: number; color?: string } & Omit<SVGProps<SVGSVGElement>, "color">) {
  const icon = NAV_ICONS[name];
  return (
    <svg width={size} height={size} viewBox={icon.viewBox} fill="none" aria-hidden focusable="false" {...rest}>
      <path d={icon.d} fill={color} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

/** size = rendered HEIGHT; width follows the glyph aspect ratio (same rule as native). */
export function HuddleGlyph({
  name,
  size = 20,
  color = "currentColor",
  ...rest
}: { name: HuddleGlyphName; size?: number; color?: string } & Omit<SVGProps<SVGSVGElement>, "color">) {
  const g = GLYPHS[name];
  return (
    <svg width={size * g.aspect} height={size} viewBox={g.viewBox} fill="none" aria-hidden focusable="false" {...rest}>
      <path d={g.d} fill={color} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

export function HuddleWebIcon({
  name,
  size = 24,
  color = "currentColor",
  ...rest
}: { name: HuddleWebIconName; size?: number; color?: string } & Omit<SVGProps<SVGSVGElement>, "color">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {name === "create" ? <path d="M12 5v14M5 12h14" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
