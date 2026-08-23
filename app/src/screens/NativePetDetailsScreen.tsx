import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  NativePetDetailsContent,
  mapPetRow,
  type NativePetDetailsData,
} from "../components/NativePetDetailsContent";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { fetchNativePublicProfileOwnerPet, fetchNativePublicProfilePet } from "../lib/nativePublicProfile";
import { fetchNativeAccessiblePet, fetchNativeFamilyPetContext, removeNativeFamilySharedPet, type NativeFamilyPetContext } from "../lib/nativeFamilyPets";
import { clearNativeHomePetsCache } from "./NativeHomeScreen";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { AppModalButton } from "../components/nativeModalPrimitives";
import {
  huddleButtons,
  huddleColors,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativePetDetailsScreenProps = {
  accessToken?: string | null;
  petId: string | null;
  sessionKey?: string | null;
  userId: string | null;
  onGoBack?: () => void;
  onNavigate: (path: string) => void;
};

export function NativePetDetailsScreen({ accessToken, petId, sessionKey, userId, onGoBack, onNavigate }: NativePetDetailsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<NativePetDetailsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [familyContext, setFamilyContext] = useState<NativeFamilyPetContext | null>(null);
  const [removingSharedPet, setRemovingSharedPet] = useState(false);
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      setLoading(false);
      setLoadError("Pet details are taking too long to load. Please try again.");
    },
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      let showedCachedPet = false;
      try {
        if (!petId && !userId) {
          if (active) {
            setPet(null);
            setLoadError("Open a pet from Home to view details.");
            setLoading(false);
          }
          return;
        }

        const scope = { sessionKey, viewerId: userId };
        const accessiblePromise = petId ? fetchNativeAccessiblePet(petId, accessToken).catch(() => null) : Promise.resolve(null);
        const familyContextPromise = petId ? fetchNativeFamilyPetContext(petId, accessToken).catch(() => null) : Promise.resolve(null);
        const cachedData = petId
          ? await fetchNativePublicProfilePet(petId, accessToken, { ...scope, force: false })
          : userId
          ? await fetchNativePublicProfileOwnerPet(userId, accessToken, { ...scope, force: false })
          : null;
        if (active && cachedData) {
          showedCachedPet = true;
          setPet(cachedData);
          setLoadError(null);
          setLoading(false);
        }

        const [accessibleRow, nextFamilyContext] = await Promise.all([accessiblePromise, familyContextPromise]);
        const accessiblePet = accessibleRow ? mapPetRow(accessibleRow) : null;
        const data = accessiblePet || (petId
          ? await fetchNativePublicProfilePet(petId, accessToken, { ...scope, force: true })
          : userId
          ? await fetchNativePublicProfileOwnerPet(userId, accessToken, { ...scope, force: true })
          : null);
        if (active) {
          setPet(data);
          setLoadError(data ? null : "Pet details are unavailable.");
          setFamilyContext(nextFamilyContext);
        }
      } catch {
        if (active) {
          setLoadError(showedCachedPet ? "Unable to refresh pet details. Please try again." : "Pet details are unavailable.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, petId, sessionKey, userId]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <NativeLoadingState variant="centered" />
      </View>
    );
  }

  if (!pet) {
    return (
      <View style={styles.screen}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather color={huddleColors.blue} name="heart" size={22} />
          </View>
          <Text style={styles.emptyTitle}>Pet details</Text>
          <Text style={styles.emptyCopy}>{loadError || "Pet details are unavailable."}</Text>
          <Pressable accessibilityRole="button" onPress={() => onNavigate("/")} style={styles.homeButton}>
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const canEditPet = Boolean(pet.id) && (pet.owner_id === userId || familyContext?.is_family_shared === true);

  return (
    <View style={styles.screen}>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={12} onPress={onGoBack ?? (() => onNavigate("/"))} style={styles.backButton}>
        <Feather color={huddleColors.text} name="arrow-left" size={22} />
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <NativePetDetailsContent
          pet={pet}
          onPetCardPress={canEditPet ? () => onNavigate(`/edit-pet-profile?id=${pet.id}`) : undefined}
        />
        {familyContext?.is_family_shared ? (
          <View style={styles.sharedPetAction}>
            <AppModalButton
              loading={removingSharedPet}
              onPress={() => {
                if (!pet.id || removingSharedPet) return;
                setRemovingSharedPet(true);
                void removeNativeFamilySharedPet(pet.id, accessToken)
                  .then(async () => {
                    await clearNativeHomePetsCache(userId);
                    onNavigate("/");
                  })
                  .catch(() => setLoadError("Please try again."))
                  .finally(() => setRemovingSharedPet(false));
              }}
              variant="secondary"
            >
              Remove from my profile
            </AppModalButton>
            {loadError ? <Text style={styles.sharedPetError}>{loadError}</Text> : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  content: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x9,
    paddingBottom: huddleSpacing.x9,
  },
  backButton: {
    position: "absolute",
    top: huddleSpacing.x2,
    left: huddleSpacing.x3,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: "rgba(33, 69, 207, 0.08)",
  },
  emptyTitle: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: 26,
    color: huddleColors.text,
  },
  emptyCopy: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  homeButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    marginTop: huddleSpacing.x5,
  },
  homeButtonText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  sharedPetAction: {
    marginTop: huddleSpacing.x5,
    gap: huddleSpacing.x2,
  },
  sharedPetError: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
    textAlign: "center",
  },
});
