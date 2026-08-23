import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import { fetchNativePublicProfilePet, type NativePublicProfile } from "../../lib/nativePublicProfile";
import { buildNativeProfileAreaCity, formatNativeProfileAreaCity } from "../../lib/nativeProfileLocation";
import type { NativePetDetailsData } from "../NativePetDetailsContent";
import { NativePetDetailsModal } from "../NativePetDetailsModal";
import { NativeSocialExpandedMediaViewer, type NativeSocialCarouselItem } from "../social/NativeSocialFeedPrimitives";
import { NativeProfileColophon } from "./NativeProfileColophon";
import { NativeProfileEngagementStats } from "./NativeProfileEngagementStats";
import { NativeProfileHero } from "./NativeProfileHero";
import { NativeProfilePack } from "./NativeProfilePack";
import { NativeProfilePhotoPlate } from "./NativeProfilePhotoPlate";
import { NativeProfilePullQuote } from "./NativeProfilePullQuote";
import { NativeProfileVitals, type NativeProfileVitalsRow } from "./NativeProfileVitals";
import { huddleColors, huddleRadii, huddleShadows, huddleSpacing } from "../../theme/huddleDesignTokens";

type NativePublicProfileContentProps = {
  accessToken?: string | null;
  currentUserId?: string | null;
  heroPresentation?: "card" | "full-bleed";
  memberNumber?: number | null;
  profile: NativePublicProfile;
  sessionKey?: string | null;
};

const joinValues = (values: string[], separator = " · ") => (
  values.map((value) => value.trim()).filter(Boolean).join(separator)
);

const normalizeAvailability = (items: string[]) => (
  items.map((item) => {
    const value = String(item || "").trim();
    if (value === "Vet") return "Veterinarian";
    if (/^animal friend\s*\(no pet\)$/i.test(value)) return "Animal Friend";
    const allowed = new Set(["Pet Parent", "Pet Nanny", "Animal Friend", "Veterinarian", "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer"]);
    return allowed.has(value) ? value : "";
  }).filter(Boolean)
);

const profilePhotoIdentity = (value: string | null | undefined) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.startsWith("data:") || clean.startsWith("blob:")) return clean;
  try {
    const url = new URL(clean);
    const pathname = decodeURIComponent(url.pathname || "").replace(/^\/+/, "");
    const storageMatch = pathname.match(/storage\/v1\/object\/(?:public|sign)\/(.+)$/);
    if (storageMatch?.[1]) return storageMatch[1].replace(/^\/+/, "");
    return pathname || clean.split("?")[0].split("#")[0];
  } catch {
    return clean.split("?")[0].split("#")[0];
  }
};

const sameProfilePhoto = (left: string | null | undefined, right: string | null | undefined) => {
  const leftIdentity = profilePhotoIdentity(left);
  const rightIdentity = profilePhotoIdentity(right);
  return Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
};

const includesProfilePhoto = (urls: Array<string | null | undefined>, candidate: string | null | undefined) => (
  urls.some((url) => sameProfilePhoto(url, candidate))
);

