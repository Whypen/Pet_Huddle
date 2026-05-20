import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchNativePublicProfilePet, type NativePublicProfile } from "../../lib/nativePublicProfile";
import type { NativePetDetailsData } from "../NativePetDetailsContent";
import { NativePetDetailsModal } from "../NativePetDetailsModal";
import { NativeSocialExpandedMediaViewer, type NativeSocialCarouselItem } from "../social/NativeSocialFeedPrimitives";
import { NativeProfileColophon } from "./NativeProfileColophon";
import { NativeProfileHero } from "./NativeProfileHero";
import { NativeProfilePack } from "./NativeProfilePack";
import { NativeProfilePhotoPlate } from "./NativeProfilePhotoPlate";
import { NativeProfilePullQuote } from "./NativeProfilePullQuote";
import { NativeProfileVitals, type NativeProfileVitalsRow } from "./NativeProfileVitals";
import { huddleColors, huddleRadii, huddleSpacing } from "../../theme/huddleDesignTokens";

type NativePublicProfileContentProps = {
  accessToken?: string | null;
  currentUserId?: string | null;
  memberNumber?: number | null;
  profile: NativePublicProfile;
  sessionKey?: string | null;
};

const computeAge = (dob: string) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const formatLocation = (value: string) => {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[0] || "";
};

const joinValues = (values: string[], separator = " · ") => (
  values.map((value) => value.trim()).filter(Boolean).join(separator)
);

const normalizeAvailability = (items: string[]) => (
  items.map((item) => {
    const value = String(item || "").trim();
    if (value === "Vet") return "Veterinarian";
    if (/^animal friend\s*\(no pet\)$/i.test(value)) return "Animal Friend";
    return value;
  })
);

