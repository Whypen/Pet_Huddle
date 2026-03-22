import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const Lightbox = ({ src, alt = "", onClose }: LightboxProps) => {
  if (typeof document === "undefined") return null;
  const isVideo = /\.(mp4|mov|m4v|webm|ogg)$/i.test(src) || src.includes("video/");

  return createPortal(
    <div className="fixed inset-0 z-[9500] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center"
        aria-label="Close image"
      >
        <X className="h-5 w-5" />
      </button>
      {isVideo ? (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          className="max-h-[90vh] max-w-[95vw] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img src={src} alt={alt} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
      )}
    </div>,
    document.body
  );
};
