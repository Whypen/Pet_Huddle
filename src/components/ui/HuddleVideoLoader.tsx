// HuddleVideoLoader — branded loading indicator using huddle square.mp4
// Loops until parent unmounts. Size matches sm UserAvatar (32px).

import huddleVideo from "@/assets/huddle square.mp4";

interface HuddleVideoLoaderProps {
  /** Size in px. Defaults to 32 (matches sm UserAvatar). */
  size?: number;
  className?: string;
}

export function HuddleVideoLoader({ size = 32, className = "" }: HuddleVideoLoaderProps) {
  return (
    <video
      src={huddleVideo}
      autoPlay
      muted
      loop
      playsInline
      className={className}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}
