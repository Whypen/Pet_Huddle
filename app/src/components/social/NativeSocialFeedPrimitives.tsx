import { Feather, FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image as RNImage, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type GestureResponderEvent, type NativeSyntheticEvent, type TextLayoutEventData } from "react-native";
import emptyChatImage from "../../../assets/Notifications/empty-chat-native.png";
import { haptic } from "../../lib/nativeHaptics";
import { NativeVerifiedBadge } from "../NativeVerifiedBadge";
import {
  huddleColors,
  huddleFieldStates,
  huddleFormControls,
  huddleImageDefaults,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSocial,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";
import {
  extractNativeSocialFirstHttpUrl,
  formatNativeSocialUrlLabel,
  stripNativeSocialExternalUrlFromText,
  type NativeSocialLinkPreview,
  type NativeSocialMentionEntry,
  type NativeSocialSortMode,
  type NativeSocialThread,
} from "../../lib/nativeSocial";

const NATIVE_SOCIAL_TAGS = ["Social", "Pets", "Health", "Adoption", "News", "Events", "Market"] as const;
const NATIVE_SOCIAL_SORTS: NativeSocialSortMode[] = ["Latest", "Trending", "Saves"];
const NATIVE_SENSITIVE_TAP_SEEN_KEY = "huddle_sensitive_tap_seen";

const NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_KEY = "native-social-media-aspect-cache:v1";
const NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_LIMIT = 300;

let nativeSocialMediaAspectMemoryCache: Record<string, number> | null = null;

const readNativeSocialMediaAspectCache = async () => {
  if (nativeSocialMediaAspectMemoryCache) return nativeSocialMediaAspectMemoryCache;
  try {
    const raw = await AsyncStorage.getItem(NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    nativeSocialMediaAspectMemoryCache = parsed && typeof parsed === "object" ? parsed as Record<string, number> : {};
  } catch {
    nativeSocialMediaAspectMemoryCache = {};
  }
  return nativeSocialMediaAspectMemoryCache;
};

const writeNativeSocialMediaAspectCache = async (next: Record<string, number>) => {
  nativeSocialMediaAspectMemoryCache = Object.fromEntries(Object.entries(next).slice(-NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_LIMIT));
  try {
    await AsyncStorage.setItem(NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_KEY, JSON.stringify(nativeSocialMediaAspectMemoryCache));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};


type NativeSocialFilterBarProps = {
  query: string;
  selectedTags: string[];
  sortMode: NativeSocialSortMode;
  onQueryChange: (value: string) => void;
  onSortChange: (value: NativeSocialSortMode) => void;
  onToggleTag: (value: string) => void;
  onClearTags: () => void;
};

type NativeSocialFeedCardProps = {
  thread: NativeSocialThread;
  expanded: boolean;
  linkPreview: NativeSocialLinkPreview | null;
  pinned: boolean;
  saved: boolean;
  supported: boolean;
  onToggleExpanded: () => void;
  onTogglePinned: () => void;
  onToggleSaved: () => void;
  onOpenWebThread: () => void;
  onOpenMap: () => void;
  onOpenExternalLink: (url: string) => void;
  onOpenProfile: (userId?: string) => void;
  onOpenComments: () => void;
  onOpenMore: (event: GestureResponderEvent) => void;
  onOpenShare: () => void;
  onOpenSupport: () => void;
};

const MIN_MEDIA_ASPECT = 9 / 16;
const MAX_MEDIA_ASPECT = 1.91;
const INLINE_URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;
const INLINE_MARKUP_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

const clampNativeSocialMediaAspect = (aspect: number) => Math.min(Math.max(aspect || 1, MIN_MEDIA_ASPECT), MAX_MEDIA_ASPECT);

const derivePrimaryTag = (thread: NativeSocialThread) => {
  const hasNewsTag = thread.tags.some((tag) => String(tag).toLowerCase() === "news");
  const isAlertDerived = Boolean(thread.alertType);
  const displayTags = hasNewsTag ? thread.tags.slice(0, 1) : isAlertDerived ? ["News"] : thread.tags.slice(0, 1);
  return displayTags[0] || null;
};

const deriveTagTone = (thread: NativeSocialThread, tag: string | null) => {
  if (!tag) return "default";
  if (String(tag).toLowerCase() !== "news") return "brand";
  const type = String(thread.alertType || "").toLowerCase();
  if (type === "lost") return "lost";
  if (type === "caution") return "caution";
  if (type === "stray") return "stray";
  return "other";
};

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "External link";
  }
};

const normalizeNativeInlineHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

function renderNativeSocialInlineMarkup(value: string, keyPrefix: string) {
  if (!value) return null;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const matcher = new RegExp(INLINE_MARKUP_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const raw = match[0] || "";
    const bold = raw.startsWith("**") && raw.endsWith("**");
    const italic = !bold && raw.startsWith("*") && raw.endsWith("*");
    const label = raw.slice(bold ? 2 : 1, raw.length - (bold ? 2 : 1));
    nodes.push(
      <Text
        key={`${keyPrefix}-markup-${match.index}`}
        style={bold ? styles.bodyTextBold : italic ? styles.bodyTextItalic : undefined}
      >
        {label}
      </Text>,
    );
    cursor = match.index + raw.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function renderNativeSocialFormattedText({
  keyPrefix,
  onOpenExternalLink,
  value,
}: {
  keyPrefix: string;
  onOpenExternalLink: (url: string) => void;
  value: string;
}) {
  const lines = value.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) nodes.push("\n");
    if (!line) return;
    let cursor = 0;
    const matcher = new RegExp(INLINE_URL_PATTERN);
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(line)) !== null) {
      const rawUrl = match[0] || "";
      const safeUrl = normalizeNativeInlineHttpUrl(rawUrl);
      if (!safeUrl) continue;
      if (match.index > cursor) {
        nodes.push(...(renderNativeSocialInlineMarkup(line.slice(cursor, match.index), `${keyPrefix}-line-${lineIndex}-text-${cursor}`) || []));
      }
      nodes.push(
        <Text
          key={`${keyPrefix}-line-${lineIndex}-url-${match.index}`}
          accessibilityRole="link"
          onPress={() => onOpenExternalLink(safeUrl)}
          style={styles.inlineLinkText}
        >
          {formatNativeSocialUrlLabel(safeUrl)}
        </Text>,
      );
      cursor = match.index + rawUrl.length;
    }
    if (cursor < line.length) {
      nodes.push(...(renderNativeSocialInlineMarkup(line.slice(cursor), `${keyPrefix}-line-${lineIndex}-tail`) || []));
    }
  });
  return nodes;
}

const formatNativeSocialTimeAgo = (date: string) => {
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return "Just now";
  const diff = Date.now() - then;
  if (diff < 60 * 1000) return "Just now";
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
};

