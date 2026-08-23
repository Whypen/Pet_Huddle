import { Feather, FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import { memo, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image as RNImage, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type GestureResponderEvent, type NativeSyntheticEvent, type TextLayoutEventData } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import emptyChatImage from "../../../assets/Notifications/empty-chat-native.png";
import { haptic } from "../../lib/nativeHaptics";
import { useReduceMotion } from "../../lib/nativeReduceMotion";
import { NativeProfileAvatar } from "../NativeProfileAvatar";
import { NativeVerifiedBadge } from "../NativeVerifiedBadge";
import { NativeToast } from "../NativeToast";
import { AppConfirmModal } from "../nativeModalPrimitives";
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
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import { readNativeDisplayCacheItem } from "../../lib/nativeDisplayCacheStorage";
import { getNativeMediaLibrarySavePermissionDetail, requestNativeMediaLibrarySavePermission } from "../../lib/nativeMediaPermissions";

const NATIVE_SOCIAL_TAGS = ["Social", "Pets", "Health", "Adoption", "News", "Events", "Market"] as const;
const NATIVE_SOCIAL_TABS = ["All", ...NATIVE_SOCIAL_TAGS] as const;
// Half the 16pt inter-tab gap horizontally (neighbours meet, never overlap) and
// enough vertically to lift the 32pt row to the 44pt minimum touch target.
const NATIVE_SOCIAL_TAB_HIT_SLOP = { bottom: 6, left: 8, right: 8, top: 6 } as const;
const NATIVE_SOCIAL_SORTS: NativeSocialSortMode[] = ["Latest", "Trending", "Saves"];
const NATIVE_SENSITIVE_TAP_SEEN_KEY = "huddle_sensitive_tap_seen";

const NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_KEY = "native-social-media-aspect-cache:v1";
const NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_LIMIT = 300;

async function saveExpandedImageToPhotos(uri: string): Promise<{ message: string; ok: boolean }> {
  const current = await getNativeMediaLibrarySavePermissionDetail();
  if (current.state !== "granted" && !current.canAskAgain) {
    haptic.error();
    return { ok: false, message: "Turn on Photos for huddle in Settings." };
  }
  const permission = await requestNativeMediaLibrarySavePermission();
  if (permission.state !== "granted") {
    haptic.error();
    return { ok: false, message: "Photo access is needed to save this image." };
  }
  let localUri = uri;
  let temporary = false;
  try {
    if (/^https?:\/\//i.test(uri)) {
      const extension = uri.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1] || "jpg";
      localUri = `${FileSystem.cacheDirectory}huddle-expanded-${Date.now()}.${extension}`;
      localUri = (await FileSystem.downloadAsync(uri, localUri)).uri;
      temporary = true;
    }
    const MediaLibrary = await import("expo-media-library");
    await MediaLibrary.saveToLibraryAsync(localUri);
    haptic.success();
    return { ok: true, message: "Saved to Photos" };
  } catch {
    haptic.error();
    return { ok: false, message: "Couldn't save this image. Try again." };
  } finally {
    if (temporary) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
  }
}

export function NativeZoomableMedia({ children, onLongPress, onZoomChange, resetKey }: { children: ReactNode; onLongPress: () => void; onZoomChange: (zoomed: boolean) => void; resetKey?: string | number }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    onZoomChange(false);
  }, [onZoomChange, resetKey, savedScale, savedX, savedY, scale, translateX, translateY]);
  const pinch = Gesture.Pinch().onUpdate((event) => {
    scale.value = Math.max(1, Math.min(4, savedScale.value * event.scale));
  }).onEnd(() => {
    savedScale.value = scale.value;
    runOnJS(onZoomChange)(scale.value > 1.01);
    if (scale.value <= 1.01) {
      scale.value = withSpring(1);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      savedX.value = 0;
      savedY.value = 0;
    }
  });
  const pan = Gesture.Pan().onUpdate((event) => {
    if (scale.value <= 1) return;
    const bound = 180 * (scale.value - 1);
    translateX.value = Math.max(-bound, Math.min(bound, savedX.value + event.translationX));
    translateY.value = Math.max(-bound, Math.min(bound, savedY.value + event.translationY));
  }).onEnd(() => {
    savedX.value = translateX.value;
    savedY.value = translateY.value;
  });
  const longPress = Gesture.LongPress().minDuration(450).onEnd((_event, success) => {
    if (success) runOnJS(onLongPress)();
  });
  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDelay(240).onEnd((_event, success) => {
    if (!success) return;
    const nextScale = savedScale.value > 1.01 ? 1 : 2;
    scale.value = withSpring(nextScale);
    savedScale.value = nextScale;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(onZoomChange)(nextScale > 1);
  });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));
  return <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, longPress, doubleTap)}><Reanimated.View style={[styles.expandedImageWrap, animatedStyle]}>{children}</Reanimated.View></GestureDetector>;
}

let nativeSocialMediaAspectMemoryCache: Record<string, number> | null = null;

