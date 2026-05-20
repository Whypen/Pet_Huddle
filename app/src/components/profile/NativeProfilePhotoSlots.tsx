import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  type NativeProfilePhotos,
  type NativeProfilePhotoSlot as NativeProfilePhotoSlotName,
  type NativeSoloAspect,
} from "../../lib/nativeProfilePhotos";
import { huddleColors, huddleProfilePhotoSlots, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativeProfilePhotoSlot } from "./NativeProfilePhotoSlot";
import { NATIVE_PROFILE_SLOT_ORDER } from "./nativeProfilePhotoSlotBriefs";

type NativeProfilePhotoSlotsProps = {
  onCaptionAutosave?: (photos: NativeProfilePhotos) => void;
  onCaptionCommit?: (photos: NativeProfilePhotos) => void;
  onChange: (next: NativeProfilePhotos | ((previous: NativeProfilePhotos) => NativeProfilePhotos)) => void;
  onError?: (message: string) => void;
  onPhotosCommit?: (photos: NativeProfilePhotos) => void;
  onPreviousPathQueued?: (path: string | null) => void;
  accessToken?: string | null;
  coverError?: boolean;
  photos: NativeProfilePhotos;
  userId: string | null;
};

const CAPTION_KEYS = {
  establishing: "establishing_caption",
  pack: "pack_caption",
  solo: "solo_caption",
  closer: "closer_caption",
} as const;

const captionKeyForSlot = (slot: NativeProfilePhotoSlotName) => (
  slot === "cover" ? null : CAPTION_KEYS[slot]
);

export function NativeProfilePhotoSlots({
  onCaptionAutosave,
  onCaptionCommit,
  onChange,
  onError,
  onPhotosCommit,
  onPreviousPathQueued,
  accessToken,
  coverError = false,
  photos,
  userId,
}: NativeProfilePhotoSlotsProps) {
  const completedCount = NATIVE_PROFILE_SLOT_ORDER.filter((slot) => Boolean(photos[slot])).length;
  const completion = completedCount * 20;

  const commitNext = (nextPhotos: NativeProfilePhotos) => {
    onPhotosCommit?.(nextPhotos);
  };

  const updateSlot = (
    slot: NativeProfilePhotoSlotName,
    path: string,
    soloAspect: NativeSoloAspect | null,
    previousPath: string | null,
  ) => {
    onPreviousPathQueued?.(previousPath);
    let committedPhotos: NativeProfilePhotos | null = null;
    onChange((previous) => {
      const nextPhotos = {
        ...previous,
        [slot]: path,
        solo_aspect: slot === "solo" ? soloAspect ?? previous.solo_aspect ?? "4:5" : previous.solo_aspect,
      };
      committedPhotos = nextPhotos;
      return nextPhotos;
    });
    setTimeout(() => {
      if (committedPhotos) commitNext(committedPhotos);
    }, 0);
  };

  const removeSlot = (slot: NativeProfilePhotoSlotName, previousPath: string | null) => {
    onPreviousPathQueued?.(previousPath);
    const captionKey = captionKeyForSlot(slot);
    let committedPhotos: NativeProfilePhotos | null = null;
    onChange((previous) => {
      const nextPhotos = {
        ...previous,
        [slot]: null,
        ...(captionKey ? { [captionKey]: null } : {}),
        solo_aspect: slot === "solo" ? null : previous.solo_aspect,
      };
      committedPhotos = nextPhotos;
      return nextPhotos;
    });
    setTimeout(() => {
      if (committedPhotos) commitNext(committedPhotos);
    }, 0);
  };

  return (
    <View accessibilityLabel="Your photos" style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Your photos</Text>
        <View style={[styles.progressPill, completion < 41 ? styles.progressWarm : completion < 81 ? styles.progressGreen : styles.progressBlue]}>
          <Text style={styles.progressText}>{completion}%</Text>
        </View>
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollerContent}
        decelerationRate="fast"
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={huddleProfilePhotoSlots.slotWidth + huddleProfilePhotoSlots.railGap}
      >
        {NATIVE_PROFILE_SLOT_ORDER.map((slot) => {
          const captionKey = captionKeyForSlot(slot);
          return (
            <NativeProfilePhotoSlot
              accessToken={accessToken}
              captionValue={captionKey ? photos[captionKey] : null}
              error={slot === "cover" && coverError}
              key={slot}
              onCaptionChange={captionKey ? (caption) => {
                let changedPhotos: NativeProfilePhotos | null = null;
                onChange((previous) => {
                  const nextPhotos = { ...previous, [captionKey]: caption };
                  changedPhotos = nextPhotos;
                  return nextPhotos;
                });
                setTimeout(() => {
                  if (changedPhotos) onCaptionAutosave?.(changedPhotos);
                }, 0);
              } : undefined}
              onCaptionCommit={captionKey ? (caption) => {
                let committedPhotos: NativeProfilePhotos | null = null;
                onChange((previous) => {
                  const nextPhotos = { ...previous, [captionKey]: caption };
                  committedPhotos = nextPhotos;
                  return nextPhotos;
                });
                setTimeout(() => {
                  if (committedPhotos) onCaptionCommit?.(committedPhotos);
                }, 0);
              } : undefined}
              onError={onError}
              onRemoved={removeSlot}
              onUploaded={updateSlot}
              slot={slot}
              soloAspect={photos.solo_aspect}
              userId={userId}
              value={photos[slot]}
            />
          );
        })}
      </ScrollView>

      <Text accessibilityLiveRegion="polite" style={styles.srStatus}>
        Profile photos {completion}% complete.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    gap: huddleSpacing.x2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  title: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
  },
  progressPill: {
    width: huddleProfilePhotoSlots.progressSize,
    height: huddleProfilePhotoSlots.progressSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  progressWarm: {
    backgroundColor: huddleColors.coral,
  },
  progressGreen: {
    backgroundColor: huddleColors.success,
  },
  progressBlue: {
    backgroundColor: huddleColors.blue,
  },
  progressText: {
    fontFamily: "Urbanist-800",
    fontSize: huddleProfilePhotoSlots.progressTextSize,
    color: huddleColors.onPrimary,
  },
  scrollerContent: {
    gap: huddleProfilePhotoSlots.railGap,
    paddingTop: huddleSpacing.x1,
    paddingBottom: huddleSpacing.x3,
  },
  srStatus: {
    width: huddleProfilePhotoSlots.screenReaderSize,
    height: huddleProfilePhotoSlots.screenReaderSize,
    opacity: 0,
  },
});