const deriveNativeSocialDistrictLabel = (value: string | null | undefined) => {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "Map";
};

function NativeSocialBodyText({
  mentions,
  numberOfLines,
  onOpenExternalLink,
  onOpenProfile,
  onTextLayout,
  value,
}: {
  mentions: NativeSocialMentionEntry[];
  numberOfLines?: number;
  onOpenExternalLink: (url: string) => void;
  onOpenProfile: (userId: string) => void;
  onTextLayout?: (event: NativeSyntheticEvent<TextLayoutEventData>) => void;
  value: string;
}) {
  const mentionEntries = mentions
    .filter((entry) => entry.start >= 0 && entry.end > entry.start && entry.end <= value.length)
    .sort((left, right) => left.start - right.start);

  if (mentionEntries.length === 0) {
    return (
      <Text numberOfLines={numberOfLines} onTextLayout={onTextLayout} style={styles.bodyText}>
        {renderNativeSocialFormattedText({ keyPrefix: "thread-body", onOpenExternalLink, value })}
      </Text>
    );
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  mentionEntries.forEach((entry, index) => {
    if (entry.start > cursor) {
      nodes.push(...renderNativeSocialFormattedText({
        keyPrefix: `thread-body-text-${index}`,
        onOpenExternalLink,
        value: value.slice(cursor, entry.start),
      }));
    }
    const label = value.slice(entry.start, entry.end);
    nodes.push(
      <Text
        key={`${entry.mentionedUserId}-${index}`}
        accessibilityRole="button"
        onPress={() => onOpenProfile(entry.mentionedUserId)}
        style={styles.mentionText}
      >
        {label}
      </Text>,
    );
    cursor = entry.end;
  });
  if (cursor < value.length) {
    nodes.push(...renderNativeSocialFormattedText({
      keyPrefix: "thread-body-tail",
      onOpenExternalLink,
      value: value.slice(cursor),
    }));
  }

  return <Text numberOfLines={numberOfLines} onTextLayout={onTextLayout} style={styles.bodyText}>{nodes}</Text>;
}

export function NativeSocialFilterBar({
  query,
  selectedTags,
  sortMode,
  onQueryChange,
  onSortChange,
  onToggleTag,
  onClearTags,
}: NativeSocialFilterBarProps) {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  return (
    <View style={styles.filterBlock}>
      <View style={styles.topicTabFrame}>
        <ScrollView
          horizontal
          alwaysBounceHorizontal={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          style={styles.topicTabScroller}
          contentContainerStyle={styles.tabRow}
        >
          <Pressable accessibilityRole="button" onPress={onClearTags} style={({ pressed }) => [styles.tabButton, pressed ? styles.pressed : null]}>
            <Text style={[styles.tabText, selectedTags.length === 0 ? styles.tabTextActive : null]}>All</Text>
            <View style={[styles.tabUnderline, selectedTags.length === 0 ? styles.tabUnderlineActive : null]} />
          </Pressable>
          {NATIVE_SOCIAL_TAGS.map((tag) => (
            <Pressable key={tag} accessibilityRole="button" onPress={() => onToggleTag(tag)} style={({ pressed }) => [styles.tabButton, pressed ? styles.pressed : null]}>
              <Text style={[styles.tabText, selectedTags.includes(tag) ? styles.tabTextActive : null]}>{tag}</Text>
              <View style={[styles.tabUnderline, selectedTags.includes(tag) ? styles.tabUnderlineActive : null]} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.searchSortRow}>
        <View style={styles.searchFieldWrap}>
          <View style={styles.searchField}>
            <Feather color={huddleColors.iconSubtle} name="search" size={huddleSocial.actionIconSize} />
            <TextInput
              accessibilityLabel="Search social posts"
              autoCorrect={false}
              onChangeText={onQueryChange}
              placeholder=""
              placeholderTextColor={huddleColors.mutedText}
              style={styles.searchInput}
              value={query}
            />
          </View>
        </View>
        <View style={styles.sortControl}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change social sort" onPress={() => setSortMenuOpen((open) => !open)} style={({ pressed }) => [styles.sortField, sortMenuOpen ? styles.sortFieldFocused : null, pressed ? styles.pressed : null]}>
            <Text style={styles.sortFieldText}>{sortMode}</Text>
            <Feather color={huddleColors.iconSubtle} name={sortMenuOpen ? "chevron-up" : "chevron-down"} size={huddleSocial.actionIconSize} />
          </Pressable>
          <Modal animationType="fade" transparent visible={sortMenuOpen} onRequestClose={() => setSortMenuOpen(false)}>
            <Pressable style={styles.dropdownBackdrop} onPress={() => setSortMenuOpen(false)}>
              <Pressable style={styles.sortMenu}>
                <View style={styles.dropdownContent}>
                  {NATIVE_SOCIAL_SORTS.map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: option === sortMode }}
                      key={option}
                      onPress={() => {
                        onSortChange(option);
                        setSortMenuOpen(false);
                      }}
                      style={({ pressed }) => [styles.sortOption, option === sortMode ? styles.sortOptionActive : null, pressed ? styles.pressed : null]}
                    >
                      <Text style={[styles.sortOptionText, option === sortMode ? styles.sortOptionTextActive : null]}>{option}</Text>
                      {option === sortMode ? <Feather color={huddleColors.blue} name="check" size={huddleFormControls.select.checkSlot} /> : <View style={styles.sortCheckSlot} />}
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      </View>
    </View>
  );
}

const NativeSocialAvatar = memo(function NativeSocialAvatar({
  thread,
  onOpenProfile,
}: {
  thread: NativeSocialThread;
  onOpenProfile: (userId?: string) => void;
}) {
  const initial = (thread.author.displayName || "Unknown").charAt(0).toUpperCase();
  const authorSocialId = String(thread.author.socialId || "").replace(/^@/, "").trim().toLowerCase();
  const authorName = String(thread.author.displayName || "").trim().toLowerCase();
  const authorVerified =
    thread.author.isVerified === true ||
    String(thread.author.verificationStatus || "").toLowerCase() === "verified" ||
    (authorSocialId === "manager" && (authorName === "huddle" || authorName === "team huddle"));
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpenProfile(thread.userId)} style={({ pressed }) => [styles.avatarButton, authorVerified ? styles.avatarVerified : null, pressed ? styles.pressed : null]}>
      {thread.author.avatarUrl ? (
        <ExpoImage {...huddleImageDefaults} accessibilityIgnoresInvertColors source={{ uri: thread.author.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>{initial}</Text>
      )}
      {authorVerified ? (
        <View style={styles.avatarVerifiedBadge}>
          <NativeVerifiedBadge compact variant="avatar" />
        </View>
      ) : null}
    </Pressable>
  );
});

export type NativeSocialCarouselItem = {
  kind?: "image" | "video";
  uri: string;
  videoUri?: string | null;
};

function NativeSocialExpandedVideo({
  active,
  muted,
  posterUri,
  uri,
}: {
  active: boolean;
  muted: boolean;
  posterUri: string;
  uri: string | null | undefined;
}) {
  const player = useVideoPlayer(uri || posterUri, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = muted;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (active && uri) {
      player.play();
      return;
    }
    player.pause();
  }, [active, player, uri]);

  if (!uri) {
    return (
      <View style={styles.expandedImageWrap}>
        <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="contain" source={{ uri: posterUri }} style={styles.expandedImage} transition={120} />
        <View style={styles.expandedVideoUnavailable}>
          <Feather color={huddleColors.onPrimary} name="play" size={huddleType.h2} />
          <Text style={styles.expandedVideoUnavailableText}>Video preview</Text>
        </View>
      </View>
    );
  }

  return (
    <VideoView
      allowsFullscreen
      contentFit="contain"
      nativeControls
      player={player}
      style={styles.expandedVideo}
    />
  );
}

export function NativeSocialExpandedMediaViewer({
  activeIndex,
  isSensitive = false,
  aspectByUri = {},
  items,
  onClose,
  onIndexChange,
  onToggleSensitive,
  open,
  revealed = false,
}: {
  activeIndex: number;
  aspectByUri?: Record<string, number>;
  isSensitive?: boolean;
  items: NativeSocialCarouselItem[];
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onToggleSensitive?: () => void;
  open: boolean;
  revealed?: boolean;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const { height, width } = useWindowDimensions();
  const [muted, setMuted] = useState(true);
  const swipeDownStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeDownDeltaRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ animated: false, x: Math.max(0, activeIndex) * width });
    });
  }, [activeIndex, open, width]);

  if (!open) return null;

  const handleSwipeDownStart = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent;
    swipeDownStartRef.current = { x: touch.pageX, y: touch.pageY };
    swipeDownDeltaRef.current = { x: 0, y: 0 };
  };

  const handleSwipeDownMove = (event: GestureResponderEvent) => {
    const start = swipeDownStartRef.current;
    if (!start) return;
    const touch = event.nativeEvent;
    swipeDownDeltaRef.current = {
      x: touch.pageX - start.x,
      y: touch.pageY - start.y,
    };
  };

  const handleSwipeDownEnd = () => {
    const delta = swipeDownDeltaRef.current;
    swipeDownStartRef.current = null;
    swipeDownDeltaRef.current = { x: 0, y: 0 };
    if (delta.y > 92 && Math.abs(delta.x) < 72) onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={open}>
      <View
        onTouchEnd={handleSwipeDownEnd}
        onTouchMove={handleSwipeDownMove}
        onTouchStart={handleSwipeDownStart}
        style={styles.expandedBackdrop}
      >
        <View style={styles.expandedHeader}>
          <View style={styles.expandedHeaderSpacer} />
          <View style={styles.expandedHeaderActions}>
            {isSensitive ? (
              <Pressable accessibilityLabel={revealed ? "Blur sensitive media" : "Reveal sensitive media"} accessibilityRole="button" onPress={onToggleSensitive} style={styles.expandedIconButton}>
                <Feather color={huddleColors.onPrimary} name={revealed ? "eye-off" : "eye"} size={22} />
              </Pressable>
            ) : null}
            {items.some((item) => item.kind === "video") ? (
              <Pressable accessibilityLabel={muted ? "Turn sound on" : "Mute video"} accessibilityRole="button" onPress={() => setMuted((current) => !current)} style={styles.expandedIconButton}>
                <Feather color={huddleColors.onPrimary} name={muted ? "volume-x" : "volume-2"} size={22} />
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="Close media viewer" accessibilityRole="button" onPress={onClose} style={styles.expandedIconButton}>
              <Feather color={huddleColors.onPrimary} name="x" size={24} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
            onIndexChange(Math.max(0, Math.min(items.length - 1, nextIndex)));
          }}
        >
          {items.map((item, index) => {
            const itemAspect = aspectByUri[item.uri] || huddleSocial.mediaFrameAspectRatio;
            const maxMediaHeight = Math.max(1, height - huddleSpacing.x10 * 2);
            const fittedWidth = Math.min(width, maxMediaHeight * itemAspect);
            const fittedHeight = Math.min(maxMediaHeight, width / itemAspect);
            const hiddenSensitive = isSensitive && !revealed;
            const mediaFrame = (
              <View style={[styles.expandedMediaFrame, { height: fittedHeight, width: fittedWidth }]}>
                {item.kind === "video" && !hiddenSensitive ? (
                  <NativeSocialExpandedVideo active={index === activeIndex} muted={muted} posterUri={item.uri} uri={item.videoUri} />
                ) : (
                  <ExpoImage
                    accessibilityIgnoresInvertColors
                    blurRadius={hiddenSensitive ? huddleSocial.sensitiveBlurRadius : 0}
                    cachePolicy="memory-disk"
                    contentFit="contain"
                    source={{ uri: item.uri }}
                    style={styles.expandedImage}
                    transition={120}
                  />
                )}
                {hiddenSensitive ? (
                  <View pointerEvents="none" style={styles.expandedSensitiveOverlay}>
                    <View pointerEvents="none" style={styles.sensitiveGlassVeil} />
                    <View pointerEvents="none" style={styles.sensitiveDimVeil} />
                    <Feather color={huddleColors.onPrimary} name="eye" size={huddleType.h3} />
                    <Text style={styles.sensitiveText}>Tap to view</Text>
                  </View>
                ) : null}
              </View>
            );

            return (
              <View key={`${item.kind}-${item.uri || index}-expanded`} style={[styles.expandedSlide, { width }]}>
                {hiddenSensitive ? (
                  <Pressable accessibilityRole="button" onPress={onToggleSensitive} style={styles.expandedSensitiveTapArea}>
                    {mediaFrame}
                  </Pressable>
                ) : mediaFrame}
              </View>
            );
          })}
        </ScrollView>

        {items.length > 1 ? (
          <View style={styles.expandedDots}>
            {items.map((item, index) => (
              <View key={`${item.kind}-${item.uri || index}-expanded-dot`} style={[styles.expandedDot, index === activeIndex ? styles.expandedDotActive : null]} />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function NativeSocialMediaCarousel({
  items,
  isSensitive = false,
  fixedFrameHeight,
  heightAnimationMs = 180,
  minFrameWidth,
  thumbnailFit = "contain",
  onDoubleTap,
  onFrameHeightChange,
  onLongPress,
  onPress,
  contentWidth,
  maxFrameHeight,
  popIconVariant = "paw",
  videoStatus,
}: {
  items: NativeSocialCarouselItem[];
  isSensitive?: boolean;
  fixedFrameHeight?: number;
  heightAnimationMs?: number;
  minFrameWidth?: number;
  thumbnailFit?: "contain" | "cover";
  onDoubleTap?: () => void;
  onFrameHeightChange?: (height: number) => void;
  onLongPress?: () => void;
  onPress?: () => void;
  contentWidth?: number;
  maxFrameHeight?: number;
  popIconVariant?: "paw" | "heart";
  videoStatus?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [sensitiveTapStage, setSensitiveTapStage] = useState<"toggle" | "fullscreen">("toggle");
  const [tapHintDismissed, setTapHintDismissed] = useState(false);
  // SO9: big-heart pop visual on double-tap-to-like
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [aspectByUri, setAspectByUri] = useState<Record<string, number>>({});
  const scrollRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();
  const resolvedContentWidth = contentWidth ?? Math.max(0, width - huddleSpacing.x8 - huddleSocial.avatarSize - huddleSpacing.x4);
  const media = items;
  const activeUri = media[activeIndex]?.uri || media[0]?.uri || "";
  const activeSlideAspect = clampNativeSocialMediaAspect(aspectByUri[activeUri] || huddleSocial.mediaFrameAspectRatio);
  const dynamicSingleImageWidth = fixedFrameHeight && media.length === 1
    ? Math.max(minFrameWidth ?? 1, Math.min(resolvedContentWidth, fixedFrameHeight * activeSlideAspect))
    : resolvedContentWidth;
  const slideWidth = Math.max(dynamicSingleImageWidth, 1);
  const viewportWidth = Math.max(slideWidth, 1);
  const maxFeedHeight = maxFrameHeight ?? (viewportWidth / 0.8);
  const heightForAspect = (aspect: number) => Math.min(maxFeedHeight, viewportWidth / aspect);
  const activeFrameHeight = fixedFrameHeight ?? heightForAspect(activeSlideAspect);
  const animatedHeightRef = useRef(new Animated.Value(activeFrameHeight));

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(NATIVE_SENSITIVE_TAP_SEEN_KEY).then((value) => {
      if (active) setTapHintDismissed(value === "1");
    });
    void readNativeSocialMediaAspectCache().then((cache) => {
      if (!active) return;
      setAspectByUri((current) => ({ ...cache, ...current }));
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleSensitiveReveal = () => {
    haptic.selectTab(); // SO9: subtle haptic on sensitive overlay reveal
    setRevealed((current) => !current);
    if (!tapHintDismissed) {
      setTapHintDismissed(true);
      void AsyncStorage.setItem(NATIVE_SENSITIVE_TAP_SEEN_KEY, "1");
    }
  };

  // SO9: double-tap-to-like detection on media frames (once revealed, or for non-sensitive media)
  const lastTapAtRef = useRef<number>(0);
  const pendingSingleTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_TAP_GAP_MS = 280;

  useEffect(() => {
    onFrameHeightChange?.(activeFrameHeight);
  }, [activeFrameHeight, onFrameHeightChange]);

  useEffect(() => {
    media.forEach((item) => {
      if (!item.uri || aspectByUri[item.uri]) return;
      RNImage.getSize(
        item.uri,
        (imageWidth, imageHeight) => {
          if (!imageWidth || !imageHeight) return;
          setAspectByUri((current) => {
            if (current[item.uri]) return current;
            const next = { ...current, [item.uri]: clampNativeSocialMediaAspect(imageWidth / imageHeight) };
            void writeNativeSocialMediaAspectCache(next);
            return next;
          });
        },
        () => undefined,
      );
    });
  }, [aspectByUri, media]);

  // SO9: clean up pending double-tap timer on unmount
  useEffect(() => {
    return () => {
      if (pendingSingleTapRef.current) clearTimeout(pendingSingleTapRef.current);
    };
  }, []);

  if (media.length === 0) return null;

  Animated.timing(animatedHeightRef.current, {
    duration: heightAnimationMs,
    toValue: activeFrameHeight,
    useNativeDriver: false,
  }).start();

  const scrollToIndex = (index: number) => {
    const next = Math.max(0, Math.min(media.length - 1, index));
    setActiveIndex(next);
    scrollRef.current?.scrollTo({
      animated: true,
      x: next * slideWidth,
    });
  };

  const handleMediaPress = (index: number) => {
    const nextIndex = Math.max(0, Math.min(media.length - 1, index));

    // SO9: while sensitive overlay is up, ignore double-tap and only handle reveal
    if (isSensitive && !revealed) {
      if (sensitiveTapStage === "toggle") {
        toggleSensitiveReveal();
        setSensitiveTapStage("fullscreen");
        return;
      }
      // already advanced; let it fall through to fullscreen path below
      setSensitiveTapStage("toggle");
    }

    // SO9: double-tap detection — second tap within DOUBLE_TAP_GAP_MS fires like
    const now = Date.now();
    const gap = now - lastTapAtRef.current;
    if (gap < DOUBLE_TAP_GAP_MS && onDoubleTap) {
      lastTapAtRef.current = 0;
      if (pendingSingleTapRef.current) {
        clearTimeout(pendingSingleTapRef.current);
        pendingSingleTapRef.current = null;
      }
      haptic.selectTab();
      // SO9: big-heart pop animation — scale 0→1.15→1, fade 0→1→0 over ~600ms
      heartScale.setValue(0);
      heartOpacity.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(heartScale, { toValue: 1.15, useNativeDriver: true, damping: 9, stiffness: 220, mass: 0.6 }),
          Animated.timing(heartScale, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(heartOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.delay(280),
          Animated.timing(heartOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]),
      ]).start();
      onDoubleTap();
      return;
    }
    lastTapAtRef.current = now;

    // Schedule single-tap (fullscreen) — cancelled by a second tap arriving in time
    if (pendingSingleTapRef.current) clearTimeout(pendingSingleTapRef.current);
    pendingSingleTapRef.current = setTimeout(() => {
      pendingSingleTapRef.current = null;
      setExpandedIndex(nextIndex);
      setExpandedOpen(true);
    }, onDoubleTap ? DOUBLE_TAP_GAP_MS : 0);
  };

  return (
    <View style={styles.mediaBlock}>
      <Animated.View style={[styles.mediaViewport, { width: slideWidth, height: animatedHeightRef.current }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaPagingRow}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(slideWidth, 1));
            setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)));
          }}
        >
	          {media.map((item, index) => {
	            const itemAspect = clampNativeSocialMediaAspect(aspectByUri[item.uri] || huddleSocial.mediaFrameAspectRatio);
		            const itemFrameHeight = fixedFrameHeight ?? heightForAspect(itemAspect);
		            const fittedWidth = Math.min(slideWidth, itemFrameHeight * itemAspect);
		            const fittedHeight = Math.min(itemFrameHeight, slideWidth / itemAspect);
                const mediaWidth = thumbnailFit === "cover" ? slideWidth : fittedWidth;
                const mediaHeight = thumbnailFit === "cover" ? itemFrameHeight : fittedHeight;
	            return (
              <Pressable
		                key={`${item.kind}-${item.uri || index}`}
		                accessibilityRole="button"
                    delayLongPress={260}
                    onLongPress={onLongPress}
		                onPress={() => handleMediaPress(index)}
	                style={({ pressed }) => [styles.mediaFrame, { height: itemFrameHeight, width: slideWidth }, pressed ? styles.pressed : null]}
              >
                {item.uri ? (
                  <View style={styles.mediaImageContainBox}>
	                    <ExpoImage
	                      accessibilityIgnoresInvertColors
	                      blurRadius={isSensitive && !revealed ? huddleSocial.sensitiveBlurRadius : 0}
	                      cachePolicy="memory-disk"
	                      contentFit={thumbnailFit}
	                      source={{ uri: item.uri }}
	                      style={[styles.mediaImage, { height: mediaHeight, width: mediaWidth }]}
	                      transition={120}
		                    />
                  </View>
                ) : (
                  <View style={styles.mediaFallback} />
                )}
	                {isSensitive && !revealed ? (
                  <View
                    style={[
                      styles.sensitiveOverlay,
                      {
                        height: fittedHeight,
                        left: (slideWidth - fittedWidth) / 2,
                        top: (itemFrameHeight - fittedHeight) / 2,
                        width: fittedWidth,
                      },
                    ]}
                  >
                    <View pointerEvents="none" style={styles.sensitiveGlassVeil} />
                    <View pointerEvents="none" style={styles.sensitiveDimVeil} />
                    {!tapHintDismissed ? (
                      <>
                        <Feather color={huddleColors.onPrimary} name="eye" size={huddleType.h3} />
                        <Text style={styles.sensitiveText}>Tap to view</Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
	                {item.kind === "video" ? (
	                  <View style={styles.videoBadge}>
	                    <Feather color={huddleColors.onPrimary} name="play" size={huddleType.h4} />
	                  </View>
	                ) : null}
	                {item.kind === "video" && videoStatus && videoStatus !== "ready" ? (
	                  <View style={styles.processingPill}>
	                    <Text style={styles.processingText}>Processing</Text>
	                  </View>
	                ) : null}
	              </Pressable>
            );
          })}
        </ScrollView>
        {/* SO9: big-heart pop overlay — absolute-positioned, pointerEvents="none" so it never blocks taps */}
        <Animated.View pointerEvents="none" style={[styles.heartPopOverlay, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}>
          {popIconVariant === "heart" ? (
            <FontAwesome color="#FF3B5C" name="heart" size={108} style={styles.heartPopIcon} />
          ) : (
            <MaterialCommunityIcons color="#FFFFFF" name="paw" size={108} style={styles.heartPopIcon} />
          )}
        </Animated.View>
      </Animated.View>
      <NativeSocialExpandedMediaViewer
        activeIndex={expandedIndex}
        aspectByUri={aspectByUri}
        isSensitive={isSensitive}
        items={media}
        onClose={() => setExpandedOpen(false)}
        onIndexChange={setExpandedIndex}
        onToggleSensitive={toggleSensitiveReveal}
        open={expandedOpen}
        revealed={revealed}
      />

      {media.length > 1 ? (
        <View style={styles.carouselControls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous image" disabled={activeIndex <= 0} onPress={() => scrollToIndex(activeIndex - 1)} style={({ pressed }) => [styles.carouselButton, activeIndex <= 0 ? styles.carouselButtonDisabled : null, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.iconSubtle} name="chevron-left" size={huddleSocial.actionIconSize} />
          </Pressable>
          {media.map((item, index) => (
            <View key={`${item.kind}-${item.uri || index}-dot`} style={[styles.carouselDot, index === activeIndex ? styles.carouselDotActive : null]} />
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Next image" disabled={activeIndex >= media.length - 1} onPress={() => scrollToIndex(activeIndex + 1)} style={({ pressed }) => [styles.carouselButton, activeIndex >= media.length - 1 ? styles.carouselButtonDisabled : null, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.iconSubtle} name="chevron-right" size={huddleSocial.actionIconSize} />
          </Pressable>
        </View>
      ) : null}
      {isSensitive ? <Text style={styles.sensitiveRevealHint}>{sensitiveTapStage === "fullscreen" ? "Tap again for full screen" : revealed ? "Tap to blur" : "Tap to view"}</Text> : null}
    </View>
  );
}

function NativeSocialMediaStrip({
  thread,
  onOpenWebThread,
  onDoubleTap,
}: {
  thread: NativeSocialThread;
  onOpenWebThread: () => void;
  onDoubleTap?: () => void;
}) {
  const media = useMemo(() => {
    const imageItems = thread.images.map((uri) => ({ uri, kind: "image" as const }));
    if (thread.videoProvider === "bunny_stream" && thread.providerVideoId) {
      const poster = thread.videoThumbnailUrl || thread.videoPreviewUrl || "";
      return [...imageItems, { uri: poster, videoUri: thread.videoPlaybackUrl, kind: "video" as const }];
    }
    return imageItems;
  }, [thread.images, thread.providerVideoId, thread.videoPlaybackUrl, thread.videoProvider, thread.videoPreviewUrl, thread.videoThumbnailUrl]);

  return <NativeSocialMediaCarousel isSensitive={thread.isSensitive} items={media} onDoubleTap={onDoubleTap} onPress={onOpenWebThread} videoStatus={thread.videoStatus} />;
}

export function NativeSocialExternalLinkPreview({
  linkPreview,
  onOpen,
  url,
}: {
  linkPreview: NativeSocialLinkPreview | null;
  onOpen: (url: string) => void;
  url: string;
}) {
  return (
    <Pressable accessibilityRole="link" onPress={() => onOpen(url)} style={({ pressed }) => [styles.linkPreview, pressed ? styles.pressed : null]}>
      {linkPreview?.image ? (
        <ExpoImage {...huddleImageDefaults} accessibilityIgnoresInvertColors source={{ uri: linkPreview.image }} style={styles.linkPreviewImage} />
      ) : linkPreview?.loading ? (
        <View style={styles.linkPreviewLoading} />
      ) : null}
      <View style={styles.linkPreviewBody}>
        <Text style={styles.linkMeta}>{linkPreview?.siteName || hostLabel(url)}</Text>
        <Text numberOfLines={2} style={styles.linkTitle}>{linkPreview?.title || formatNativeSocialUrlLabel(url)}</Text>
        {linkPreview?.failed ? <Text style={styles.linkFailedText}>Preview unavailable</Text> : null}
      </View>
    </Pressable>
  );
}

function NativeSocialActionBar({
  thread,
  supported,
  onOpenComments,
  onOpenMore,
  onOpenWebThread,
  onOpenShare,
  onOpenSupport,
}: {
  thread: NativeSocialThread;
  supported: boolean;
  onOpenComments: () => void;
  onOpenMore: (event: GestureResponderEvent) => void;
  onOpenWebThread: () => void;
  onOpenShare: () => void;
  onOpenSupport: () => void;
}) {
  const primaryTag = derivePrimaryTag(thread);
  const tagTone = deriveTagTone(thread, primaryTag);
  const tagPillToneStyle =
    tagTone === "lost" ? styles.tagPill_lost :
    tagTone === "caution" ? styles.tagPill_caution :
    tagTone === "stray" ? styles.tagPill_stray :
    tagTone === "other" ? styles.tagPill_other :
    tagTone === "brand" ? styles.tagPill_brand :
    styles.tagPill_default;
  const tagTextToneStyle =
    tagTone === "stray" ? styles.tagText_stray :
    tagTone === "default" ? styles.tagText_default :
    styles.tagText_onFill;
  return (
    <View style={styles.actionRow}>
      <View style={styles.actionMeta}>
        <Text style={styles.timeText}>{formatNativeSocialTimeAgo(thread.createdAt)}</Text>
        {primaryTag ? (
          <View style={[styles.tagPill, tagPillToneStyle]}>
            <Text style={[styles.tagText, tagTextToneStyle]}>{primaryTag}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actionCluster}>
        <Pressable accessibilityRole="button" accessibilityLabel={supported ? "Remove support" : "Support post"} accessibilityState={{ selected: supported }} onPress={onOpenSupport} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, supported ? styles.iconButtonActive : null, pressed ? styles.pressed : null]}>
          <MaterialCommunityIcons color={supported ? huddleColors.blue : huddleColors.iconMuted} name="paw" size={huddleSocial.actionIconSize} />
          {thread.likes > 0 ? (
            <View style={styles.actionBadge}>
              <Text style={styles.actionCount}>{thread.likes}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open replies" onPress={onOpenComments} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Feather color={huddleColors.iconMuted} name="message-circle" size={huddleSocial.actionIconSize} />
          {thread.commentCount > 0 ? (
            <View style={styles.actionBadge}>
              <Text style={styles.actionCount}>{thread.commentCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share post" onPress={onOpenShare} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Feather color={huddleColors.iconMuted} name="send" size={huddleSocial.actionIconSize} />
          {thread.shareCount > 0 ? (
            <View style={styles.actionBadge}>
              <Text style={styles.actionCount}>{thread.shareCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={onOpenMore} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Feather color={huddleColors.iconMuted} name="more-horizontal" size={huddleSocial.actionIconSize} />
        </Pressable>
      </View>
    </View>
  );
}

function NativeSocialAuthorHandle({ thread }: { thread: NativeSocialThread }) {
  return (
    <View style={styles.authorNameRow}>
      <Text numberOfLines={1} style={styles.authorName}>{thread.author.displayName || "Anonymous"}</Text>
      {thread.author.socialId ? <Text numberOfLines={1} style={styles.authorSocialId}>@{thread.author.socialId}</Text> : null}
    </View>
  );
}

export const NativeSocialFeedCard = memo(function NativeSocialFeedCard({
  thread,
  expanded,
  linkPreview,
  pinned,
  saved,
  supported,
  onToggleExpanded,
  onTogglePinned,
  onToggleSaved,
  onOpenWebThread,
  onOpenMap,
  onOpenExternalLink,
  onOpenProfile,
  onOpenComments,
  onOpenMore,
  onOpenShare,
  onOpenSupport,
}: NativeSocialFeedCardProps) {
  const [contentLineCount, setContentLineCount] = useState(0);
  const firstUrl = extractNativeSocialFirstHttpUrl(thread.content);
  const visibleContent = linkPreview?.failed
    ? thread.content
    : stripNativeSocialExternalUrlFromText(thread.content, firstUrl);
  const shouldCollapse = contentLineCount > huddleSocial.contentCollapsedLines;
  const mapLabel = deriveNativeSocialDistrictLabel(thread.alertDistrict);

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <NativeSocialAvatar thread={thread} onOpenProfile={onOpenProfile} />
        <View style={styles.cardContent}>
          <View style={styles.cardTopActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Unsave post" : "Save post"} onPress={onToggleSaved} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.topIconButton, pressed ? styles.pressed : null]}>
              <FontAwesome color={saved ? huddleColors.blue : huddleColors.iconSubtle} name={saved ? "bookmark" : "bookmark-o"} size={huddleSocial.actionIconSize} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={pinned ? "Unpin post" : "Pin post"} onPress={onTogglePinned} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.topIconButton, pressed ? styles.pressed : null]}>
              <FontAwesome color={pinned ? huddleColors.blue : huddleColors.iconSubtle} name="thumb-tack" size={huddleSocial.actionIconSize} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onOpenProfile(thread.userId)} style={styles.authorTextBlock}>
            <NativeSocialAuthorHandle thread={thread} />
          </Pressable>
          <Text style={styles.titleText}>{thread.title}</Text>
          {thread.hasAlertLink || thread.mapId ? (
            <Pressable accessibilityRole="button" onPress={onOpenMap} style={({ pressed }) => [styles.mapLink, pressed ? styles.pressed : null]}>
              <Text style={styles.mapPin}>📍</Text>
              <Text style={styles.mapLinkText}>{mapLabel}</Text>
            </Pressable>
          ) : null}
          {visibleContent ? (
            <NativeSocialBodyText
              mentions={thread.mentions}
              numberOfLines={shouldCollapse && !expanded ? huddleSocial.contentCollapsedLines : undefined}
              onOpenExternalLink={onOpenExternalLink}
              onOpenProfile={onOpenProfile}
              onTextLayout={(event) => {
                const nextLineCount = event.nativeEvent.lines.length;
                setContentLineCount((current) => (current === nextLineCount ? current : nextLineCount));
              }}
              value={visibleContent}
            />
          ) : null}
          {shouldCollapse ? (
            <Pressable accessibilityRole="button" onPress={onToggleExpanded} style={({ pressed }) => [styles.readMoreButton, pressed ? styles.pressed : null]}>
              <Text style={styles.readMoreText}>{expanded ? "See Less" : "Read More"}</Text>
            </Pressable>
          ) : null}
          {firstUrl ? (
            <Pressable accessibilityRole="link" onPress={() => onOpenExternalLink(firstUrl)} style={({ pressed }) => [styles.linkPreview, pressed ? styles.pressed : null]}>
              {linkPreview?.image ? (
                <ExpoImage {...huddleImageDefaults} accessibilityIgnoresInvertColors source={{ uri: linkPreview.image }} style={styles.linkPreviewImage} />
              ) : linkPreview?.loading ? (
                <View style={styles.linkPreviewLoading} />
              ) : null}
              <View style={styles.linkPreviewBody}>
                <Text style={styles.linkMeta}>{linkPreview?.siteName || hostLabel(firstUrl)}</Text>
                <Text numberOfLines={2} style={styles.linkTitle}>{linkPreview?.title || formatNativeSocialUrlLabel(firstUrl)}</Text>
                {linkPreview?.failed ? <Text style={styles.linkFailedText}>Preview unavailable</Text> : null}
              </View>
            </Pressable>
          ) : null}
          {thread.hashtags.length > 0 ? <Text style={styles.hashtagText}>{thread.hashtags.slice(0, 3).map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</Text> : null}
          <NativeSocialMediaStrip thread={thread} onDoubleTap={() => { if (!supported) onOpenSupport(); }} onOpenWebThread={onOpenWebThread} />
          {thread.localStatus ? <Text style={styles.localStatusText}>{thread.localStatus === "failed" ? "Could not post" : "Posting..."}</Text> : null}
          <NativeSocialActionBar supported={supported} thread={thread} onOpenComments={onOpenComments} onOpenMore={onOpenMore} onOpenShare={onOpenShare} onOpenSupport={onOpenSupport} onOpenWebThread={onOpenWebThread} />
        </View>
      </View>
    </View>
  );
});

export function NativeSocialEmptyState() {
  return (
    <View style={styles.emptyState}>
      <ExpoImage {...huddleImageDefaults} accessibilityIgnoresInvertColors contentFit="contain" source={emptyChatImage} style={styles.emptyIllustration} />
      <Text style={styles.emptyText}>Looks like the floor is yours. Post something fun, real, or random - every great discussion starts with one person.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionCluster: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSocial.actionClusterGap,
    marginLeft: "auto",
    minWidth: huddleSocial.actionClusterMinWidth,
  },
  actionBadge: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    minWidth: huddleSocial.actionBadgeMinWidth,
    paddingHorizontal: huddleSpacing.x1,
    position: "absolute",
    right: -huddleSpacing.x1,
    top: -huddleSpacing.x1,
  },
  actionCount: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    textAlign: "center",
  },
  actionMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    minWidth: 0,
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: huddleSpacing.x3,
  },
  authorName: {
    color: huddleColors.text,
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  authorNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    minWidth: 0,
  },
  authorSocialId: {
    color: huddleColors.mutedText,
    flexShrink: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  authorTextBlock: {
    alignSelf: "flex-start",
    minWidth: 0,
    paddingRight: huddleSocial.topActionsReservedWidth,
  },
  avatarButton: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderColor: huddleColors.fieldBorderStrong,
    borderRadius: huddleRadii.pill,
    borderWidth: huddleSocial.avatarBorderWidth,
    height: huddleSocial.avatarSize,
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
    width: huddleSocial.avatarSize,
  },
  avatarImage: {
    borderRadius: huddleRadii.pill,
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
  avatarInitial: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
  },
  avatarVerified: {
    borderColor: huddleColors.blue,
  },
  avatarVerifiedBadge: {
    bottom: -1,
    elevation: 30,
    position: "absolute",
    right: -1,
    zIndex: 30,
  },
  bodyText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.h4Line,
  },
  bodyTextBold: {
    fontFamily: "Urbanist-700",
  },
  bodyTextItalic: {
    fontFamily: "Urbanist-600Italic",
  },
  card: {
    borderBottomColor: huddleColors.sectionDividerStrong,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  cardRow: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  cardTopActions: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: huddleSpacing.x1,
    position: "absolute",
    right: 0,
    top: -huddleSpacing.x2,
    zIndex: 2,
  },
  emptyIllustration: {
    height: huddleSocial.emptyAssetHeight,
    maxWidth: "100%",
    width: huddleSocial.emptyAssetWidth,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x7,
  },
  emptyText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-400",
    fontSize: huddleSocial.emptyTextSize,
    lineHeight: huddleSocial.emptyTextLineHeight,
    marginTop: huddleSpacing.x4,
    textAlign: "center",
  },
  filterBlock: {
    gap: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x2,
    position: "relative",
    zIndex: 5,
  },
  hashtagText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x1,
  },
  iconButton: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: huddleSocial.actionButtonSize,
    minWidth: huddleSocial.actionButtonSize,
    justifyContent: "center",
    position: "relative",
  },
  iconButtonActive: {
    backgroundColor: huddleColors.primarySoftFill,
    borderRadius: huddleRadii.pill,
  },
  inlineLinkText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-600",
    textDecorationLine: "underline",
  },
  linkMeta: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  linkFailedText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x1,
  },
  linkPreview: {
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    marginTop: huddleSpacing.x2,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  linkPreviewBody: {
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  linkPreviewImage: {
    backgroundColor: huddleColors.mutedCanvas,
    height: huddleSocial.linkPreviewImageHeight,
    width: "100%",
  },
  linkPreviewLoading: {
    backgroundColor: huddleColors.mutedCanvas,
    height: huddleSocial.linkPreviewImageHeight,
    width: "100%",
  },
  linkTitle: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: huddleSocial.linkTitleSize,
    lineHeight: huddleType.labelLine,
    marginTop: huddleSpacing.x1,
  },
  localStatusText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x1,
  },
  mapLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x1,
    minHeight: huddleSpacing.x6,
  },
  mapLinkText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: huddleSocial.mapLinkFontSize,
    lineHeight: huddleType.labelLine,
    textDecorationLine: "underline",
  },
  mapPin: {
    fontSize: huddleSocial.mapLinkFontSize,
    lineHeight: huddleType.labelLine,
  },
  mediaFallback: {
    backgroundColor: huddleColors.mutedCanvas,
    flex: 1,
  },
  mediaBlock: {
    marginTop: huddleSpacing.x2,
  },
  mediaFrame: {
    borderRadius: huddleRadii.field,
    overflow: "hidden",
  },
  mediaViewport: {
    borderRadius: huddleRadii.field,
    overflow: "hidden",
  },
  mediaImage: {
    borderRadius: huddleRadii.field,
    overflow: "hidden",
  },
  mediaImageContainBox: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    overflow: "hidden",
    position: "absolute",
    borderRadius: huddleRadii.field,
    right: 0,
    top: 0,
  },
  mediaPagingRow: {
    alignItems: "center",
  },
  mentionText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-600",
    textDecorationLine: "none",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  processingPill: {
    backgroundColor: huddleColors.backdrop,
    borderRadius: huddleRadii.pill,
    left: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x1,
    position: "absolute",
    top: huddleSpacing.x3,
  },
  processingText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  readMoreButton: {
    alignSelf: "flex-start",
    minHeight: 28,
    justifyContent: "center",
    marginTop: huddleSpacing.x1,
  },
  readMoreText: {
    color: huddleColors.subtext,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  searchFieldWrap: {
    flex: 1,
    minWidth: 0,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    height: 44,
    paddingHorizontal: huddleSpacing.x3,
    ...huddleShadows.glassElevation1,
  },
  searchInput: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    height: 42,
    lineHeight: huddleType.labelLine,
    minWidth: 0,
    padding: 0,
  },
  searchSortRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  sensitiveOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.56)",
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    gap: huddleSpacing.x1,
    justifyContent: "center",
    overflow: "hidden",
    position: "absolute",
  },
  sensitiveGlassVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.30)",
  },
  sensitiveDimVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 12, 24, 0.05)",
  },
  sensitiveText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  heartPopOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  heartPopIcon: {
    textShadowColor: "rgba(0, 0, 0, 0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  sortField: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: huddleSpacing.x3,
    height: 44,
    justifyContent: "center",
    minWidth: 104,
    paddingHorizontal: huddleSpacing.x3,
    ...huddleShadows.glassElevation1,
  },
  sortFieldFocused: {
    ...huddleFieldStates.focused,
  },
  sortFieldText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  sortControl: {
    zIndex: 8,
  },
  dropdownBackdrop: {
    flex: 1,
  },
  dropdownContent: {
    padding: huddleFormControls.select.menuPadding,
  },
  sortMenu: {
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 1,
    maxHeight: huddleFormControls.select.menuMaxHeight,
    position: "absolute",
    right: huddleSpacing.x4,
    top: huddleLayout.headerHeight + huddleSocial.feedTopInset + huddleSpacing.x10,
    width: 208,
    zIndex: 10,
    ...huddleShadows.glassElevation1,
  },
  sortOption: {
    alignItems: "center",
    borderRadius: huddleFormControls.select.optionRadius,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "space-between",
    minHeight: huddleFormControls.select.optionMinHeight,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
  },
  sortOptionActive: {
    backgroundColor: huddleColors.primarySoftFill,
  },
  sortOptionText: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  sortOptionTextActive: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
  },
  sortCheckSlot: {
    height: huddleFormControls.select.checkSlot,
    width: huddleFormControls.select.checkSlot,
  },
  tagPill: {
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSocial.tagPaddingVertical,
  },
  tagPill_brand: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  tagPill_caution: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  tagPill_default: {
    backgroundColor: huddleColors.mutedCanvas,
    borderColor: huddleColors.fieldBorderSoft,
  },
  tagPill_lost: {
    backgroundColor: huddleColors.alertLost,
    borderColor: huddleColors.alertLost,
  },
  tagPill_other: {
    backgroundColor: huddleColors.alertOther,
    borderColor: huddleColors.alertOther,
  },
  tagPill_stray: {
    backgroundColor: huddleColors.alertStray,
    borderColor: huddleColors.alertStray,
  },
  tagText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleSocial.tagFontSize,
    lineHeight: huddleType.metaLine,
  },
  tagText_default: {
    color: huddleColors.subtext,
  },
  tagText_onFill: {
    color: huddleColors.onPrimary,
  },
  tagText_stray: {
    color: huddleColors.textOnAlertStray,
  },
  timeText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  titleText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    marginTop: huddleSpacing.x1,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: huddleSocial.topicTabRowHeight,
  },
  topicTabFrame: {
    alignSelf: "stretch",
    height: huddleSocial.topicTabRowHeight,
    minHeight: huddleSocial.topicTabRowHeight,
    overflow: "visible",
    zIndex: 1,
  },
  tabRow: {
    alignItems: "center",
    gap: huddleSpacing.x4,
    minHeight: huddleSocial.topicTabRowHeight,
    paddingRight: huddleSpacing.x4,
  },
  topicTabScroller: {
    flexGrow: 0,
    height: huddleSocial.topicTabRowHeight,
    minHeight: huddleSocial.topicTabRowHeight,
    width: "100%",
  },
  tabText: {
    color: huddleColors.subtext,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  tabTextActive: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
  },
  tabUnderline: {
    backgroundColor: huddleColors.blue,
    borderRadius: huddleSocial.topicTabIndicatorRadius,
    height: huddleSocial.topicTabIndicatorHeight,
    marginTop: huddleSpacing.x1,
    opacity: 0,
    width: huddleSocial.topicTabIndicatorWidth,
  },
  tabUnderlineActive: {
    backgroundColor: huddleColors.blue,
    opacity: 1,
  },
  topIconButton: {
    alignItems: "center",
    height: huddleSpacing.x6,
    justifyContent: "center",
    width: huddleSpacing.x6,
  },
  carouselButton: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    height: huddleSocial.carouselButtonSize,
    justifyContent: "center",
    width: huddleSocial.carouselButtonSize,
    ...huddleShadows.glassElevation1,
  },
  carouselButtonDisabled: {
    opacity: 0.35,
  },
  carouselControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "center",
    marginTop: huddleSpacing.x2,
  },
  carouselDot: {
    backgroundColor: huddleColors.tabActive,
    borderRadius: huddleRadii.pill,
    height: huddleSocial.carouselDotSize,
    width: huddleSocial.carouselDotSize,
  },
  carouselDotActive: {
    backgroundColor: huddleColors.blue,
    width: huddleSocial.carouselActiveDotWidth,
  },
  videoBadge: {
    alignItems: "center",
    backgroundColor: huddleColors.backdrop,
    borderRadius: huddleRadii.pill,
    height: huddleSocial.videoBadgeSize,
    justifyContent: "center",
    left: "50%",
    marginLeft: huddleSocial.videoBadgeOffset,
    marginTop: huddleSocial.videoBadgeOffset,
    position: "absolute",
    top: "50%",
    width: huddleSocial.videoBadgeSize,
  },
  expandedBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
  },
  expandedHeader: {
    position: "absolute",
    top: 42,
    left: 0,
    right: 0,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x4,
  },
  expandedHeaderSpacer: {
    width: 42,
    height: 42,
  },
  expandedHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  expandedIconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  expandedSensitiveTapArea: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  expandedMediaFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  expandedSensitiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    gap: huddleSpacing.x1,
    justifyContent: "center",
    overflow: "hidden",
  },
  expandedSlide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x2,
  },
  expandedImageWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  expandedImage: {
    width: "100%",
    height: "100%",
  },
  expandedVideo: {
    width: "100%",
    height: "100%",
  },
  expandedVideoUnavailable: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  expandedVideoUnavailableText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  expandedDots: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
  },
  expandedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  expandedDotActive: {
    width: 18,
    backgroundColor: huddleColors.onPrimary,
  },

  sensitiveRevealHint: {
    marginTop: huddleSpacing.x1,
    textAlign: "center",
    fontFamily: "Urbanist-600",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.caption,
  },

});