const readNativeSocialMediaAspectCache = async () => {
  if (nativeSocialMediaAspectMemoryCache) return nativeSocialMediaAspectMemoryCache;
  try {
    const raw = await readNativeDisplayCacheItem(NATIVE_SOCIAL_MEDIA_ASPECT_CACHE_KEY);
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
  controlsHidden?: boolean;
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
  commentsOpen?: boolean;
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
  onMediaGestureActiveChange?: (active: boolean) => void;
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

// Returns null when there is genuinely no location, so callers can fall through to
// another source or render nothing. It must never invent a placeholder: a literal
// "Map" string reads as a real place to the user, and a truthy floor also silently
// defeats any `a || b` fallback chain built on top of it.
const deriveNativeSocialDistrictLabel = (value: string | null | undefined): string | null => {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const broadLabels = new Set(["greater london", "uk", "u.k.", "united kingdom", "england"]);
    return parts.find((part) => !broadLabels.has(part.toLowerCase())) || parts[0];
  }
  return parts[0] || null;
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
  controlsHidden = false,
  query,
  selectedTags,
  sortMode,
  onQueryChange,
  onSortChange,
  onToggleTag,
  onClearTags,
}: NativeSocialFilterBarProps) {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const reduceMotion = useReduceMotion();
  const controlsHideProgress = useRef(new Animated.Value(controlsHidden ? 1 : 0)).current;

  useEffect(() => {
    if (controlsHidden && sortMenuOpen) setSortMenuOpen(false);
    Animated.timing(controlsHideProgress, {
      toValue: controlsHidden ? 1 : 0,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: false,
    }).start();
  }, [controlsHidden, controlsHideProgress, reduceMotion, sortMenuOpen]);

  // Category tabs are single-select (one active category at a time, like a
  // platform segmented control); "All" is index 0. The active underline slides
  // between tabs and the strip auto-scrolls so the active tab stays on screen,
  // keeping tap and swipe navigation visually coupled.
  const activeIndex = selectedTags.length === 0
    ? 0
    : Math.max(0, (NATIVE_SOCIAL_TAGS as readonly string[]).indexOf(selectedTags[0]) + 1);

  const tabScrollRef = useRef<ScrollView | null>(null);
  const tabLayoutsRef = useRef<Array<{ x: number; width: number } | undefined>>([]);
  // Live geometry of the strip, needed to scroll it by the minimum amount.
  const tabViewportWidthRef = useRef(0);
  const tabScrollOffsetRef = useRef(0);
  const underlineLeft = useRef(new Animated.Value(0)).current;
  const [underlineReady, setUnderlineReady] = useState(false);
  const indicatorWidth = huddleSocial.topicTabIndicatorWidth;

  const placeUnderline = useCallback((index: number, animate: boolean) => {
    const layout = tabLayoutsRef.current[index];
    if (!layout) return;
    const target = layout.x + layout.width / 2 - indicatorWidth / 2;
    if (animate && !reduceMotion) {
      Animated.spring(underlineLeft, { toValue: target, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
    } else {
      underlineLeft.setValue(target);
    }
    // Scroll the strip ONLY when the active tab is not already fully visible, and
    // then only by the minimum needed to reveal it.
    //
    // This used to be an unconditional scrollTo(layout.x - x4), which pinned the
    // active tab to the LEFT EDGE of the viewport and therefore pushed every tab
    // before it out of view. Selecting e.g. "Health" (x~155) scrolled to 139 even
    // though Health was already fully on screen in a ~390pt viewport — and that
    // scrolled "All" (x 16..37, the first tab) completely out of reach, so it could
    // not be tapped at all until the user manually dragged the strip back.
    const viewportWidth = tabViewportWidthRef.current;
    if (viewportWidth > 0) {
      const pad = huddleSpacing.x4;
      const currentOffset = tabScrollOffsetRef.current;
      const leftEdge = layout.x - pad;
      const rightEdge = layout.x + layout.width + pad;
      let nextOffset = currentOffset;
      if (leftEdge < currentOffset) nextOffset = Math.max(0, leftEdge);
      else if (rightEdge > currentOffset + viewportWidth) nextOffset = rightEdge - viewportWidth;
      if (Math.abs(nextOffset - currentOffset) > 1) {
        tabScrollOffsetRef.current = nextOffset;
        tabScrollRef.current?.scrollTo({ x: nextOffset, animated: animate && !reduceMotion });
      }
    }
    setUnderlineReady(true);
  }, [indicatorWidth, reduceMotion, underlineLeft]);

  useEffect(() => {
    placeUnderline(activeIndex, underlineReady);
  }, [activeIndex, placeUnderline, underlineReady]);

  return (
    <View style={styles.filterBlock}>
      <View style={styles.topicTabFrame}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          alwaysBounceHorizontal={false}
          automaticallyAdjustContentInsets={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onLayout={(event) => { tabViewportWidthRef.current = event.nativeEvent.layout.width; }}
          onScroll={(event) => { tabScrollOffsetRef.current = event.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={16}
          style={styles.topicTabScroller}
          contentContainerStyle={styles.tabRow}
        >
          {NATIVE_SOCIAL_TABS.map((tab, index) => {
            const isActive = index === activeIndex;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab === "All" ? "All posts" : `${tab} posts`}
                onPress={() => (index === 0 ? onClearTags() : onToggleTag(tab))}
                // The tab's box is exactly its text width (tabButton has no
                // horizontal padding) and the row is 32pt tall, so "All" — the
                // shortest label in the strip at ~21pt — had by far the smallest
                // target and was the only tab that regularly missed taps.
                // hitSlop enlarges the touch region only: no layout, spacing or
                // visual change. 8pt horizontal exactly halves the 16pt inter-tab
                // gap, so neighbours meet without overlapping (no ambiguous hits
                // and no dead zone), and 6pt vertical brings 32pt up to 44pt.
                hitSlop={NATIVE_SOCIAL_TAB_HIT_SLOP}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  tabLayoutsRef.current[index] = { x, width };
                  if (index === activeIndex) placeUnderline(index, false);
                }}
                style={({ pressed }) => [styles.tabButton, pressed ? styles.pressed : null]}
              >
                <Text style={[styles.tabText, isActive ? styles.tabTextActive : null]}>{tab}</Text>
              </Pressable>
            );
          })}
          <Animated.View
            pointerEvents="none"
            style={[styles.tabUnderlineSlider, { width: indicatorWidth, opacity: underlineReady ? 1 : 0, transform: [{ translateX: underlineLeft }] }]}
          />
        </ScrollView>
      </View>
      <Animated.View
        pointerEvents={controlsHidden ? "none" : "auto"}
        style={[styles.searchSortReveal, {
          height: controlsHideProgress.interpolate({ inputRange: [0, 1], outputRange: [huddleLayout.minTouch, 0] }),
          opacity: controlsHideProgress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0, 0] }),
          transform: [{ translateY: controlsHideProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
        }]}
      >
      <View style={styles.searchSortRow}>
        <View style={styles.searchFieldWrap}>
          <View style={styles.searchField}>
            <Feather color={huddleColors.iconSubtle} name="search" size={huddleSocial.actionIconSize} />
            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
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
      </Animated.View>
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
  const authorSocialId = String(thread.author.socialId || "").replace(/^@/, "").trim().toLowerCase();
  const authorName = String(thread.author.displayName || "").trim().toLowerCase();
  const authorVerified =
    thread.author.isVerified === true ||
    String(thread.author.verificationStatus || "").toLowerCase() === "verified" ||
    (authorSocialId === "manager" && (authorName === "huddle" || authorName === "team huddle"));
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpenProfile(thread.userId)} style={({ pressed }) => [styles.avatarTouch, pressed ? styles.pressed : null]}>
      <NativeProfileAvatar
        userId={thread.userId}
        uri={thread.author.avatarUrl}
        size={huddleSocial.avatarSize}
        ringWidth={huddleSocial.avatarBorderWidth}
        verified={authorVerified}
        name={thread.author.displayName}
        engagement={thread.author.engagement}
      />
      {authorVerified ? (
        <View style={styles.avatarVerifiedBadge}>
          <NativeVerifiedBadge compact variant="avatar" />
        </View>
      ) : null}
    </Pressable>
  );
});