const uniqueProfilePhotoUrls = (...urls: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  return urls.filter((url): url is string => {
    const clean = String(url || "").trim();
    const identity = profilePhotoIdentity(clean);
    if (!clean || !identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

export function NativePublicProfileContent({ accessToken, currentUserId, heroPresentation = "full-bleed", memberNumber, profile, sessionKey }: NativePublicProfileContentProps) {
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [petLoading, setPetLoading] = useState(false);
  const [petError, setPetError] = useState<string | null>(null);
  const [petData, setPetData] = useState<NativePetDetailsData | null>(null);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFailedPhotoUrls(new Set());
  }, [profile.userId, profile.updatedAt]);

  const markPhotoFailed = (url: string | null | undefined) => {
    const clean = String(url || "").trim();
    if (!clean) return;
    setFailedPhotoUrls((current) => {
      if (current.has(clean)) return current;
      const next = new Set(current);
      next.add(clean);
      return next;
    });
  };

  const viewModel = useMemo(() => {
    const age = profile.ageYears;
    const roleLabels = normalizeAvailability(profile.availabilityStatus).filter(Boolean);
    const roleValue = roleLabels.join(", ");
    const formattedLocationDisplay = formatNativeProfileAreaCity(profile.locationDisplay, profile.locationCountry);
    const formattedLocationName = formatNativeProfileAreaCity(profile.locationName, profile.locationCountry);
    const explicitAreaCityValue = profile.locationCity
      ? buildNativeProfileAreaCity(profile.locationDistrict, profile.locationCity, profile.locationCountry)
      : "";
    const canonicalLocationValue = buildNativeProfileAreaCity(
      profile.locationDistrict,
      profile.locationCity || profile.locationCountry,
      profile.locationCountry,
    );
    const locationValue = explicitAreaCityValue || formattedLocationDisplay || formattedLocationName || canonicalLocationValue || profile.locationDistrict;
    const education = joinValues([profile.degree, profile.major, profile.school]);
    const allEditorialPhotosUploaded = Boolean(
      profile.photos.cover &&
      profile.photos.establishing &&
      profile.photos.pack &&
      profile.photos.solo &&
      profile.photos.closer,
    );
    const primaryVitalsRows: NativeProfileVitalsRow[] = [];
    const petJourney = profile.petJourney.trim();
    if (roleValue) primaryVitalsRows.push({ label: "Social role", value: roleValue, icon: "paw", iconFamily: "material" });
    if (petJourney) primaryVitalsRows.push({ label: "Pet journey", value: petJourney, icon: "paw", iconFamily: "material" });
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
    const urls = uniqueProfilePhotoUrls(
      profile.resolvedPhotoUrls.cover,
      profile.resolvedPhotoUrls.establishing,
      profile.resolvedPhotoUrls.pack,
      profile.resolvedPhotoUrls.solo,
      profile.resolvedPhotoUrls.closer,
    );
    return urls.map((uri) => ({ kind: "image", uri }));
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

  // Friends Matching opt-out (discovery_opt_out) no longer hides the profile — these
  // users stay fully visible (e.g. from existing chats / social). They're simply
  // excluded from the Discover deck and can't be Starred/Waved (enforced server-side).

  // Profile photos overwrite deterministic storage paths, so resolved URLs are
  // stable across replacements. Use the profile's updatedAt as the cache-bust
  // version so a replaced photo reloads fresh bytes instead of a cached stale image.
  const photoVersion = profile.updatedAt || null;

  return (
    <View style={styles.container}>
      <View style={[styles.heroSection, heroPresentation === "full-bleed" ? styles.heroSectionFullBleed : null]}>
        <View style={[styles.heroFrame, heroPresentation === "full-bleed" ? styles.heroFrameFullBleed : null]}>
          {profile.resolvedPhotoUrls.cover && !failedPhotoUrls.has(profile.resolvedPhotoUrls.cover) ? (
            <ExpoImage
              accessibilityIgnoresInvertColors
              cachePolicy="memory-disk"
              contentFit="cover"
              key={nativeFreshImageKey(profile.resolvedPhotoUrls.cover, photoVersion || profile.resolvedPhotoUrls.cover)}
              onError={() => markPhotoFailed(profile.resolvedPhotoUrls.cover)}
              source={{ uri: nativeFreshImageUri(profile.resolvedPhotoUrls.cover, photoVersion || profile.resolvedPhotoUrls.cover) }}
              style={styles.heroImage}
              transition={120}
            />
          ) : (
            <View style={styles.heroFallback} />
          )}
          <NativeProfileHero
            engagement={profile.engagement}
            isVerified={profile.isVerified}
            membershipTier={profile.membershipTier}
            name={profile.displayName}
            roleLabels={viewModel.roleLabels}
          />
        </View>
      </View>
      <NativeProfileEngagementStats stats={profile.engagementStats} />
      {profile.visibility.show_bio ? <NativeProfilePullQuote bio={profile.bio} /> : null}
      {profile.resolvedPhotoUrls.establishing && !sameProfilePhoto(profile.resolvedPhotoUrls.establishing, profile.resolvedPhotoUrls.cover) ? (
        <NativeProfilePhotoPlate
          accessibilityLabel={`${profile.displayName || "Profile"} photo`}
          aspect="4/5"
          caption={profile.photos.establishing_caption}
          onPress={openProfileImage}
          src={profile.resolvedPhotoUrls.establishing}
          version={photoVersion || profile.resolvedPhotoUrls.establishing || profile.photos.establishing}
        />
      ) : null}
      {hasPackSection ? (
        <>
          <NativeProfilePack
            displayName={profile.displayName}
            experienceYears={profile.experienceYears}
            onPetPress={(petId, isPublic) => { void openPet(petId, isPublic); }}
            petExperience={profile.petExperience}
            pets={profile.petHeads}
          />
          {profile.resolvedPhotoUrls.pack && !includesProfilePhoto([
            profile.resolvedPhotoUrls.cover,
            profile.resolvedPhotoUrls.establishing,
          ], profile.resolvedPhotoUrls.pack) ? (
            <NativeProfilePhotoPlate
              accessibilityLabel={`${profile.displayName || "Profile"} with pets`}
              aspect="3/2"
              caption={profile.photos.pack_caption}
              onPress={openProfileImage}
              src={profile.resolvedPhotoUrls.pack}
              version={photoVersion || profile.resolvedPhotoUrls.pack || profile.photos.pack}
            />
          ) : null}
        </>
      ) : null}
      <NativeProfileVitals rows={viewModel.allEditorialPhotosUploaded ? viewModel.primaryVitalsRows : viewModel.vitalsRows} />
      {profile.resolvedPhotoUrls.solo && !includesProfilePhoto([
        profile.resolvedPhotoUrls.cover,
        profile.resolvedPhotoUrls.establishing,
        profile.resolvedPhotoUrls.pack,
      ], profile.resolvedPhotoUrls.solo) ? (
        <NativeProfilePhotoPlate
          accessibilityLabel={`${profile.displayName || "Profile"} solo photo`}
          align="full-bleed"
          aspect={profile.photos.solo_aspect ?? "4:5"}
          caption={profile.photos.solo_caption}
          onPress={openProfileImage}
          src={profile.resolvedPhotoUrls.solo}
          version={photoVersion || profile.resolvedPhotoUrls.solo || profile.photos.solo}
        />
      ) : null}
      {viewModel.allEditorialPhotosUploaded ? (
        <NativeProfileVitals intro={viewModel.aboutIntro} rows={viewModel.aboutVitalsRows} title={null} />
      ) : null}
      {profile.resolvedPhotoUrls.closer && !includesProfilePhoto([
        profile.resolvedPhotoUrls.cover,
        profile.resolvedPhotoUrls.establishing,
        profile.resolvedPhotoUrls.pack,
        profile.resolvedPhotoUrls.solo,
      ], profile.resolvedPhotoUrls.closer) ? (
        <NativeProfilePhotoPlate
          accessibilityLabel={`${profile.displayName || "Profile"} final photo`}
          aspect="4/5"
          caption={profile.photos.closer_caption}
          onPress={openProfileImage}
          src={profile.resolvedPhotoUrls.closer}
          version={photoVersion || profile.resolvedPhotoUrls.closer || profile.photos.closer}
        />
      ) : null}
      <NativeProfileColophon engagement={profile.engagement} lastActiveAt={profile.lastActiveAt} memberNumber={memberNumber} memberSince={profile.memberSince} />

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
  heroSection: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
  },
  heroSectionFullBleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  heroFrame: {
    aspectRatio: 4 / 5,
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.mutedCanvas,
    ...huddleShadows.glassElevation1,
  },
  heroFrameFullBleed: {
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFallback: {
    flex: 1,
    backgroundColor: huddleColors.glassControl,
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
