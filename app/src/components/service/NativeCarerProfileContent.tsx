import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  formatCarerTime,
  isProfessionalCredentialComplete,
  type NativeCarerProfileViewData,
  type NativeProfessionalCredential,
  type NativePublicCredentialBadge,
} from "../../lib/nativeCarerProfile";
import {
  huddleButtons,
  huddleColors,
  huddlePolaroid,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";
import { NativePolaroidCard, nativePolaroidStyles, type NativePolaroidBadge } from "../NativePolaroidCard";
import { NativeServiceProfileImage } from "./NativeServiceProfileImage";

type NativeCarerProfileContentProps = {
  provider: NativeCarerProfileViewData;
  canRequestService?: boolean;
  onRequestService?: () => void;
  showRequestAction?: boolean;
};

const serviceLabel = (provider: NativeCarerProfileViewData, value: string) =>
  value === "Others" && provider.servicesOther.trim() ? provider.servicesOther.trim() : value;

const keepServiceWordsTogether = (value: string) =>
  value.replace(/-/g, "\u2011").replace(/ /g, "\u00A0");

const STORY_COLLAPSE_THRESHOLD = 160;
const PET_SIZE_ORDER = ["Small", "Medium", "Large", "Giant"] as const;

const sortPetSizes = (sizes: string[]) =>
  [...sizes].sort((a, b) => {
    const aIndex = PET_SIZE_ORDER.indexOf(a as (typeof PET_SIZE_ORDER)[number]);
    const bIndex = PET_SIZE_ORDER.indexOf(b as (typeof PET_SIZE_ORDER)[number]);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

const isUrgentNotice = (provider: NativeCarerProfileViewData) => {
  if (provider.emergencyReadiness === true) return true;
  const value = Number.parseInt(provider.minNoticeValue, 10);
  return provider.minNoticeUnit === "hours" && Number.isFinite(value) && value <= 2;
};

const MATCHED_PUBLIC_LABELS = new Set(["Registry matched", "Certificate matched", "Organization matched", "Directory matched"]);
const PROFESSIONAL_DISCLOSURE_COPY = "Only qualifications marked Verified were matched by huddle. Please review before booking.";

const normalizeCredentialLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const findCredentialForBadge = (badge: NativePublicCredentialBadge, credentials: NativeProfessionalCredential[]) =>
  credentials.find((credential) => normalizeCredentialLabel(credential.professional_type) === normalizeCredentialLabel(badge.credentialType)) ?? null;

const credentialDisplayLabel = (label: string) =>
  MATCHED_PUBLIC_LABELS.has(label) ? "Verified" : "Self-declared";

const formatCredentialBadgeDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const credentialFallbackTitle = (credential: NativeProfessionalCredential | null) =>
  credential?.professional_type.trim() || "Professional details";

const credentialPillStyle = (label: string) =>
  label === "Verified" ? styles.credentialPillMatched : styles.credentialPillSelfDeclared;

const credentialPillTextStyle = (label: string) =>
  label === "Verified" ? styles.credentialPillTextMatched : styles.credentialPillTextSelfDeclared;

const normalizeMaskedIdentifierForPublic = (value: string | null | undefined) => {
  const compact = String(value ?? "").trim().replace(/\s+/g, "");
  if (!compact || !/[•*]/.test(compact)) return "";
  const prefix = compact.match(/^[^•*]{1,2}/)?.[0] ?? "";
  const suffix = compact.replace(/[•*]/g, "").slice(-4);
  return `${prefix}••••${suffix}`;
};

const formatVerifiedCaveat = (badge: NativePublicCredentialBadge, checkedAt: string) => {
  if (!badge.sourceName || !checkedAt) return "";
  return `Matched with ${badge.sourceName} on ${checkedAt}. Please still review before booking.`;
};

function SafeCredentialRows({ credential, maskedIdentifier }: { credential: NativeProfessionalCredential | null; maskedIdentifier?: string | null }) {
  const safeMaskedIdentifier = normalizeMaskedIdentifierForPublic(maskedIdentifier);
  return (
    <>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Identifier:</Text>
        <Text numberOfLines={1} style={styles.certificateValue}>{safeMaskedIdentifier || "—"}</Text>
      </View>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Country/region:</Text>
        <Text numberOfLines={1} style={styles.certificateValue}>{credential?.country_region || "—"}</Text>
      </View>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Issued by:</Text>
        <Text numberOfLines={1} style={styles.certificateValue}>{credential?.issuing_body || "—"}</Text>
      </View>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Expires:</Text>
        <Text numberOfLines={1} style={styles.certificateValue}>{credential?.expiry_date || "—"}</Text>
      </View>
    </>
  );
}

function CredentialBadgeCard({ badge, cardWidth, credential }: { badge: NativePublicCredentialBadge; cardWidth?: number; credential: NativeProfessionalCredential | null }) {
  const checkedAt = formatCredentialBadgeDate(badge.checkedAt);
  const displayLabel = credentialDisplayLabel(badge.publicLabel);
  const verified = displayLabel === "Verified";
  const verifiedCaveat = verified ? formatVerifiedCaveat(badge, checkedAt) : "";
  return (
    <View style={[styles.certificateCard, cardWidth ? { width: cardWidth } : null]}>
      <View style={styles.credentialCardHeader}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={styles.certificateType}>
          {credential?.professional_type || badge.credentialType || "Professional credential"}
        </Text>
        <View style={[styles.credentialPill, credentialPillStyle(displayLabel)]}>
          <Text numberOfLines={1} style={[styles.credentialPillText, credentialPillTextStyle(displayLabel)]}>{displayLabel}</Text>
        </View>
      </View>
      <View style={styles.certificateDivider} />
      <SafeCredentialRows credential={credential} maskedIdentifier={badge.maskedIdentifier} />
      {verifiedCaveat ? <Text style={styles.credentialCaveat}>{verifiedCaveat}</Text> : null}
      {!verified ? <Text style={styles.credentialCaveat}>Self-declared details. Please check qualifications before booking.</Text> : null}
    </View>
  );
}

function SelfDeclaredCredentialCard({ cardWidth, credential }: { cardWidth?: number; credential: NativeProfessionalCredential | null }) {
  return (
    <View style={[styles.certificateCard, cardWidth ? { width: cardWidth } : null]}>
      <View style={styles.credentialCardHeader}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={styles.certificateType}>
          {credentialFallbackTitle(credential)}
        </Text>
        <View style={[styles.credentialPill, styles.credentialPillSelfDeclared]}>
          <Text numberOfLines={1} style={[styles.credentialPillText, styles.credentialPillTextSelfDeclared]}>Self-declared</Text>
        </View>
      </View>
      <View style={styles.certificateDivider} />
      <SafeCredentialRows credential={credential} />
      <Text style={styles.credentialCaveat}>Self-declared details. Please check qualifications before booking.</Text>
    </View>
  );
}

export function NativeCarerProfileContent({
  provider,
  canRequestService = true,
  onRequestService,
  showRequestAction = false,
}: NativeCarerProfileContentProps) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [failedSlideUrls, setFailedSlideUrls] = useState<string[]>([]);
  const [publicCredentialBadges, setPublicCredentialBadges] = useState<NativePublicCredentialBadge[]>(provider.publicCredentialBadges ?? []);
  const [professionalRailWidth, setProfessionalRailWidth] = useState(0);

  const slides = useMemo(() => {
    const next: string[] = [];
    if (provider.avatarUrl) next.push(provider.avatarUrl);
    provider.socialAlbumUrls.forEach((url) => {
      if (url && !next.includes(url)) next.push(url);
    });
    return next;
  }, [provider.avatarUrl, provider.socialAlbumUrls]);

  const visibleSlides = useMemo(
    () => slides.filter((url) => !failedSlideUrls.includes(url)),
    [failedSlideUrls, slides],
  );

  useEffect(() => {
    setHeroIndex(0);
    setFailedSlideUrls([]);
  }, [slides]);

  useEffect(() => {
    setPublicCredentialBadges(provider.publicCredentialBadges ?? []);
  }, [provider.publicCredentialBadges, provider.userId]);

  const credentialSlides = useMemo(
    () => provider.professional.credentials.filter(isProfessionalCredentialComplete),
    [provider.professional.credentials],
  );
  const verifiedPublicCredentialBadges = useMemo(
    () => publicCredentialBadges.filter((badge) => MATCHED_PUBLIC_LABELS.has(badge.publicLabel)),
    [publicCredentialBadges],
  );
  const hasProfessionalDetails = provider.professional.enabled || credentialSlides.length > 0;
  const credentialCardWidth = professionalRailWidth > 0 ? Math.max(252, (professionalRailWidth - huddleSpacing.x1) * 0.8) : undefined;

  const serviceCaptions = provider.servicesOffered.map((service) => keepServiceWordsTogether(serviceLabel(provider, service)));
  const availabilityDaysText = provider.days.length === 7 ? "Every day" : provider.days.map((day) => day.slice(0, 3)).join(", ");
  const availabilityTimeText = provider.timeBlocks.includes("Anytime")
    ? "Anytime"
    : provider.otherTimeFrom && provider.otherTimeTo
      ? `${formatCarerTime(provider.otherTimeFrom)} - ${formatCarerTime(provider.otherTimeTo)}`
      : "";

  const goToSlide = (direction: -1 | 1) => {
    if (visibleSlides.length <= 1) return;
    setHeroIndex((current) => (current + direction + visibleSlides.length) % visibleSlides.length);
  };

  const polaroidBadges: NativePolaroidBadge[] = [];
  if (provider.hasCar) {
    polaroidBadges.push({ color: huddleColors.onPrimary, name: "truck", style: nativePolaroidStyles.badgePrimary });
  }
  if (verifiedPublicCredentialBadges.length > 0) {
    polaroidBadges.push({ color: huddleColors.onPrimary, name: "check-circle", style: nativePolaroidStyles.badgeSuccess });
  }
  if (isUrgentNotice(provider)) {
    polaroidBadges.push({ color: huddleColors.onPrimary, name: "zap", style: nativePolaroidStyles.badgeEmergency });
  }

  return (
    <View style={styles.container}>
      <View style={styles.polaroidOuter}>
        <NativePolaroidCard
          badges={polaroidBadges}
          captionPrimary={provider.displayName || "Pet Carer"}
          captionSecondary={serviceCaptions.length > 0 ? (
            <View style={nativePolaroidStyles.captionSecondaryWrapDetail}>
              {serviceCaptions.map((service, index) => (
                <Text key={`${service}:${index}`} style={nativePolaroidStyles.captionSecondaryTokenDetail}>
                  {index > 0 ? " · " : ""}{service}
                </Text>
              ))}
            </View>
          ) : null}
          photo={(
            <>
              {visibleSlides.length > 0 ? (
                <NativeServiceProfileImage
                  accessibilityIgnoresInvertColors
                  onError={() => {
                    const failedUrl = visibleSlides[Math.min(heroIndex, visibleSlides.length - 1)];
                    if (failedUrl) setFailedSlideUrls((current) => current.includes(failedUrl) ? current : [...current, failedUrl]);
                  }}
                  resizeMode="cover"
                  uri={visibleSlides[Math.min(heroIndex, visibleSlides.length - 1)]}
                  style={nativePolaroidStyles.photo}
                />
              ) : (
                <View style={nativePolaroidStyles.photoPlaceholder}>
                  <Feather color={huddleColors.iconSubtle} name="image" size={34} />
                </View>
              )}
            </>
          )}
          photoOverlay={(
            <>
              {visibleSlides.length > 1 ? (
                <>
                  <Pressable accessibilityLabel="Previous" onPress={() => goToSlide(-1)} style={({ pressed }) => [styles.heroArrow, styles.heroArrowLeft, pressed ? styles.pressed : null]}>
                    <Feather color={huddleColors.text} name="chevron-left" size={20} />
                  </Pressable>
                  <Pressable accessibilityLabel="Next" onPress={() => goToSlide(1)} style={({ pressed }) => [styles.heroArrow, styles.heroArrowRight, pressed ? styles.pressed : null]}>
                    <Feather color={huddleColors.text} name="chevron-right" size={20} />
                  </Pressable>
                  <View style={styles.dots}>
                    {visibleSlides.map((_, index) => (
                      <View key={index} style={[styles.dot, index === heroIndex ? styles.dotActive : null]} />
                    ))}
                  </View>
                </>
              ) : null}
            </>
          )}
          variant="detail"
        />
      </View>

      {provider.story.trim() ? (
        <View style={styles.storySection}>
          <Text style={styles.quoteOpen}>“</Text>
          <Text
            numberOfLines={!storyExpanded && provider.story.length > STORY_COLLAPSE_THRESHOLD ? 5 : undefined}
            style={styles.storyText}
          >
            {provider.story}
          </Text>
          {provider.story.length > STORY_COLLAPSE_THRESHOLD ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStoryExpanded((current) => !current)}
              style={({ pressed }) => [styles.storyToggle, pressed ? styles.pressed : null]}
            >
              <Text style={styles.storyToggleText}>{storyExpanded ? "See less" : "Read more"}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.quoteClose}>”</Text>
        </View>
      ) : null}

      {provider.rateRows.some((row) => row.services.length > 0 || row.price) ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>Care Scope</Text>
          </View>
          {provider.rateRows.filter((row) => row.services.length > 0 || row.price).map((row, index) => {
            const label = row.services.length > 0 ? row.services.map((service) => keepServiceWordsTogether(serviceLabel(provider, service))).join(" · ") : "All\u00A0care";
            const hasPrice = Boolean(row.price && row.rate && provider.currency);
            return (
              <View key={`${label}:${index}`} style={[styles.serviceRow, index === 0 ? styles.rowBorderTop : null]}>
                <Text style={styles.serviceLabel}>{label}</Text>
                {row.voluntary ? (
                  <Text style={styles.askPrice}>Voluntary</Text>
                ) : hasPrice ? (
                  <Text style={styles.servicePrice}>{provider.currency} {row.price} <Text style={styles.serviceUnit}>/ {row.rate.toLowerCase()}</Text></Text>
                ) : (
                  <Text style={styles.askPrice}>Add details</Text>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {provider.petTypes.length > 0 ? (
        <View style={styles.infoCard}>
          <View style={styles.infoSection}>
            <Text style={styles.sectionLabel}>Pet Types</Text>
            <View style={styles.skillWrap}>
              {provider.petTypes.map((petType) => {
                const label = petType === "Others" && provider.petTypesOther ? provider.petTypesOther : petType;
                const sizeLabel = petType === "Dogs" && provider.dogSizes.length > 0
                  ? ` (${sortPetSizes(provider.dogSizes).join(" · ")})`
                  : "";
                return (
                  <View key={petType} style={styles.skillRow}>
                    <View style={styles.skillDot} />
                    <Text style={styles.skillText}>{label}{sizeLabel}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      {provider.skills.length > 0 || hasProfessionalDetails || publicCredentialBadges.length > 0 ? (
        <View style={styles.infoCard}>
          {provider.skills.length > 0 ? (
            <View style={styles.infoSection}>
              <Text style={styles.sectionLabel}>Strengths</Text>
              <View style={styles.skillWrap}>
                {provider.skills.map((skill) => (
                  <View key={skill} style={styles.skillRow}>
                    <View style={styles.skillDot} />
                    <Text style={styles.skillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {hasProfessionalDetails || publicCredentialBadges.length > 0 ? (
            <View style={[styles.infoSection, provider.skills.length > 0 ? styles.sectionBorderTop : null]}>
              <Text style={styles.sectionLabel}>Professional</Text>
              {publicCredentialBadges.length > 0 ? (
                <ScrollView horizontal onLayout={(event) => setProfessionalRailWidth(event.nativeEvent.layout.width)} showsHorizontalScrollIndicator={false} style={styles.certificateRailScroller} contentContainerStyle={styles.certificateRail}>
                  {publicCredentialBadges.map((badge, index) => (
                    <CredentialBadgeCard cardWidth={credentialCardWidth} credential={findCredentialForBadge(badge, credentialSlides)} key={`${badge.credentialType}:${badge.publicLabel}:${badge.sourceName ?? "source"}:${index}`} badge={badge} />
                  ))}
                </ScrollView>
              ) : hasProfessionalDetails ? (
                credentialSlides.length > 0 ? (
                  <ScrollView horizontal onLayout={(event) => setProfessionalRailWidth(event.nativeEvent.layout.width)} showsHorizontalScrollIndicator={false} style={styles.certificateRailScroller} contentContainerStyle={styles.certificateRail}>
                    {credentialSlides.map((credential, index) => (
                      <SelfDeclaredCredentialCard cardWidth={credentialCardWidth} credential={credential} key={`${credential.professional_type}:${credential.country_region}:${index}`} />
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.certificateRailSingle}>
                    <SelfDeclaredCredentialCard cardWidth={credentialCardWidth} credential={null} />
                  </View>
                )
              ) : null}
              <Text style={styles.professionalDisclosure}>{PROFESSIONAL_DISCLOSURE_COPY}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {availabilityDaysText || availabilityTimeText || provider.minNoticeValue || provider.emergencyReadiness === true || provider.locationStyles.length > 0 ? (
        <View style={styles.infoCard}>
          {availabilityDaysText || availabilityTimeText ? (
          <View style={styles.infoSection}>
            <Text style={styles.sectionLabel}>Availability</Text>
            <View style={styles.inlineInfoRow}>
              <Feather color={huddleColors.iconMuted} name="calendar" size={16} />
              <View style={styles.inlineInfoCopy}>
                {availabilityDaysText ? <Text style={styles.inlineInfoText}>{availabilityDaysText}</Text> : null}
                {availabilityTimeText ? <Text style={styles.inlineInfoText}>{availabilityTimeText}</Text> : null}
              </View>
            </View>
          </View>
          ) : null}

          {provider.minNoticeValue || provider.emergencyReadiness === true ? (
          <View style={[styles.infoSection, availabilityDaysText || availabilityTimeText ? styles.sectionBorderTop : null]}>
            <View style={styles.inlineInfoRow}>
              <Feather color={huddleColors.iconMuted} name="clock" size={16} />
              <View style={styles.inlineInfoCopy}>
            {provider.minNoticeValue ? (
              <Text style={styles.inlineInfoText}>{provider.minNoticeValue} {provider.minNoticeUnit} notice</Text>
            ) : null}
            {provider.emergencyReadiness === true ? (
              <View style={styles.emergencyPillStandalone}>
                <Feather color={huddleColors.success} name="check-circle" size={14} />
                <Text style={styles.emergencyText}>Urgent requests within 2 hours</Text>
              </View>
            ) : null}
              </View>
            </View>
          </View>
          ) : null}

          {provider.locationStyles.length > 0 ? (
          <View style={[styles.infoSection, availabilityDaysText || availabilityTimeText || provider.minNoticeValue || provider.emergencyReadiness === true ? styles.sectionBorderTop : null]}>
            <Text style={styles.sectionLabel}>Location</Text>
            <View style={styles.inlineInfoRow}>
              <Feather color={huddleColors.iconMuted} name="map-pin" size={16} />
              <Text style={styles.inlineInfoText}>
                {provider.locationStyles.join(", ")}
                {provider.areaName.trim() ? ` · ${provider.areaName.trim()}` : ""}
              </Text>
            </View>
          </View>
          ) : null}
        </View>
      ) : null}

      {showRequestAction ? (
        <Pressable
          accessibilityRole="button"
          disabled={!canRequestService}
          onPress={onRequestService}
          style={({ pressed }) => [styles.requestButton, pressed && canRequestService ? styles.pressed : null, !canRequestService ? styles.disabled : null]}
        >
          <Text style={styles.requestText}>{canRequestService ? "Book Care" : "Verify identity to book"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x4,
  },
  polaroidOuter: {
    paddingHorizontal: huddleSpacing.x3,
    paddingTop: huddleSpacing.x1,
  },
  heroArrow: {
    position: "absolute",
    top: "50%",
    width: 32,
    height: 32,
    marginTop: -16,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassOverlay,
  },
  heroArrowLeft: {
    left: huddleSpacing.x2,
  },
  heroArrowRight: {
    right: huddleSpacing.x2,
  },
  dots: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassControl,
  },
  dotActive: {
    width: 20,
    backgroundColor: huddleColors.canvas,
  },
  storySection: {
    paddingHorizontal: huddleSpacing.x6,
    paddingVertical: huddleSpacing.x2,
  },
  quoteOpen: {
    fontFamily: "Georgia",
    fontSize: 44,
    lineHeight: 44,
    color: huddleColors.sectionDividerStrong,
    marginBottom: -14,
  },
  quoteClose: {
    fontFamily: "Georgia",
    fontSize: 44,
    lineHeight: 44,
    color: huddleColors.sectionDividerStrong,
    textAlign: "right",
    marginTop: -8,
  },
  storyText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 28,
    color: huddleColors.text,
  },
  storyToggle: {
    alignSelf: "flex-start",
    marginTop: huddleSpacing.x1,
  },
  storyToggleText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  card: {
    overflow: "hidden",
    borderRadius: huddleRadii.card,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.glassElevation1,
  },
  cardHeader: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x3,
  },
  sectionLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
    marginBottom: huddleSpacing.x2,
  },
  mutedText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  serviceRow: {
    minHeight: 56,
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: huddleSpacing.x4,
    borderTopWidth: 1,
    borderTopColor: huddleColors.sectionDividerStrong,
  },
  rowBorderTop: {
    borderTopWidth: 1,
  },
  serviceLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  servicePrice: {
    width: 132,
    textAlign: "right",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  serviceUnit: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
  },
  askPrice: {
    width: 132,
    textAlign: "right",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
    fontStyle: "italic",
  },
  infoCard: {
    overflow: "hidden",
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  infoSection: {
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x5,
  },
  sectionBorderTop: {
    borderTopWidth: 1,
    borderTopColor: huddleColors.sectionDividerStrong,
  },
  skillWrap: {
    gap: huddleSpacing.x3,
    rowGap: huddleSpacing.x3,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  skillDot: {
    width: 6,
    height: 6,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.iconSubtle,
  },
  skillText: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  certifiedSkillText: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
    textDecorationLine: "underline",
  },
  inlineInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
  },
  inlineInfoCopy: {
    flex: 1,
    minWidth: 0,
    gap: huddleSpacing.x1,
  },
  inlineInfoText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  noticeText: {
    marginLeft: huddleSpacing.x4 + huddleSpacing.x3,
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  emergencyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    marginLeft: huddleSpacing.x4 + huddleSpacing.x3,
    marginTop: huddleSpacing.x2,
    alignSelf: "flex-start",
  },
  emergencyPillStandalone: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    marginTop: huddleSpacing.x2,
    alignSelf: "flex-start",
  },
  emergencyText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.success,
  },
  professionalDisclosure: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  certificateRail: {
    gap: huddleSpacing.x3,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x3,
    paddingLeft: huddleSpacing.x1,
    paddingRight: 0,
  },
  certificateRailScroller: {
    marginRight: -huddleSpacing.x5,
  },
  certificateRailSingle: {
    paddingTop: huddleSpacing.x3,
  },
  certificateCard: {
    minWidth: 252,
    minHeight: 220,
    alignSelf: "flex-start",
    justifyContent: "flex-start",
    gap: huddleSpacing.x2,
    padding: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
    backgroundColor: huddlePolaroid.frame.backgroundColor,
    shadowColor: huddlePolaroid.frame.shadowColor,
    shadowOpacity: huddlePolaroid.frame.shadowOpacity,
    shadowRadius: huddlePolaroid.frame.shadowRadius,
    shadowOffset: huddlePolaroid.frame.shadowOffset,
    elevation: huddlePolaroid.frame.elevation,
  },
  credentialCardHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  credentialPill: {
    alignSelf: "center",
    minHeight: 28,
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
  },
  credentialPillMatched: {
    backgroundColor: huddleColors.successSoft,
    borderColor: huddleColors.success,
  },
  credentialPillSelfDeclared: {
    backgroundColor: huddleColors.mutedCanvas,
    borderColor: huddleColors.fieldBorderSoft,
  },
  credentialPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  credentialPillTextMatched: {
    color: huddleColors.success,
  },
  credentialPillTextSelfDeclared: {
    color: huddleColors.mutedText,
  },
  certificateType: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  certificateDivider: {
    height: 1,
    backgroundColor: huddleColors.fieldBorderStrong,
  },
  certificateLine: {
    width: 112,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.text,
  },
  certificateValue: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  credentialCaveat: {
    marginTop: "auto",
    width: "100%",
    flexShrink: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  certificateRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  requestButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  requestText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.55,
  },
});
