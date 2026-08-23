import { Image as ExpoImage, type ImageProps } from "expo-image";
import { useEffect, useState } from "react";
import { parseNativePetImageStorageRef, resolveNativePetImageUrl, resolveNativePetImageUrlAsync } from "../lib/nativeStorageUrlCache";

type NativePetImageProps = Omit<ImageProps, "source"> & {
  uri: string;
};

export function NativePetImage({ uri, ...props }: NativePetImageProps) {
  const immediate = resolveNativePetImageUrl(uri);
  const [resolvedUri, setResolvedUri] = useState<string | null>(immediate);
  const [triedPrivateFallback, setTriedPrivateFallback] = useState(false);

  useEffect(() => {
    let active = true;
    const nextImmediate = resolveNativePetImageUrl(uri);
    setResolvedUri(nextImmediate);
    setTriedPrivateFallback(false);
    if (nextImmediate) return () => { active = false; };
    void resolveNativePetImageUrlAsync(uri)
      .then((value) => { if (active) setResolvedUri(value); })
      .catch(() => { if (active) setResolvedUri(null); });
    return () => { active = false; };
  }, [uri]);

  if (!resolvedUri) return null;
  return (
    <ExpoImage
      {...props}
      onError={(event) => {
        props.onError?.(event);
        if (triedPrivateFallback) return;
        const publicRef = parseNativePetImageStorageRef(uri);
        if (publicRef?.kind !== "storage" || publicRef.bucket !== "pets") return;
        setTriedPrivateFallback(true);
        void resolveNativePetImageUrlAsync(`private_pet_photos/${publicRef.objectPath}`)
          .then((value) => { if (value) setResolvedUri(value); })
          .catch(() => undefined);
      }}
      source={{ uri: resolvedUri }}
    />
  );
}
