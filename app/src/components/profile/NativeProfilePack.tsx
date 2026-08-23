import { Feather } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { nativeFreshImageKey, nativeFreshImageUri, nativeMutableImageVersion } from "../../lib/nativeImageFreshness";
import { nativePetPresentationImageStyle } from "../../lib/nativePetPhotoPresentation";
import { NativePolaroidCard, nativePolaroidStyles, type NativePolaroidBadge } from "../NativePolaroidCard";
import { NativePetImage } from "../NativePetImage";
import {
  huddleColors,
  huddlePolaroid,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";

export type NativeProfilePackPet = {
  ageYears?: number | null;
  id: string;
  isPublic?: boolean | null;
  name?: string | null;
  photoUrl?: string | null;
  photoPosition?: { centerX: number; centerY: number; widthPct: number; sourceAspect?: number } | null;
  species?: string | null;
  updatedAt?: string | null;
};

type NativeProfilePackProps = {
  displayName: string;
  experienceYears: string;
  onPetPress?: (petId: string, isPublic: boolean) => void;
  petExperience: string[];
  pets: NativeProfilePackPet[];
};

const privateBadge: NativePolaroidBadge = {
  color: huddleColors.onPrimary,
  name: "lock",
  style: nativePolaroidStyles.badgePrimary,
};

const formatSpecies = (value?: string | null) => {
  const clean = String(value || "").trim();
  if (!clean) return "Pet";
  return clean
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const formatPetAge = (ageYears?: number | null) => (
  typeof ageYears === "number" && Number.isInteger(ageYears) && ageYears >= 0 ? `${ageYears}` : ""
);

const formatPetCaption = (pet: NativeProfilePackPet) => {
  const species = formatSpecies(pet.species);
  const age = formatPetAge(pet.ageYears);
  return [species, age].filter(Boolean).join(" · ");
};

const splitExperienceItem = (value: string) => {
  const [species = "", breed = ""] = String(value || "").split(/[•·]/).map((part) => part.trim());
  return { species: formatSpecies(species), breed };
};

const formatExperienceLine = (years: string, species: string[]) => {
  const numericYears = Number(years || 0);
  const yearsPart = Number.isFinite(numericYears) && numericYears > 0
    ? `${numericYears} ${numericYears === 1 ? "YEAR" : "YEARS"}`
    : null;

  const grouped = new Map<string, string[]>();
  for (const item of species) {
    const parsed = splitExperienceItem(item);
    if (!parsed.species) continue;
    const current = grouped.get(parsed.species) ?? [];
    if (parsed.breed) current.push(parsed.breed);
    grouped.set(parsed.species, current);
  }

  const speciesPart = Array.from(grouped.entries())
    .map(([speciesLabel, breeds]) => (
      breeds.length
        ? `${speciesLabel.toUpperCase()} · ${breeds.map((breed) => breed.toUpperCase()).join(" · ")}`
        : speciesLabel.toUpperCase()
    ))
    .join("\n");

  return [yearsPart, speciesPart].filter(Boolean).join("\n");
};

export function NativeProfilePack({
  displayName,
  experienceYears,
  onPetPress,
  petExperience,
  pets,
}: NativeProfilePackProps) {
  const visiblePets = pets.filter((pet) => pet.id);
  const experienceLine = formatExperienceLine(experienceYears, petExperience);
  if (visiblePets.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.strip}>
        <View style={styles.header}>
          <Text style={styles.title}>The pack</Text>
          {experienceLine ? <Text style={styles.experience}>{experienceLine}</Text> : null}
        </View>

        <ScrollView
          bounces={false}
          contentContainerStyle={styles.petScroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToAlignment="center"
          style={styles.petRail}
        >
          {visiblePets.map((pet) => {
            const isPublic = pet.isPublic !== false;
            return (
              <View key={pet.id} style={styles.petTile}>
                <NativePolaroidCard
                  accessibilityLabel={`Open ${pet.name || "pet"}'s profile`}
                  badges={isPublic ? [] : [privateBadge]}
                  captionPrimary={pet.name || "Pet"}
                  captionSecondary={(
                    <Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>
                      {isPublic ? formatPetCaption(pet) : "PRIVATE"}
                    </Text>
                  )}
	                  disabled={!isPublic}
	                  onPress={isPublic ? () => onPetPress?.(pet.id, isPublic) : undefined}
	                  photo={pet.photoUrl ? (() => {
                      const photoVersion = nativeMutableImageVersion(pet.photoUrl, pet.updatedAt);
                      return (
	                    <NativePetImage accessibilityIgnoresInvertColors blurRadius={isPublic ? 0 : 12} cachePolicy="memory-disk" contentFit="fill" key={nativeFreshImageKey(pet.photoUrl, photoVersion)} uri={nativeFreshImageUri(pet.photoUrl, photoVersion)} style={[nativePolaroidStyles.photo, nativePetPresentationImageStyle(pet.photoPosition, huddlePolaroid.photo.aspectRatio)]} transition={120} />
                      );
                    })() : (
                    <View style={nativePolaroidStyles.photoPlaceholder}>
                      <Feather color={huddleColors.iconSubtle} name="image" size={30} />
                    </View>
                  )}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingBottom: 0,
  },
  strip: {
    paddingTop: huddleSpacing.x7,
    backgroundColor: huddleColors.profilePackCanvas,
  },
  header: {
    paddingHorizontal: huddleSpacing.x5,
  },
  title: {
    fontFamily: "Urbanist-800",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1.12,
    textTransform: "uppercase",
    color: huddleColors.text,
  },
  experience: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    letterSpacing: 0.96,
    textTransform: "uppercase",
    color: huddleColors.subtext,
  },
  petRail: {
    marginTop: huddleSpacing.x4,
    overflow: "visible",
  },
  petScroller: {
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x7,
  },
  petTile: {
    width: 170,
  },
});
