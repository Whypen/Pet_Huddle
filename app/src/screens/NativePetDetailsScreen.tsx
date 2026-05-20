import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  NativePetDetailsContent,
  type NativePetDetailsData,
} from "../components/NativePetDetailsContent";
import { fetchNativePublicProfileOwnerPet, fetchNativePublicProfilePet } from "../lib/nativePublicProfile";
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
  onNavigate: (path: string) => void;
};

export function NativePetDetailsScreen({ accessToken, petId, sessionKey, userId, onNavigate }: NativePetDetailsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<NativePetDetailsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

        const data = petId
          ? await fetchNativePublicProfilePet(petId, accessToken, { ...scope, force: true })
          : userId
          ? await fetchNativePublicProfileOwnerPet(userId, accessToken, { ...scope, force: true })
          : null;
        if (active) {
          setPet(data);
          setLoadError(data ? null : "Pet details are unavailable.");
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
        <View style={styles.loadingState}>
          <ActivityIndicator color={huddleColors.blue} size="small" />
          <Text style={styles.stateText}>Loading pet details...</Text>
        </View>
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

  const canEditPet = pet.owner_id === userId && Boolean(pet.id);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <NativePetDetailsContent
          pet={pet}
          onPetCardPress={canEditPet ? () => onNavigate(`/edit-pet-profile?id=${pet.id}`) : undefined}
        />
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
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
  },
  stateText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
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
});
