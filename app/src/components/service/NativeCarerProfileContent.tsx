import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeSyntheticEvent, type TextLayoutEventData, type StyleProp, type ViewStyle } from "react-native";
import {
  formatCarerTime,
  formatNativeCareCurrencySymbol,
  formatNativeCareLocationSummary,
  isProfessionalCredentialComplete,
  isVerifiedPublicCredentialLabel,
  type NativeCarerProfileViewData,
  type NativeProfessionalCredential,
  type NativePublicCredentialBadge,
} from "../../lib/nativeCarerProfile";
import {
  huddleButtons,
  huddleColors,
  huddleGlassControls,
  huddlePolaroid,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleSocial,
  huddleType,
} from "../../theme/huddleDesignTokens";
import { NativePolaroidCard, nativePolaroidStyles, type NativePolaroidBadge } from "../NativePolaroidCard";
import { NativeRatingBadge } from "../NativeRatingBadge";
import {
  fetchNativeProviderRatingSummaries,
  fetchNativeProviderReviewPreviews,
  type NativeProviderRatingSummary,
  type NativeProviderReviewPreview,
} from "../../lib/nativeService";
import { NativeServiceProfileImage } from "./NativeServiceProfileImage";

type NativeCarerProfileContentProps = {
  provider: NativeCarerProfileViewData;
  accessToken?: string | null;
  canRequestService?: boolean;
  onRequestService?: () => void;
  showRequestAction?: boolean;
  /** Optional control pinned to the top-right of the card photo (e.g. share). */
  topRightOverlay?: ReactNode;
};

const serviceLabel = (provider: NativeCarerProfileViewData, value: string) =>
  value === "Others" && provider.servicesOther.trim() ? provider.servicesOther.trim() : value;

const keepServiceWordsTogether = (value: string) =>
  value.replace(/-/g, "\u2011").replace(/ /g, "\u00A0");

const STORY_COLLAPSE_THRESHOLD = 160;
const REVIEW_PREVIEW_LIMIT = 5;
const REVIEW_PREVIEW_PAGE_SIZE = 5;
const REVIEW_PREVIEW_MAX_LIMIT = 25;
const REVIEW_COLLAPSED_LINES = 2;
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

const PROFESSIONAL_DISCLOSURE_COPY = "Only qualifications marked Verified were matched by huddle. Please review before booking.";

const normalizeCredentialLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const findCredentialForBadge = (badge: NativePublicCredentialBadge, credentials: NativeProfessionalCredential[]) =>
  credentials.find((credential) => normalizeCredentialLabel(credential.professional_type) === normalizeCredentialLabel(badge.credentialType)) ?? null;

const credentialDisplayLabel = (label: string) =>
  isVerifiedPublicCredentialLabel(label) ? "Verified" : "Self-declared";

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

const formatReviewTimeAgo = (value: string) => {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Just now";
  const diff = Math.max(0, Date.now() - then);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;
  if (diff < minute) return "Just now";
  if (diff < hour) {
    const count = Math.max(1, Math.floor(diff / minute));
    return `${count} ${count === 1 ? "minute" : "minutes"} ago`;
  }
  if (diff < day) {
    const count = Math.max(1, Math.floor(diff / hour));
    return `${count} ${count === 1 ? "hour" : "hours"} ago`;
  }
  if (diff < month) {
    const count = Math.max(1, Math.floor(diff / day));
    return `${count} ${count === 1 ? "day" : "days"} ago`;
  }
  if (diff < year) {
    const count = Math.max(1, Math.floor(diff / month));
    return `${count} ${count === 1 ? "month" : "months"} ago`;
  }
  const count = Math.max(1, Math.floor(diff / year));
  return `${count} ${count === 1 ? "year" : "years"} ago`;
};