export function NativePublicProfileContent({ accessToken, currentUserId, memberNumber, profile, sessionKey }: NativePublicProfileContentProps) {
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [petLoading, setPetLoading] = useState(false);
  const [petError, setPetError] = useState<string | null>(null);
  const [petData, setPetData] = useState<NativePetDetailsData | null>(null);

  const viewModel = useMemo(() => {
    const age = computeAge(profile.dob);
    const roleLabels = normalizeAvailability(profile.availabilityStatus).filter(Boolean);
    const roleValue = roleLabels.join(", ");
    const locationValue = formatLocation(profile.locationName);
    const education = joinValues([profile.degree, profile.major, profile.school]);
    const allEditorialPhotosUploaded = Boolean(
      profile.photos.cover &&
      profile.photos.establishing &&
      profile.photos.pack &&
      profile.photos.solo &&
      profile.photos.closer,
    );
    const primaryVitalsRows: NativeProfileVitalsRow[] = [];
    if (roleValue) primaryVitalsRows.push({ label: "Social role", value: roleValue, icon: "paw", iconFamily: "material" });
    if (age != null) primaryVitalsRows.push({ label: "Age", value: String(age), icon: "fire", iconFamily: "material" });
    if (locationValue) primaryVitalsRows.push({ label: "Location", value: locationValue, icon: "map-pin", iconFamily: "feather" });
    if (profile.visibility.show_height && profile.height.trim()) {
      primaryVitalsRows.push({ label: "Height", value: `${profile.height} cm`, icon: "ruler", iconFamily: "material" });
    }

    const aboutVitalsRows: NativeProfileVitalsRow[] = [];
    if (profile.gender.trim()) aboutVitalsRows.push({ label: "Gender", value: profile.gender, icon: "account-circle-outline", iconFamily: "material" });
    if (profile.visibility.show_orientation && profile.orientation.trim()) {
      aboutVitalsRows.push({ label: "Orientation", value: profile.orientation, icon: "heart", iconFamily: "feather" });
    }
    if (profile.visibility.show_academic && education) {
      aboutVitalsRows.push({ label: "Education", value: education, icon: "school-outline", iconFamily: "material" });
    }
    if (profile.visibility.show_occupation && profile.occupation.trim()) {
      aboutVitalsRows.push({ label: "Works at", value: profile.occupation, icon: "briefcase-outline", iconFamily: "material" });
    }
    if (profile.visibility.show_affiliation && profile.affiliation.trim()) {
      aboutVitalsRows.push({ label: "Affiliation", value: profile.affiliation, icon: "bank-outline", iconFamily: "material" });
    }
    if ((profile.visibility.show_languages ?? true) && profile.languages.length) {
      aboutVitalsRows.push({ label: "Speaks", value: profile.languages.join(", "), icon: "translate", iconFamily: "material" });
    }
    if (profile.visibility.show_relationship_status && profile.relationshipStatus.trim()) {
      aboutVitalsRows.push({ label: "Relationship", value: profile.relationshipStatus, icon: "heart", iconFamily: "feather" });
    }
    return {
      aboutIntro: {
        label: "Something about me",
        socialId: profile.socialId,
      },
      aboutVitalsRows,
      allEditorialPhotosUploaded,
      primaryVitalsRows,
      roleLabels,
      vitalsRows: [...primaryVitalsRows, ...aboutVitalsRows],
    };
  }, [profile]);
  const hasPackSection = profile.petHeads.length > 0;
  const profileMediaItems = useMemo<NativeSocialCarouselItem[]>(() => {
    const urls = [
      profile.resolvedPhotoUrls.cover,
      profile.resolvedPhotoUrls.establishing,
      profile.resolvedPhotoUrls.pack,
      profile.resolvedPhotoUrls.solo,
      profile.resolvedPhotoUrls.closer,
    ].filter((url): url is string => Boolean(url));
    return Array.from(new Set(urls)).map((uri) => ({ kind: "image", uri }));
  }, [
    profile.resolvedPhotoUrls.closer,
    profile.resolvedPhotoUrls.cover,
    profile.resolvedPhotoUrls.establishing,
    profile.resolvedPhotoUrls.pack,
    profile.resolvedPhotoUrls.solo,
  ]);

  const openProfileImage = (src: string) => {
    const nextIndex = Math.max(0, profileMediaItems.findIndex((item) => item.uri === src));
    setExpandedIndex(nextIndex);
    setExpandedOpen(true);
  };

  const openPet = async (petId: string, isPublic: boolean) => {
    if (!isPublic || !petId) return;
    setPetModalOpen(true);
    setPetLoading(true);
    setPetError(null);
    const scope = { sessionKey, viewerId: currentUserId ?? null };
    let showedCachedPet = false;
    try {
      const cachedPet = await fetchNativePublicProfilePet(petId, accessToken, { ...scope, force: false });
      if (cachedPet) {
        showedCachedPet = true;
        setPetData(cachedPet);
        setPetLoading(false);
      }
      const freshPet = await fetchNativePublicProfilePet(petId, accessToken, { ...scope, force: true });
      setPetData(freshPet);
      setPetError(freshPet ? null : "Pet details are unavailable.");
    } catch {
      setPetError(showedCachedPet ? "Unable to refresh pet details. Please try again." : "Unable to load pet details.");
    } finally {
      setPetLoading(false);
    }
  };

  const closePet = () => {
    setPetModalOpen(false);
    setPetLoading(false);
    setPetError(null);
    setPetData(null);
  };

  if (profile.nonSocial) {
    return (
      <View style={styles.nonSocialState}>
        <View style={styles.nonSocialIcon}>
          <Feather color={huddleColors.iconMuted} name="user" size={24} />
        </View>
        <Text style={styles.nonSocialTitle}>{profile.displayName || "User"}</Text>
        <Text style={styles.nonSocialText}>This user has enabled Non-Social mode and is not available for discovery or chat.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NativeProfileHero
        isVerified={profile.isVerified}
        membershipTier={profile.membershipTier}
        name={profile.displayName}
        roleLabels={viewModel.roleLabels}
        src={profile.resolvedPhotoUrls.cover}
      />
      {profile.visibility.show_bio ? <NativeProfilePullQuote bio={profile.bio} /> : null}
      <NativeProfilePhotoPlate
        accessibilityLabel={`${profile.displayName || "Profile"} photo`}
        aspect="4/5"
        caption={profile.photos.establishing_caption}
        onPress={openProfileImage}
        src={profile.resolvedPhotoUrls.establishing}
      />
      {hasPackSection ? (
        <>
          <NativeProfilePack
            displayName={profile.displayName}
            experienceYears={profile.experienceYears}
            onPetPress={(petId, isPublic) => { void openPet(petId, isPublic); }}
            petExperience={profile.petExperience}
            pets={profile.petHeads}
          />
          <NativeProfilePhotoPlate
            accessibilityLabel={`${profile.displayName || "Profile"} with pets`}
            aspect="3/2"
            caption={profile.photos.pack_caption}
            onPress={openProfileImage}
            src={profile.resolvedPhotoUrls.pack}
          />
        </>
      ) : null}
      <NativeProfileVitals rows={viewModel.allEditorialPhotosUploaded ? viewModel.primaryVitalsRows : viewModel.vitalsRows} />
      <NativeProfilePhotoPlate
        accessibilityLabel={`${profile.displayName || "Profile"} solo photo`}
        align="full-bleed"
        aspect={profile.photos.solo_aspect ?? "4:5"}
        caption={profile.photos.solo_caption}
        onPress={openProfileImage}
        src={profile.resolvedPhotoUrls.solo}
      />
      {viewModel.allEditorialPhotosUploaded ? (
        <NativeProfileVitals intro={viewModel.aboutIntro} rows={viewModel.aboutVitalsRows} title={null} />
      ) : null}
      <NativeProfilePhotoPlate
        accessibilityLabel={`${profile.displayName || "Profile"} final photo`}
        aspect="4/5"
        caption={profile.photos.closer_caption}
        onPress={openProfileImage}
        src={profile.resolvedPhotoUrls.closer}
      />
      <NativeProfileColophon lastActiveAt={profile.lastActiveAt} memberNumber={memberNumber} memberSince={profile.memberSince} />

      <NativePetDetailsModal
        error={petError}
        loading={petLoading}
        onClose={closePet}
        open={petModalOpen}
        pet={petData}
      />

      <NativeSocialExpandedMediaViewer
        activeIndex={expandedIndex}
        items={profileMediaItems}
        onClose={() => setExpandedOpen(false)}
        onIndexChange={setExpandedIndex}
        open={expandedOpen && profileMediaItems.length > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
  },
  nonSocialState: {
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    minHeight: 360,
    padding: huddleSpacing.x5,
    backgroundColor: huddleColors.canvas,
  },
  nonSocialIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.mutedCanvas,
  },
  nonSocialTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.text,
  },
  nonSocialText: {
    maxWidth: 280,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 17,
    color: huddleColors.mutedText,
  },
});
