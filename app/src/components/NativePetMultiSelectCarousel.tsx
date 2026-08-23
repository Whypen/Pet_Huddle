import { Feather } from "@expo/vector-icons";
import { useMemo, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { nativeFreshImageKey, nativeFreshImageUri, nativeMutableImageVersion } from "../lib/nativeImageFreshness";
import { nativePetPresentationImageStyle } from "../lib/nativePetPhotoPresentation";
import { huddleColors, huddleFieldStates, huddlePolaroid, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";
import { NativePetImage } from "./NativePetImage";
import { NativePolaroidCard, nativePolaroidStyles } from "./NativePolaroidCard";

export type NativePetCarouselPet = {
  id: string;
  name?: string | null;
  species?: string | null;
  breed?: string | null;
  photo_url?: string | null;
  photo_presentation?: { home?: { centerX?: number; centerY?: number; widthPct?: number; sourceAspect?: number } } | null;
  updated_at?: string | null;
};

export function NativePetMultiSelectCarousel<TPet extends NativePetCarouselPet>({ error = false, formatCaption, onSelect, pets, selectedPetIds, trailingAction }: {
  error?: boolean;
  formatCaption?: (pet: TPet) => string;
  onSelect: (pet: TPet) => void;
  pets: TPet[];
  selectedPetIds: string[];
  trailingAction?: ReactNode;
}) {
  const selectedPetIdSet = useMemo(() => new Set(selectedPetIds), [selectedPetIds]);
  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={styles.rail}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.viewport}
    >
      {pets.map((pet) => {
        const selected = selectedPetIdSet.has(pet.id);
        const photoVersion = pet.photo_url ? nativeMutableImageVersion(pet.photo_url, pet.updated_at) : null;
        return (
          <View key={pet.id} style={[styles.tile, error ? styles.tileError : null]}>
            <NativePolaroidCard
              accessibilityLabel={`${selected ? "Remove" : "Select"} ${pet.name || "pet"}`}
              captionPrimary={pet.name || "Pet"}
              captionSecondary={<Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>{formatCaption ? formatCaption(pet) : [pet.species, pet.breed].filter(Boolean).join(" · ")}</Text>}
              onPress={() => onSelect(pet)}
              photo={pet.photo_url ? (
                <NativePetImage
                  contentFit="fill"
                  key={nativeFreshImageKey(pet.photo_url, photoVersion)}
                  uri={nativeFreshImageUri(pet.photo_url, photoVersion)}
                  style={[nativePolaroidStyles.photo, nativePetPresentationImageStyle(pet.photo_presentation?.home, huddlePolaroid.photo.aspectRatio)]}
                />
              ) : (
                <View style={nativePolaroidStyles.photoPlaceholder}>
                  <Feather color={huddleColors.iconSubtle} name="image" size={huddlePolaroid.selectionPlaceholderIconSize} />
                </View>
              )}
              photoOverlay={(
                <View pointerEvents="none" style={[styles.selection, selected ? styles.selectionActive : null]}>
                  {selected ? <Feather color={huddleColors.onPrimary} name="check" size={huddlePolaroid.selectionCheckIconSize} /> : null}
                </View>
              )}
            />
          </View>
        );
      })}
      {trailingAction}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewport: { marginRight: -huddleSpacing.x4 },
  rail: { gap: huddleSpacing.x3, paddingTop: huddleSpacing.x1, paddingRight: huddleSpacing.x4, paddingBottom: huddleSpacing.x2 },
  tile: { width: huddlePolaroid.selectionWidth },
  tileError: { borderRadius: huddleRadii.card, ...huddleFieldStates.error },
  selection: {
    position: "absolute",
    top: huddleSpacing.x2,
    right: huddleSpacing.x2,
    width: huddlePolaroid.badge.size,
    height: huddlePolaroid.badge.size,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    borderWidth: huddlePolaroid.selectionBorderWidth,
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.canvas,
  },
  selectionActive: { backgroundColor: huddleColors.blue },
});