function ReviewPreviewCard({ review, style }: { review: NativeProviderReviewPreview; style?: StyleProp<ViewStyle> }) {
  const [expanded, setExpanded] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const canToggle = lineCount > REVIEW_COLLAPSED_LINES;
  const onTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const nextLineCount = event.nativeEvent.lines.length;
    setLineCount((current) => (current === nextLineCount ? current : nextLineCount));
  };

  return (
    <View style={[styles.reviewCard, style]}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewAuthorBlock}>
          <Text numberOfLines={1} style={styles.reviewAuthor}>{review.reviewerDisplayName}</Text>
        </View>
        <View style={styles.reviewMetaRow}>
          <Text numberOfLines={1} style={styles.reviewTime}>{formatReviewTimeAgo(review.createdAt)}</Text>
          <Text numberOfLines={1} style={styles.reviewInlineRating}>★ {review.rating.toFixed(1)}</Text>
        </View>
      </View>
      {review.tags.length > 0 ? (
        <View style={styles.reviewTagRow}>
          {review.tags.map((tag) => (
            <View key={tag} style={styles.reviewTagPill}>
              <Text numberOfLines={1} style={styles.reviewTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.reviewQuoteFrame}>
        <Text style={styles.reviewQuoteOpen}>“</Text>
        <Text
          numberOfLines={expanded ? undefined : REVIEW_COLLAPSED_LINES}
          onTextLayout={onTextLayout}
          style={styles.reviewQuote}
        >
          {review.reviewText}
        </Text>
        <Text style={styles.reviewQuoteClose}>”</Text>
      </View>
      {canToggle ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [styles.reviewToggle, pressed ? styles.pressed : null]}>
          <Text style={styles.reviewToggleText}>{expanded ? "Read less" : "Read more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SafeCredentialRows({ credential, maskedIdentifier }: { credential: NativeProfessionalCredential | null; maskedIdentifier?: string | null }) {
  const safeMaskedIdentifier = normalizeMaskedIdentifierForPublic(maskedIdentifier);
  return (
    <>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Identifier:</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={styles.certificateValue}>{safeMaskedIdentifier || "—"}</Text>
      </View>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Country/region:</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={styles.certificateValue}>{credential?.country_region || "—"}</Text>
      </View>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Issued by:</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={3} style={styles.certificateValue}>{credential?.issuing_body || "—"}</Text>
      </View>
      <View style={styles.certificateRow}>
        <Text numberOfLines={1} style={styles.certificateLine}>Expires:</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={styles.certificateValue}>{credential?.expiry_date || "—"}</Text>
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
    <View style={[styles.certificateCard, verified ? styles.certificateCardVerified : null, cardWidth ? { width: cardWidth } : null]}>
      <View style={styles.credentialCardHeader}>
        <View style={styles.credentialBadgeRow}>
          <View style={[styles.credentialPill, credentialPillStyle(displayLabel)]}>
            <Text numberOfLines={1} style={[styles.credentialPillText, credentialPillTextStyle(displayLabel)]}>{displayLabel}</Text>
          </View>
        </View>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.certificateType}>
          {credential?.professional_type || badge.credentialType || "Professional credential"}
        </Text>
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
        <View style={styles.credentialBadgeRow}>
          <View style={[styles.credentialPill, styles.credentialPillSelfDeclared]}>
            <Text numberOfLines={1} style={[styles.credentialPillText, styles.credentialPillTextSelfDeclared]}>Self-declared</Text>
          </View>
        </View>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.certificateType}>
          {credentialFallbackTitle(credential)}
        </Text>
      </View>
      <View style={styles.certificateDivider} />
      <SafeCredentialRows credential={credential} />
      <Text style={styles.credentialCaveat}>Self-declared details. Please check qualifications before booking.</Text>
    </View>
  );
}

export function NativeCarerProfileContent({
  provider,
  accessToken,
  canRequestService = true,
  onRequestService,
  showRequestAction = false,
  topRightOverlay,
}: NativeCarerProfileContentProps) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [failedSlideUrls, setFailedSlideUrls] = useState<string[]>([]);
  const [publicCredentialBadges, setPublicCredentialBadges] = useState<NativePublicCredentialBadge[]>(provider.publicCredentialBadges ?? []);
  const [professionalRailWidth, setProfessionalRailWidth] = useState(0);
  const [ratingSummary, setRatingSummary] = useState<NativeProviderRatingSummary | null>(null);
  const [reviewPreviews, setReviewPreviews] = useState<NativeProviderReviewPreview[]>([]);
  const [reviewVisibleLimit, setReviewVisibleLimit] = useState(REVIEW_PREVIEW_LIMIT);
  const { width: viewportWidth } = useWindowDimensions();
  const reviewCarouselCardWidth = Math.max(0, viewportWidth - huddleSpacing.x8);

  const providerUserId = provider.userId ?? null;
  useEffect(() => {
    if (!accessToken || !providerUserId) {
      setRatingSummary(null);
      setReviewPreviews([]);
      return;
    }
    let active = true;
    void Promise.all([
      fetchNativeProviderRatingSummaries([providerUserId], accessToken),
      fetchNativeProviderReviewPreviews([providerUserId], accessToken, reviewVisibleLimit),
    ])
      .then(([summaries, previews]) => {
        if (!active) return;
        setRatingSummary(summaries.get(providerUserId) ?? null);
        setReviewPreviews(previews.get(providerUserId) ?? []);
      })
      .catch(() => {
        if (!active) return;
        setRatingSummary(null);
        setReviewPreviews([]);
      });
    return () => { active = false; };
  }, [accessToken, providerUserId, reviewVisibleLimit]);

  useEffect(() => {
    setReviewVisibleLimit(REVIEW_PREVIEW_LIMIT);
  }, [provider.userId]);

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
    () => publicCredentialBadges.filter((badge) => isVerifiedPublicCredentialLabel(badge.publicLabel)),
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
  const reviewCount = ratingSummary?.reviewCount ?? reviewPreviews[0]?.reviewCount ?? 0;
  const hasMoreReviews = reviewPreviews.length > 0 && reviewCount > reviewPreviews.length && reviewVisibleLimit < REVIEW_PREVIEW_MAX_LIMIT;
  const expandedReviewPreviews = reviewVisibleLimit > REVIEW_PREVIEW_LIMIT ? reviewPreviews.slice(REVIEW_PREVIEW_LIMIT) : [];
  const locationSummary = formatNativeCareLocationSummary(provider.locationStyles, provider.areaName, provider.preferredMeetupAreas);

  const goToSlide = (direction: -1 | 1) => {
    if (visibleSlides.length <= 1) return;
    setHeroIndex((current) => (current + direction + visibleSlides.length) % visibleSlides.length);
  };

  const polaroidBadges: NativePolaroidBadge[] = [];
  if (verifiedPublicCredentialBadges.length > 0) {
    polaroidBadges.push({ color: huddleColors.onPrimary, name: "check-circle", style: nativePolaroidStyles.badgeSuccess });
  }
  if (isUrgentNotice(provider)) {
    polaroidBadges.push({ color: huddleColors.onPrimary, name: "zap", style: nativePolaroidStyles.badgePlus });
  }

  return (
    <View style={styles.container}>
      <View style={styles.polaroidOuter}>
        <NativePolaroidCard
          badges={polaroidBadges}
          trailingBadge={ratingSummary ? <NativeRatingBadge rating={ratingSummary.avgRating} compact /> : null}
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
              {topRightOverlay ? <View style={styles.topRightOverlay}>{topRightOverlay}</View> : null}
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

      {showRequestAction ? (
        <View style={styles.requestButtonWrap}>
          <Pressable
            accessibilityRole="button"
            disabled={!canRequestService}
            onPress={onRequestService}
            style={({ pressed }) => [styles.requestButton, pressed && canRequestService ? styles.pressed : null, !canRequestService ? styles.disabled : null]}
          >
            <Text style={styles.requestText}>{canRequestService ? "Book Care" : "Verify identity to book"}</Text>
          </Pressable>
        </View>
      ) : null}

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
            const hasPrice = Boolean(row.price && row.rate);
            return (
              <View key={`${label}:${index}`} style={[styles.serviceRow, index === 0 ? styles.rowBorderTop : null]}>
                <Text style={styles.serviceLabel}>{label}</Text>
                {row.voluntary && hasPrice ? (
                  <Text style={styles.servicePrice}>Voluntary · {formatNativeCareCurrencySymbol(provider.currency)}{row.price} <Text style={styles.serviceUnit}>/ {row.rate.toLowerCase()}</Text></Text>
                ) : row.voluntary ? (
                  <Text style={styles.askPrice}>Voluntary</Text>
                ) : hasPrice ? (
                  <Text style={styles.servicePrice}>{formatNativeCareCurrencySymbol(provider.currency)}{row.price} <Text style={styles.serviceUnit}>/ {row.rate.toLowerCase()}</Text></Text>
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
                {availabilityDaysText ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.inlineInfoText}>{availabilityDaysText}</Text> : null}
                {availabilityTimeText ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.inlineInfoText}>{availabilityTimeText}</Text> : null}
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
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.inlineInfoText}>{provider.minNoticeValue} {provider.minNoticeUnit} notice</Text>
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
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.inlineInfoText}>{locationSummary || "—"}</Text>
            </View>
          </View>
          ) : null}
        </View>
      ) : null}

      {ratingSummary || reviewPreviews.length > 0 ? (
        <View style={styles.reviewsSection}>
          <View style={styles.reviewsHeader}>
            <View style={styles.reviewsTitleRow}>
              <View style={styles.reviewsTitleTextRow}>
                <Text style={[styles.sectionLabel, styles.reviewsSectionLabel]}>Reviews</Text>
              </View>
              {ratingSummary ? <NativeRatingBadge count={reviewCount} rating={ratingSummary.avgRating} /> : null}
            </View>
          </View>
          {reviewPreviews.length > 0 ? (
            <View style={styles.reviewCarouselWrap}>
              <ScrollView
                horizontal
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                snapToInterval={reviewCarouselCardWidth + huddleSpacing.x3}
                contentContainerStyle={styles.reviewCarouselContent}
              >
                {reviewPreviews.slice(0, REVIEW_PREVIEW_LIMIT).map((review) => (
                  <ReviewPreviewCard key={review.reviewId} review={review} style={{ width: reviewCarouselCardWidth }} />
                ))}
              </ScrollView>
              {reviewPreviews.length > 1 ? (
                <View pointerEvents="none" style={styles.reviewCarouselHint}>
                  <Feather color={huddleColors.iconMuted} name="chevron-right" size={huddleSocial.actionIconSize} />
                </View>
              ) : null}
            </View>
          ) : null}
          {expandedReviewPreviews.length > 0 ? (
            <View style={styles.reviewExpandedList}>
              {expandedReviewPreviews.map((review) => (
                <ReviewPreviewCard key={review.reviewId} review={review} />
              ))}
            </View>
          ) : null}
          {hasMoreReviews ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setReviewVisibleLimit((current) => Math.min(current + REVIEW_PREVIEW_PAGE_SIZE, REVIEW_PREVIEW_MAX_LIMIT))}
              style={({ pressed }) => [styles.reviewMoreButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.reviewMoreText}>See More</Text>
            </Pressable>
          ) : null}
        </View>
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
  requestButtonWrap: {
    paddingHorizontal: huddleSpacing.x3,
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
  topRightOverlay: {
    position: "absolute",
    top: huddleSpacing.x2,
    right: huddleSpacing.x2,
    zIndex: 5,
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
    overflow: "hidden",
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
  certificateCardVerified: {
    ...huddleGlassControls.surface,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
  },
  credentialCardHeader: {
    minWidth: 0,
    gap: 4,
  },
  credentialBadgeRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  credentialPill: {
    flexShrink: 1,
    alignSelf: "flex-end",
    minHeight: 28,
    maxWidth: "72%",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
  },
  credentialPillMatched: {
    minHeight: 22,
    paddingHorizontal: huddleSpacing.x2,
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
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.success,
  },
  credentialPillTextSelfDeclared: {
    color: huddleColors.mutedText,
  },
  certificateType: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
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
    minWidth: 0,
    flexShrink: 1,
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
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
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
  reviewsSection: {
    gap: huddleSpacing.x2,
  },
  reviewsHeader: {
    paddingHorizontal: huddleSpacing.x5,
  },
  reviewsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  reviewsTitleTextRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
  },
  reviewsSectionLabel: {
    marginBottom: 0,
  },
  reviewCarouselWrap: {
    position: "relative",
  },
  reviewCarouselContent: {
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x1,
  },
  reviewCarouselHint: {
    position: "absolute",
    right: huddleSpacing.x4,
    top: "50%",
    width: huddleSocial.carouselButtonSize,
    height: huddleSocial.carouselButtonSize,
    marginTop: -huddleSocial.carouselButtonSize / 2,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  reviewExpandedList: {
    gap: huddleSpacing.x2,
  },
  reviewCard: {
    marginHorizontal: huddleSpacing.x3,
    padding: huddleSpacing.x4,
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
  },
  reviewAuthorBlock: {
    flex: 1,
    minWidth: 0,
  },
  reviewAuthor: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  reviewTime: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  reviewMetaRow: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  reviewInlineRating: {
    fontFamily: "Urbanist-800",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.coral,
  },
  reviewTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
  reviewTagPill: {
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.glassControl,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSocial.tagPaddingVertical,
  },
  reviewTagText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleSocial.tagFontSize,
    lineHeight: huddleType.metaLine,
    color: huddleColors.blue,
  },
  reviewQuoteFrame: {
    position: "relative",
    paddingHorizontal: huddleSpacing.x4,
  },
  reviewQuoteOpen: {
    position: "absolute",
    left: 0,
    top: 0,
    fontFamily: "Georgia",
    fontSize: huddleType.h2,
    lineHeight: huddleType.h2Line,
    color: huddleColors.text,
  },
  reviewQuote: {
    fontFamily: "Urbanist-600Italic",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  reviewQuoteClose: {
    position: "absolute",
    right: 0,
    bottom: 0,
    fontFamily: "Georgia",
    fontSize: huddleType.h2,
    lineHeight: huddleType.h2Line,
    color: huddleColors.text,
  },
  reviewToggle: {
    alignSelf: "flex-start",
  },
  reviewToggleText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
  },
  reviewMoreButton: {
    alignSelf: "flex-start",
    marginLeft: huddleSpacing.x5,
    marginTop: huddleSpacing.x1,
  },
  reviewMoreText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.55,
  },
});
