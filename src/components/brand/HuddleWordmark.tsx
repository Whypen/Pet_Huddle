/**
 * The huddle wordmark — the word "huddle" in brand blue.
 *
 * Uses `huddle-blue.png`, which is the wordmark on its own. Not
 * `huddle-name-transparent.png`; that asset has the bear glyph tucked inside the
 * "h" and is a different mark.
 *
 * The brand is lower-case. Do not capitalise it.
 */

import { cn } from "@/lib/utils";
import huddleBlue from "@/assets/huddle-blue.png";

type HuddleWordmarkProps = {
  /** Rendered height in px. Width follows the wordmark's aspect ratio. */
  size?: number;
  className?: string;
};

export function HuddleWordmark({ size = 28, className }: HuddleWordmarkProps) {
  return (
    <img
      src={huddleBlue}
      alt="huddle"
      className={cn("w-auto object-contain", className)}
      style={{ height: size }}
    />
  );
}

export default HuddleWordmark;
