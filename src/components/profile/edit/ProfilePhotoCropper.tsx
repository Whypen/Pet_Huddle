import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { GlassModal } from "@/components/ui/GlassModal";
import { NeuButton } from "@/components/ui/NeuButton";
import { Slider } from "@/components/ui/slider";
import { prepareProfilePhotoFile, PROFILE_PHOTO_FINAL_MAX_BYTES, PROFILE_PHOTO_LONG_EDGE } from "@/lib/profilePhotos";
import type { SoloAspect } from "@/types/profilePhotos";
import { aspectLabels } from "./copy/slotBriefs";

type ProfilePhotoCropperProps = {
  file: File | null;
  aspect: "4/5" | "3/2" | "free";
  onCancel: () => void;
  onSave: (blob: Blob, soloAspect: SoloAspect | null) => Promise<void>;
};

const aspectToNumber = (aspect: "4/5" | "3/2" | SoloAspect) => {
  if (aspect === "1:1") return 1;
  if (aspect === "3/2") return 3 / 2;
  if (aspect === "16:9") return 16 / 9;
  return 4 / 5;
};

const createImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const encodeCanvas = (canvas: HTMLCanvasElement, type: "image/webp" | "image/jpeg", quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("encode_failed"));
      else resolve(blob);
    }, type, quality);
  });

const cropToBlob = async (imageSrc: string, area: Area): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const scale = Math.min(1, PROFILE_PHOTO_LONG_EDGE / Math.max(area.width, area.height));
  const width = Math.max(1, Math.round(area.width * scale));
  const height = Math.max(1, Math.round(area.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);

  try {
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const compressed = await encodeCanvas(canvas, "image/webp", quality);
      if (compressed.size <= PROFILE_PHOTO_FINAL_MAX_BYTES || quality === 0.52) return compressed;
    }
  } catch {
    return encodeCanvas(canvas, "image/jpeg", 0.85);
  }
  return encodeCanvas(canvas, "image/jpeg", 0.85);
};

export function ProfilePhotoCropper({ file, aspect, onCancel, onSave }: ProfilePhotoCropperProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedSoloAspect, setSelectedSoloAspect] = useState<SoloAspect>("4:5");

  const numericAspect = useMemo(
    () => aspectToNumber(aspect === "free" ? selectedSoloAspect : aspect),
    [aspect, selectedSoloAspect],
  );

  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    void prepareProfilePhotoFile(file)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
      })
      .catch(() => {
        if (!revoked) onCancel();
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, onCancel]);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedPixels) return;
    setSaving(true);
    try {
      const blob = await cropToBlob(imageSrc, croppedPixels);
      await onSave(blob, aspect === "free" ? selectedSoloAspect : null);
    } finally {
      setSaving(false);
    }
  }, [aspect, croppedPixels, imageSrc, onSave, selectedSoloAspect]);

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      const step = event.shiftKey ? 8 : 1;
      if (event.key === "ArrowLeft") setCrop((prev) => ({ ...prev, x: prev.x - step }));
      if (event.key === "ArrowRight") setCrop((prev) => ({ ...prev, x: prev.x + step }));
      if (event.key === "ArrowUp") setCrop((prev) => ({ ...prev, y: prev.y - step }));
      if (event.key === "ArrowDown") setCrop((prev) => ({ ...prev, y: prev.y + step }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file, onCancel]);

  return (
    <GlassModal isOpen={Boolean(file)} onClose={onCancel} title="Crop photo" maxWidth="max-w-md">
      {aspect === "free" ? (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {(["1:1", "4:5", "16:9"] as SoloAspect[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`h-9 rounded-[var(--radius-pill)] text-xs font-semibold transition-colors ${
                selectedSoloAspect === option
                  ? "bg-[var(--huddle-blue)] text-white"
                  : "bg-white/55 text-[var(--fg-1)]"
              }`}
              onClick={() => setSelectedSoloAspect(option)}
            >
              {aspectLabels[option]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative h-[420px] max-h-[54svh] overflow-hidden rounded-[var(--radius-lg)] bg-black">
        {imageSrc ? (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={numericAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedPixels(pixels)}
          />
        ) : null}
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="type-label text-[var(--fg-1)]">Zoom</span>
            <span className="type-helper text-[var(--fg-2)]">{zoom.toFixed(1)}x</span>
          </div>
          <Slider min={1} max={3} step={0.05} value={[zoom]} onValueChange={([value]) => setZoom(value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NeuButton type="button" variant="secondary" onClick={onCancel}>Cancel</NeuButton>
          <NeuButton type="button" onClick={handleSave} loading={saving}>Save</NeuButton>
        </div>
      </div>
    </GlassModal>
  );
}
