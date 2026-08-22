import { useState } from "react";
import { cn } from "@/lib/utils";
import brandLogoVideo from "@/assets/brand/brandlogo.mp4";
import brandLogoFallback from "@/assets/brand/brandlogofallback.png";

type WebBrandMediaProps = {
  size?: number;
  className?: string;
};

/**
 * The browser rendering of the native Auth mark. Both surfaces use the same
 * tightly-cropped video and fallback assets; the fallback remains underneath
 * until the browser has advanced to a real video frame.
 */
export function WebBrandMedia({ size = 96, className }: WebBrandMediaProps) {
  const [frameReady, setFrameReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size }}
      data-brand-media="native-auth"
    >
      <img
        src={brandLogoFallback}
        alt="huddle"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      {!videoFailed ? (
        <video
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-opacity duration-150",
            frameReady ? "opacity-100" : "opacity-0",
          )}
          onTimeUpdate={(event) => {
            if (event.currentTarget.currentTime > 0.01) setFrameReady(true);
          }}
          onError={() => setVideoFailed(true)}
        >
          <source src={brandLogoVideo} type="video/mp4" />
        </video>
      ) : null}
    </span>
  );
}

export default WebBrandMedia;