export type NativeSocialCarouselItem = {
  aspectRatio?: number | null;
  height?: number | null;
  kind?: "image" | "video";
  uri: string;
  version?: string | null;
  videoUri?: string | null;
  width?: number | null;
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
    nextPlayer.audioMixingMode = "mixWithOthers";
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
    const posterVersion = posterUri;
    return (
      <View style={styles.expandedImageWrap}>
        <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="contain" key={nativeFreshImageKey(posterUri, posterVersion)} source={{ uri: nativeFreshImageUri(posterUri, posterVersion) }} style={styles.expandedImage} transition={120} />
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
  // The carousel still owns aspect measurement for its thumbnails. The expanded
  // viewer deliberately uses the whole screen and lets the image contain itself.
  void aspectByUri;
  const scrollRef = useRef<ScrollView | null>(null);
  const { height, width } = useWindowDimensions();
  const [muted, setMuted] = useState(true);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [saveTargetUri, setSaveTargetUri] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const swipeDownStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeDownDeltaRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) {
      setImageZoomed(false);
      setSaveTargetUri(null);
      setSaveNotice(null);
      setSavingImage(false);
      return;
    }
    setImageZoomed(false);
    setSaveTargetUri(null);
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
    if (!imageZoomed && delta.y > 92 && Math.abs(delta.x) < 72) onClose();
  };

  const confirmSaveImage = async () => {
    if (!saveTargetUri || savingImage) return;
    setSavingImage(true);
    const result = await saveExpandedImageToPhotos(saveTargetUri);
    setSavingImage(false);
    setSaveTargetUri(null);
    setSaveNotice(result.message);
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
          pagingEnabled={!imageZoomed}
          scrollEnabled={!imageZoomed}
          onTouchEnd={handleSwipeDownEnd}
          onTouchMove={handleSwipeDownMove}
          onTouchStart={handleSwipeDownStart}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
            onIndexChange(Math.max(0, Math.min(items.length - 1, nextIndex)));
          }}
        >
          {items.map((item, index) => {
            const hiddenSensitive = isSensitive && !revealed;
            const imageVersion = item.version || item.uri;
            const mediaFrame = (
              <View style={[styles.expandedMediaFrame, { height, width }]}>
                {item.kind === "video" && !hiddenSensitive ? (
                  <NativeSocialExpandedVideo active={index === activeIndex} muted={muted} posterUri={item.uri} uri={item.videoUri} />
                ) : (
                  <NativeZoomableMedia
                    onLongPress={() => { if (!hiddenSensitive) setSaveTargetUri(item.uri); }}
                    onZoomChange={setImageZoomed}
                    resetKey={`${open}:${activeIndex}`}
                  >
                    <ExpoImage
                      accessibilityIgnoresInvertColors
                      blurRadius={hiddenSensitive ? huddleSocial.sensitiveBlurRadius : 0}
                      cachePolicy="memory-disk"
                      contentFit="contain"
                      key={nativeFreshImageKey(item.uri, imageVersion)}
                      source={{ uri: nativeFreshImageUri(item.uri, imageVersion) }}
                      style={styles.expandedImage}
                      transition={120}
                    />
                  </NativeZoomableMedia>
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
        <AppConfirmModal
          body="Save this image to your photo library?"
          confirmLabel="Save Image"
          loading={savingImage}
          onCancel={() => { if (!savingImage) setSaveTargetUri(null); }}
          onConfirm={() => void confirmSaveImage()}
          open={Boolean(saveTargetUri)}
          title="Save image"
        />
        {saveNotice ? <NativeToast message={saveNotice} onDismiss={() => setSaveNotice(null)} /> : null}
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
  onDoubleTapAt,
  onFrameHeightChange,
  onLongPress,
  deferImageUntilMeasured = false,
  onPress,
  onGestureActiveChange,
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
  // When provided, the carousel skips its internal pop overlay and forwards
  // page-relative tap coordinates so the parent can render a fly-to-target
  // burst (e.g. into the FeedCard action-bar like icon).
  onDoubleTapAt?: (pageX: number, pageY: number) => void;
  onFrameHeightChange?: (height: number) => void;
  onLongPress?: () => void;
  deferImageUntilMeasured?: boolean;
  onPress?: () => void;
  onGestureActiveChange?: (active: boolean) => void;
  contentWidth?: number;
  maxFrameHeight?: number;
  popIconVariant?: "paw" | "heart";
  videoStatus?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [sensitiveTapStage, setSensitiveTapStage] = useState<"toggle" | "fullscreen">("toggle");
  const [tapHintDismissed, setTapHintDismissed] = useState(false);
  // SO9: big-paw pop visual on double-tap-to-like.
  // Instagram-style: tight punch-in with scale overshoot + brief rotation flutter,
  // anchored at the tap point instead of always dead-center.
  const reduceMotion = useReduceMotion();
  const heartScale = useRef(new Animated.Value(0.35)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartRotation = useRef(new Animated.Value(0)).current;
  const heartOriginX = useRef(new Animated.Value(0)).current;
  const heartOriginY = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const expandedOpenRef = useRef(false);
  const mediaGestureChangeRef = useRef(onGestureActiveChange);
  const [aspectByUri, setAspectByUri] = useState<Record<string, number>>({});
  const scrollRef = useRef<ScrollView | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressPressUntilRef = useRef(0);
  const { width } = useWindowDimensions();
  const resolvedContentWidth = contentWidth ?? Math.max(0, width - huddleSpacing.x8 - huddleSocial.avatarSize - huddleSpacing.x4);
  const media = items;
  const activeUri = media[activeIndex]?.uri || media[0]?.uri || "";
  const aspectForItem = useCallback((item: NativeSocialCarouselItem | undefined) => {
    if (!item) return huddleSocial.mediaFrameAspectRatio;
    const explicitAspect = typeof item.aspectRatio === "number" && Number.isFinite(item.aspectRatio) && item.aspectRatio > 0 ? item.aspectRatio : null;
    const dimensionAspect = typeof item.width === "number" && typeof item.height === "number" && item.width > 0 && item.height > 0 ? item.width / item.height : null;
    return clampNativeSocialMediaAspect(explicitAspect || dimensionAspect || aspectByUri[item.uri] || huddleSocial.mediaFrameAspectRatio);
  }, [aspectByUri]);
  const activeSlideAspect = aspectForItem(media[activeIndex] || media[0]);
  const activeItem = media[activeIndex] || media[0];
  const activeAspectResolved = Boolean(activeItem && (
    activeItem.aspectRatio
    || (activeItem.width && activeItem.height)
    || aspectByUri[activeItem.uri]
  ));
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
    mediaGestureChangeRef.current = onGestureActiveChange;
  }, [onGestureActiveChange]);

  useEffect(() => () => {
    if (expandedOpenRef.current) mediaGestureChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    let active = true;
    void readNativeDisplayCacheItem(NATIVE_SENSITIVE_TAP_SEEN_KEY).then((value) => {
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
    haptic.reveal();
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
  const HEART_POP_SIZE = 84;

  useEffect(() => {
    onFrameHeightChange?.(activeFrameHeight);
  }, [activeFrameHeight, onFrameHeightChange]);

  useEffect(() => {
    media.forEach((item) => {
      if (!item.uri || aspectByUri[item.uri] || item.aspectRatio || (item.width && item.height)) return;
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

  useEffect(() => {
    Animated.timing(animatedHeightRef.current, {
      duration: heightAnimationMs,
      toValue: activeFrameHeight,
      useNativeDriver: false,
    }).start();
  }, [activeFrameHeight, animatedHeightRef, heightAnimationMs]);

  if (media.length === 0) return null;

  const scrollToIndex = (index: number) => {
    const next = Math.max(0, Math.min(media.length - 1, index));
    setActiveIndex(next);
    scrollRef.current?.scrollTo({
      animated: true,
      x: next * slideWidth,
    });
  };

  const handleMediaPress = (index: number, event?: GestureResponderEvent) => {
    if (Date.now() < suppressPressUntilRef.current) return;
    const nextIndex = Math.max(0, Math.min(media.length - 1, index));
    const tapX = event?.nativeEvent.locationX ?? slideWidth / 2;
    const tapY = event?.nativeEvent.locationY ?? activeFrameHeight / 2;

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
    if (gap < DOUBLE_TAP_GAP_MS && (onDoubleTap || onDoubleTapAt)) {
      lastTapAtRef.current = 0;
      if (pendingSingleTapRef.current) {
        clearTimeout(pendingSingleTapRef.current);
        pendingSingleTapRef.current = null;
      }
      haptic.selectTab();
      // When the parent owns the burst (fly-to-action-bar), forward absolute
      // page coords and skip the local in-place pop entirely.
      if (onDoubleTapAt) {
        onDoubleTapAt(event?.nativeEvent.pageX ?? 0, event?.nativeEvent.pageY ?? 0);
        onDoubleTap?.();
        return;
      }
      // Reduce Motion: register the like, skip the decorative pop entirely.
      if (reduceMotion) {
        onDoubleTap?.();
        return;
      }
      // Fallback: standalone usage (chat dialogue, alert detail) — local burst
      // anchored at tap point, scale punch with overshoot, brief rotation
      // flutter, hold, quick fade. ~600ms total.
      heartOriginX.setValue(tapX);
      heartOriginY.setValue(tapY);
      heartScale.setValue(0.35);
      heartOpacity.setValue(0);
      heartRotation.setValue(0);
      Animated.parallel([
        // Scale: spring overshoot 0.35 → 1.25 → settle 1.0 (≈220ms)
        Animated.sequence([
          Animated.spring(heartScale, { toValue: 1.25, useNativeDriver: true, damping: 8, stiffness: 240, mass: 0.45 }),
          Animated.spring(heartScale, { toValue: 1.0, useNativeDriver: true, damping: 14, stiffness: 200, mass: 0.45 }),
        ]),
        // Opacity: fast in (80ms), hold (260ms), fade out (260ms) ≈ 600ms total
        Animated.sequence([
          Animated.timing(heartOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.delay(260),
          Animated.timing(heartOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
        // Rotation flutter — quick tilt, spring back
        Animated.sequence([
          Animated.timing(heartRotation, { toValue: -1, duration: 100, useNativeDriver: true }),
          Animated.spring(heartRotation, { toValue: 0, useNativeDriver: true, damping: 9, stiffness: 220, mass: 0.4 }),
        ]),
      ]).start();
      onDoubleTap?.();
      return;
    }
    lastTapAtRef.current = now;

    // Schedule single-tap (fullscreen) — cancelled by a second tap arriving in time
    if (pendingSingleTapRef.current) clearTimeout(pendingSingleTapRef.current);
    pendingSingleTapRef.current = setTimeout(() => {
      pendingSingleTapRef.current = null;
      setExpandedIndex(nextIndex);
      // Full-screen media owns every horizontal gesture until it closes. Keep
      // the parent topic pager locked for the entire viewer session—not only
      // while the in-feed carousel has an active touch.
      expandedOpenRef.current = true;
      onGestureActiveChange?.(true);
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
          onTouchStart={(event) => {
            event.stopPropagation();
            const touch = event.nativeEvent;
            touchStartRef.current = { x: touch.pageX, y: touch.pageY };
            onGestureActiveChange?.(true);
          }}
          onTouchMove={(event) => {
            event.stopPropagation();
            const start = touchStartRef.current;
            if (!start) return;
            const touch = event.nativeEvent;
            if (Math.abs(touch.pageX - start.x) > 8 || Math.abs(touch.pageY - start.y) > 8) {
              suppressPressUntilRef.current = Date.now() + 120;
            }
          }}
          onTouchCancel={(event) => {
            event.stopPropagation();
            touchStartRef.current = null;
            requestAnimationFrame(() => onGestureActiveChange?.(expandedOpenRef.current));
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
            touchStartRef.current = null;
            requestAnimationFrame(() => onGestureActiveChange?.(expandedOpenRef.current));
          }}
          contentContainerStyle={styles.mediaPagingRow}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(slideWidth, 1));
            setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)));
          }}
        >
	          {media.map((item, index) => {
	            const itemAspect = aspectForItem(item);
		            const itemFrameHeight = fixedFrameHeight ?? heightForAspect(itemAspect);
		            const fittedWidth = Math.min(slideWidth, itemFrameHeight * itemAspect);
		            const fittedHeight = Math.min(itemFrameHeight, slideWidth / itemAspect);
                const mediaWidth = thumbnailFit === "cover" ? slideWidth : fittedWidth;
                const mediaHeight = thumbnailFit === "cover" ? itemFrameHeight : fittedHeight;
                const imageVersion = item.version || item.uri;
	            return (
              <Pressable
		                key={`${item.kind}-${item.uri || index}`}
		                accessibilityRole="button"
                    delayLongPress={260}
                    onLongPress={onLongPress}
		                onPress={(event) => handleMediaPress(index, event)}
	                style={({ pressed }) => [styles.mediaFrame, { height: itemFrameHeight, width: slideWidth }, pressed ? styles.pressed : null]}
              >
                {item.uri ? (
                  <View style={styles.mediaImageContainBox}>
	                    <ExpoImage
	                      accessibilityIgnoresInvertColors
	                      blurRadius={isSensitive && !revealed ? huddleSocial.sensitiveBlurRadius : 0}
	                      cachePolicy="memory-disk"
	                      contentFit={thumbnailFit}
	                      key={nativeFreshImageKey(item.uri, imageVersion)}
	                      source={{ uri: nativeFreshImageUri(item.uri, imageVersion) }}
	                      style={[styles.mediaImage, { height: mediaHeight, width: mediaWidth }, deferImageUntilMeasured && index === activeIndex && !activeAspectResolved ? styles.mediaImagePending : null]}
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
        {/* SO9: pop overlay — anchored at tap point, pointerEvents="none" so it never blocks taps */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heartPopAnchor,
            {
              opacity: heartOpacity,
              transform: [
                { translateX: Animated.subtract(heartOriginX, HEART_POP_SIZE / 2) },
                { translateY: Animated.subtract(heartOriginY, HEART_POP_SIZE / 2) },
                { scale: heartScale },
                { rotate: heartRotation.interpolate({ inputRange: [-1, 1], outputRange: ["-9deg", "9deg"] }) },
              ],
            },
          ]}
        >
          {popIconVariant === "heart" ? (
            <FontAwesome color="#FF3B5C" name="heart" size={HEART_POP_SIZE} style={styles.heartPopIcon} />
          ) : (
            <MaterialCommunityIcons color={huddleColors.coral} name="paw" size={HEART_POP_SIZE} style={styles.heartPopIcon} />
          )}
        </Animated.View>
      </Animated.View>
      <NativeSocialExpandedMediaViewer
        activeIndex={expandedIndex}
        aspectByUri={aspectByUri}
        isSensitive={isSensitive}
        items={media}
        onClose={() => {
          expandedOpenRef.current = false;
          onGestureActiveChange?.(false);
          setExpandedOpen(false);
        }}
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
      {isSensitive && revealed && sensitiveTapStage === "fullscreen" ? <Text style={styles.sensitiveRevealHint}>Tap again to enlarge</Text> : null}
    </View>
  );
}

function NativeSocialMediaStrip({
  thread,
  onOpenWebThread,
  onDoubleTap,
  onDoubleTapAt,
  onGestureActiveChange,
}: {
  thread: NativeSocialThread;
  onOpenWebThread: () => void;
  onDoubleTap?: () => void;
  onDoubleTapAt?: (pageX: number, pageY: number) => void;
  onGestureActiveChange?: (active: boolean) => void;
}) {
  const media = useMemo(() => {
    const imageItems = thread.images.map((uri) => {
      const metadata = thread.imageMetadata.find((item) => item.url === uri);
      return {
        aspectRatio: metadata?.aspectRatio ?? null,
        height: metadata?.height ?? null,
        uri,
        version: uri,
        kind: "image" as const,
        width: metadata?.width ?? null,
      };
    });
    if (thread.videoProvider === "bunny_stream" && thread.providerVideoId) {
      const poster = thread.videoThumbnailUrl || thread.videoPreviewUrl || "";
      return [...imageItems, { uri: poster, version: poster || thread.providerVideoId, videoUri: thread.videoPlaybackUrl, kind: "video" as const }];
    }
    return imageItems;
  }, [thread.imageMetadata, thread.images, thread.providerVideoId, thread.videoPlaybackUrl, thread.videoProvider, thread.videoPreviewUrl, thread.videoThumbnailUrl]);

  return <NativeSocialMediaCarousel isSensitive={thread.isSensitive} items={media} onDoubleTap={onDoubleTap} onDoubleTapAt={onDoubleTapAt} onGestureActiveChange={onGestureActiveChange} onPress={onOpenWebThread} videoStatus={thread.videoStatus} />;
}

export function NativeSocialExternalLinkPreview({
  linkPreview,
  onOpen,
  onRemove,
  url,
}: {
  linkPreview: NativeSocialLinkPreview | null;
  onOpen: (url: string) => void;
  onRemove?: () => void;
  url: string;
}) {
  return (
    <Pressable accessibilityRole="link" onPress={() => onOpen(url)} style={({ pressed }) => [styles.linkPreview, pressed ? styles.pressed : null]}>
      {onRemove ? (
        <Pressable
          accessibilityLabel="Remove link preview"
          accessibilityRole="button"
          hitSlop={huddleSpacing.x1}
          onPress={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={({ pressed }) => [styles.linkPreviewRemoveButton, pressed ? styles.pressed : null]}
        >
          <Feather color={huddleColors.text} name="x" size={16} />
        </Pressable>
      ) : null}
      {linkPreview?.image ? (
        <ExpoImage {...huddleImageDefaults} accessibilityIgnoresInvertColors key={nativeFreshImageKey(linkPreview.image, linkPreview.url || linkPreview.image)} source={{ uri: nativeFreshImageUri(linkPreview.image, linkPreview.url || linkPreview.image) }} style={styles.linkPreviewImage} />
      ) : linkPreview?.loading ? (
        <View style={styles.linkPreviewLoading} />
      ) : null}
      <View style={styles.linkPreviewBody}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.linkMeta}>{linkPreview?.siteName || hostLabel(url)}</Text>
        <Text numberOfLines={2} style={styles.linkTitle}>{linkPreview?.title || formatNativeSocialUrlLabel(url)}</Text>
        {linkPreview?.description ? <Text numberOfLines={2} style={styles.linkDescription}>{linkPreview.description}</Text> : null}
        {linkPreview?.failed ? <Text style={styles.linkFailedText}>Preview unavailable</Text> : null}
      </View>
    </Pressable>
  );
}

function NativeSocialActionBar({
  thread,
  supported,
  commentsOpen,
  onOpenComments,
  onOpenMore,
  onOpenWebThread,
  onOpenShare,
  onOpenSupport,
  pawWrapperRef,
  onPawLayout,
  pawScale,
}: {
  thread: NativeSocialThread;
  supported: boolean;
  commentsOpen?: boolean;
  onOpenComments: () => void;
  onOpenMore: (event: GestureResponderEvent) => void;
  onOpenWebThread: () => void;
  onOpenShare: () => void;
  onOpenSupport: () => void;
  pawWrapperRef?: RefObject<View | null>;
  onPawLayout?: () => void;
  pawScale?: Animated.Value;
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
    <>
    {/* Found sits on its own line, not in the meta row. The meta row already carries the
        timestamp and tag beside a 136pt action cluster that never shrinks (React Native
        defaults flexShrink to 0), so a third pill pushes the action icons off-screen on
        anything narrower than a large phone -- and the badge widens as it ages. */}
    {thread.foundAt ? (
      <View style={styles.foundRow}>
        <View style={[styles.tagPill, styles.tagPill_found]}>
          <Feather color={huddleColors.onPrimary} name="check-circle" size={11} />
          <Text numberOfLines={1} style={[styles.tagText, styles.tagText_onFill]}>
            {`Found · ${formatNativeSocialTimeAgo(thread.foundAt)}`}
          </Text>
        </View>
      </View>
    ) : null}
    <View style={styles.actionRow}>
      <View style={styles.actionMeta}>
        <Text style={styles.timeText}>{formatNativeSocialTimeAgo(thread.createdAt)}</Text>
        {primaryTag ? (
          <View style={[styles.tagPill, tagPillToneStyle]}>
            <Text numberOfLines={1} style={[styles.tagText, tagTextToneStyle]}>{primaryTag}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actionCluster}>
        <Pressable accessibilityRole="button" accessibilityLabel={supported ? "Remove support" : "Support post"} accessibilityState={{ selected: supported }} onPress={onOpenSupport} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Animated.View
            ref={pawWrapperRef}
            onLayout={onPawLayout}
            style={pawScale ? { transform: [{ scale: pawScale }] } : null}
          >
            <MaterialCommunityIcons
              color={supported ? huddleColors.coral : huddleColors.iconMuted}
              name={supported ? "paw" : "paw-outline"}
              size={huddleSocial.actionIconSize}
            />
          </Animated.View>
          {thread.likes > 0 ? (
            <View style={styles.actionBadge}>
              <Text style={styles.actionCount}>{thread.likes}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={commentsOpen ? "Hide replies" : "Open replies"} accessibilityState={{ expanded: Boolean(commentsOpen) }} onPress={onOpenComments} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Feather color={commentsOpen ? huddleColors.coral : huddleColors.iconMuted} name="message-circle" size={huddleSocial.actionIconSize} />
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
    </>
  );
}

function NativeSocialAuthorHandle({ thread }: { thread: NativeSocialThread }) {
  const socialAuthorLabel = thread.author.socialId || thread.author.displayName || "Anonymous";
  const isPillar = thread.author.engagement?.tier === "pillar";
  return (
    <View style={styles.authorNameRow}>
      <Text numberOfLines={1} style={[styles.authorName, isPillar ? styles.authorNameGold : null]}>{socialAuthorLabel}</Text>
    </View>
  );
}

const FEED_BURST_SIZE = 68;

export const NativeSocialFeedCard = memo(function NativeSocialFeedCard({
  thread,
  expanded,
  linkPreview,
  pinned,
  saved,
  supported,
  commentsOpen,
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
  onMediaGestureActiveChange,
}: NativeSocialFeedCardProps) {
  const [contentLineCount, setContentLineCount] = useState(0);
  const firstUrl = extractNativeSocialFirstHttpUrl(thread.content);
  const visibleContent = linkPreview?.failed
    ? thread.content
    : stripNativeSocialExternalUrlFromText(thread.content, firstUrl);
  const shouldCollapse = contentLineCount > huddleSocial.contentCollapsedLines;
  // alertDistrict comes from the alert row and disappears with it; postDistrict is written
  // onto the thread at cross-post time and survives, so the location text outlives the pin.
  const alertLocationLabel = deriveNativeSocialDistrictLabel(thread.alertDistrict)
    || deriveNativeSocialDistrictLabel(thread.postDistrict);
  const alertIsOpenable = thread.alertState === "active" && Boolean(thread.mapId);

  // SO9: Instagram-style fly-to-action-bar burst. Burst pops at the tap point,
  // briefly holds, then translates to the action-bar paw while scaling down
  // and fading; on landing, the action-bar paw plays a small punch.
  const reduceMotion = useReduceMotion();
  const cardRef = useRef<View | null>(null);
  const pawWrapperRef = useRef<View | null>(null);
  const cardOriginRef = useRef({ x: 0, y: 0 });
  const pawCenterRef = useRef({ x: 0, y: 0 });
  const burstScale = useRef(new Animated.Value(0.35)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const burstRotation = useRef(new Animated.Value(0)).current;
  const burstX = useRef(new Animated.Value(-FEED_BURST_SIZE)).current;
  const burstY = useRef(new Animated.Value(-FEED_BURST_SIZE)).current;
  const pawScale = useRef(new Animated.Value(1)).current;

  const handleCardLayout = useCallback(() => {
    cardRef.current?.measureInWindow((x, y) => {
      cardOriginRef.current = { x, y };
    });
  }, []);

  const handlePawLayout = useCallback(() => {
    pawWrapperRef.current?.measureInWindow((x, y, w, h) => {
      pawCenterRef.current = {
        x: x + w / 2 - cardOriginRef.current.x,
        y: y + h / 2 - cardOriginRef.current.y,
      };
    });
  }, []);

  const runBurst = useCallback((localX: number, localY: number, target: { x: number; y: number }) => {
    // Reduce Motion: the like is already registered by the media layer; skip the
    // fly-to-action-bar burst and paw punch entirely.
    if (reduceMotion) return;
    burstX.setValue(localX);
    burstY.setValue(localY);
    burstScale.setValue(0.35);
    burstOpacity.setValue(0);
    burstRotation.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(burstScale, { toValue: 1.25, useNativeDriver: true, damping: 8, stiffness: 240, mass: 0.45 }),
        Animated.spring(burstScale, { toValue: 1.0, useNativeDriver: true, damping: 14, stiffness: 200, mass: 0.45 }),
        Animated.delay(120),
        Animated.timing(burstScale, { toValue: 0.18, duration: 300, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(burstOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.delay(380),
        Animated.timing(burstOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(burstRotation, { toValue: -1, duration: 100, useNativeDriver: true }),
        Animated.spring(burstRotation, { toValue: 0, useNativeDriver: true, damping: 9, stiffness: 220, mass: 0.4 }),
      ]),
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(burstX, { toValue: target.x, duration: 300, useNativeDriver: true }),
          Animated.timing(burstY, { toValue: target.y, duration: 300, useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => {
      // Punch the action-bar paw on receipt.
      Animated.sequence([
        Animated.spring(pawScale, { toValue: 1.22, useNativeDriver: true, damping: 8, stiffness: 240, mass: 0.4 }),
        Animated.spring(pawScale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 200, mass: 0.4 }),
      ]).start();
    });
  }, [burstOpacity, burstRotation, burstScale, burstX, burstY, pawScale, reduceMotion]);

  const handleDoubleTapAt = useCallback((pageX: number, pageY: number) => {
    // Re-measure card + paw positions because scroll may have shifted them.
    cardRef.current?.measureInWindow((cx, cy) => {
      cardOriginRef.current = { x: cx, y: cy };
      pawWrapperRef.current?.measureInWindow((px, py, pw, ph) => {
        const target = {
          x: px + pw / 2 - cx,
          y: py + ph / 2 - cy,
        };
        pawCenterRef.current = target;
        runBurst(pageX - cx, pageY - cy, target);
      });
    });
  }, [runBurst]);

  return (
    <View ref={cardRef} onLayout={handleCardLayout} style={styles.card}>
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
          <Text ellipsizeMode="tail" numberOfLines={2} style={styles.titleText}>{thread.title}</Text>
          {alertLocationLabel ? (
            // A pin that can still be opened stays a link. Once it is gone -- deleted,
            // found, expired, or not visible to this viewer -- the same place becomes
            // ordinary text. A link that cannot travel anywhere is worse than no link.
            alertIsOpenable ? (
              <Pressable accessibilityRole="button" onPress={onOpenMap} style={({ pressed }) => [styles.mapLink, pressed ? styles.pressed : null]}>
                <Text style={styles.mapPin}>📍</Text>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.mapLinkText}>{alertLocationLabel}</Text>
              </Pressable>
            ) : (
              <View style={styles.mapLink}>
                <Text style={styles.mapPin}>📍</Text>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.mapLinkPlainText}>{alertLocationLabel}</Text>
              </View>
            )
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
                <ExpoImage {...huddleImageDefaults} accessibilityIgnoresInvertColors key={nativeFreshImageKey(linkPreview.image, linkPreview.url || linkPreview.image)} source={{ uri: nativeFreshImageUri(linkPreview.image, linkPreview.url || linkPreview.image) }} style={styles.linkPreviewImage} />
              ) : linkPreview?.loading ? (
                <View style={styles.linkPreviewLoading} />
              ) : null}
              <View style={styles.linkPreviewBody}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.linkMeta}>{linkPreview?.siteName || hostLabel(firstUrl)}</Text>
                <Text numberOfLines={2} style={styles.linkTitle}>{linkPreview?.title || formatNativeSocialUrlLabel(firstUrl)}</Text>
                {linkPreview?.description ? <Text numberOfLines={2} style={styles.linkDescription}>{linkPreview.description}</Text> : null}
                {linkPreview?.failed ? <Text style={styles.linkFailedText}>Preview unavailable</Text> : null}
              </View>
            </Pressable>
          ) : null}
          {thread.hashtags.length > 0 ? <Text style={styles.hashtagText}>{thread.hashtags.slice(0, 3).map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</Text> : null}
          <NativeSocialMediaStrip
            thread={thread}
            onDoubleTap={() => { if (!supported) onOpenSupport(); }}
            onDoubleTapAt={handleDoubleTapAt}
            onGestureActiveChange={onMediaGestureActiveChange}
            onOpenWebThread={onOpenWebThread}
          />
          {thread.localStatus ? <Text style={styles.localStatusText}>Posting…</Text> : null}
          <NativeSocialActionBar
            commentsOpen={commentsOpen}
            supported={supported}
            thread={thread}
            onOpenComments={onOpenComments}
            onOpenMore={onOpenMore}
            onOpenShare={onOpenShare}
            onOpenSupport={onOpenSupport}
            onOpenWebThread={onOpenWebThread}
            pawWrapperRef={pawWrapperRef}
            onPawLayout={handlePawLayout}
            pawScale={pawScale}
          />
        </View>
      </View>
      {/* Fly-to-action-bar burst overlay. Card-relative absolute positioning. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.feedBurst,
          {
            opacity: burstOpacity,
            transform: [
              { translateX: Animated.subtract(burstX, FEED_BURST_SIZE / 2) },
              { translateY: Animated.subtract(burstY, FEED_BURST_SIZE / 2) },
              { scale: burstScale },
              { rotate: burstRotation.interpolate({ inputRange: [-1, 1], outputRange: ["-9deg", "9deg"] }) },
            ],
          },
        ]}
      >
        <MaterialCommunityIcons color={huddleColors.coral} name="paw" size={FEED_BURST_SIZE} />
      </Animated.View>
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
    flexShrink: 1,
    gap: huddleSpacing.x2,
    minWidth: 0,
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: huddleSpacing.x3,
  },
  foundRow: {
    alignSelf: "flex-start",
    marginTop: huddleSpacing.x3,
  },
  authorName: {
    color: huddleColors.text,
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: huddleType.labelLine,
  },
  authorNameGold: {
    // Solid gold tint only here (no animated sweep) — feed rows render many
    // avatars at once, so the shimmer sweep stays reserved for the profile hero.
    color: "#C8861A",
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
  avatarTouch: {
    alignItems: "center",
    height: huddleSocial.avatarSize,
    justifyContent: "center",
    position: "relative",
    width: huddleSocial.avatarSize,
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
    fontSize: 15,
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
    position: "relative",
    overflow: "visible",
  },
  feedBurst: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: huddleColors.canvas,
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
    backgroundColor: huddleColors.coralSoftFill,
    borderRadius: huddleRadii.pill,
  },
  inlineLinkText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-600",
    textDecorationLine: "underline",
  },
  linkMeta: {
    flexShrink: 1,
    minWidth: 0,
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  linkDescription: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x1,
  },
  linkFailedText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x1,
  },
  linkPreview: {
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    marginTop: huddleSpacing.x2,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  linkPreviewBody: {
    backgroundColor: huddleColors.canvas,
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
  linkPreviewRemoveButton: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: huddleSpacing.x2,
    top: huddleSpacing.x2,
    width: 30,
    zIndex: 2,
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
    gap: huddleSpacing.x1,
    marginTop: huddleSpacing.x1,
    minHeight: huddleSpacing.x6,
  },
  mapLinkText: {
    flexShrink: 1,
    minWidth: 0,
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: huddleSocial.mapLinkFontSize,
    lineHeight: huddleType.labelLine,
    textDecorationLine: "underline",
  },
  // Same metrics as mapLinkText so the row does not shift when a pin stops being
  // openable -- only the colour and the underline go away.
  mapLinkPlainText: {
    flexShrink: 1,
    minWidth: 0,
    color: huddleColors.subtext,
    fontFamily: "Urbanist-600",
    fontSize: huddleSocial.mapLinkFontSize,
    lineHeight: huddleType.labelLine,
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
  mediaImagePending: {
    opacity: 0,
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
  },
  searchInput: {
    color: huddleColors.text,
    flex: 1,
    flexShrink: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    height: 42,
    lineHeight: huddleType.labelLine,
    minWidth: 0,
    padding: 0,
    overflow: "hidden",
  },
  searchSortRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  searchSortReveal: {
    overflow: "hidden",
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
  heartPopAnchor: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
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
    top: huddleSocial.feedTopInset + huddleSpacing.x10,
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
    backgroundColor: huddleColors.glassControl,
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
  tagPill_found: {
    alignItems: "center",
    backgroundColor: huddleColors.success,
    borderColor: huddleColors.success,
    flexDirection: "row",
    gap: huddleSpacing.x1,
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
    paddingLeft: huddleSpacing.x4,
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
  tabUnderlineSlider: {
    backgroundColor: huddleColors.blue,
    borderRadius: huddleSocial.topicTabIndicatorRadius,
    bottom: huddleSpacing.x1,
    height: huddleSocial.topicTabIndicatorHeight,
    left: 0,
    position: "absolute",
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
