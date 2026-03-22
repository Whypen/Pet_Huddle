/**
 * AppBackground — DESIGN_MASTER_SPEC §2 Global canvas (MANDATORY)
 *
 * Renders a fixed full-screen diagonal cool gradient + subtle noise layer
 * behind every screen. Place once in App.tsx above the router output.
 *
 * Swatches (locked):
 *   Canvas highlight: #F5F7F6
 *   Light frost:      #E0E0F0
 *   Mid wash:         #C5CBE1
 *   Deeper wash:      #A0B0D0
 *   Deep corner tint: #566BAC
 */

// Inline SVG noise filter as a data URI — 3% opacity, no external assets
const NOISE_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")";

export function AppBackground() {
  return (
    <>
      {/* Layer 1 — global standardized white canvas */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 pointer-events-none"
        style={{ background: "#FFFFFF" }}
      />
      {/* Layer 2 — disabled to keep pure white background */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none opacity-0"
        style={{ backgroundImage: NOISE_DATA_URI }}
      />
    </>
  );
}
