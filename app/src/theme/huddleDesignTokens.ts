export const huddleColors = {
  blue: "#2145CF",
  blueLight: "#3A5FE8",
  blueSoft: "#EBF5FF",
  // Onboarding hero photo scrim — brand-blue (#2145CF) wash over the welcome
  // image, mirroring the brand-web About hero treatment so white/coral display
  // text stays legible over a real photo.
  heroOverlayStrong: "rgba(33, 69, 207, 0.94)",
  heroOverlaySoft: "rgba(33, 69, 207, 0.62)",
  coral: "#FF751F",
  lime: "#BFFF00",
  subscriptionAddonLime: "#7CFF6B",
  premiumGold: "#CFAB21",
  premiumGoldSoft: "#FFF9E6",
  tierBadgeGold: "#CFAB21",
  tierBadgePlus: "#FF7F50",
  validationSoft: "rgba(239,68,68,0.10)",
  text: "#424965",
  subtext: "#4A4A4A",
  mutedText: "rgba(74, 73, 101, 0.55)",
  canvas: "#FFFFFF",
  mutedCanvas: "#F3F4F6",
  validationRed: "#EF4444",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.12)",
  emergency: "#F97316",
  alertLost: "#EF4444",
  alertStray: "#FACC15",
  alertOther: "#A1A4A9",
  textOnAlertStray: "#000000",
  glassBorder: "rgba(255, 255, 255, 0.55)",
  divider: "rgba(66, 73, 101, 0.06)",
  neutralShadow: "rgba(163, 168, 190, 0.28)",
  glassShadow: "rgba(0, 87, 255, 0.13)",
  glassChrome: "rgba(255, 255, 255, 0.86)",
  glassControl: "rgba(255, 255, 255, 0.50)",
  glassOverlay: "rgba(255, 255, 255, 0.94)",
  matchComposerGlass: "rgba(255,255,255,0.80)",
  membershipUpgradeBorder: "rgba(255,255,255,0.88)",
  membershipUpgradePlus: "#5BA4F5",
  membershipUpgradeGold: "#FF6452",
  membershipUpgradeTextSoft: "rgba(255,255,255,0.80)",
  membershipUpgradeTextMuted: "rgba(255,255,255,0.75)",
  membershipUpgradeTextFaint: "rgba(255,255,255,0.65)",
  membershipUpgradeDivider: "rgba(255,255,255,0.28)",
  backdrop: "rgba(20, 24, 38, 0.28)",
  chatEditScrim: "rgba(255, 255, 255, 0.30)",
  iconMuted: "rgba(66, 73, 101, 0.82)",
  iconSubtle: "rgba(66, 73, 101, 0.45)",
  caption: "rgba(66, 73, 101, 0.72)",
  tabActive: "rgba(66, 73, 101, 0.22)",
  fieldBorder: "rgba(66, 73, 101, 0.16)",
  fieldBorderStrong: "rgba(66, 73, 101, 0.28)",
  fieldBorderSoft: "rgba(66, 73, 101, 0.12)",
  fieldFocusBorder: "rgba(33,69,207,0.38)",
  fieldFocusRing: "rgba(33,69,207,0.16)",
  fieldErrorBorder: "rgba(232,69,69,0.42)",
  fieldErrorRing: "rgba(232,69,69,0.14)",
  fieldInnerHighlight: "rgba(255,255,255,0.80)",
  photoBorder: "rgba(66, 73, 101, 0.18)",
  cardBorderSoft: "rgba(66, 73, 101, 0.04)",
  sectionDividerStrong: "rgba(66, 73, 101, 0.10)",
  primarySoftFill: "rgba(33, 69, 207, 0.09)",
  coralSoftFill: "rgba(255, 117, 31, 0.12)",
  toggleOff: "rgba(255, 255, 255, 0.72)",
  onPrimary: "#FFFFFF",
  profileHeroScrimStart: "rgba(20, 24, 38, 0.78)",
  profileHeroScrimMid: "rgba(20, 24, 38, 0.38)",
  profileHeroScrimEnd: "rgba(20, 24, 38, 0)",
  profileCaptionOverlay: "rgba(33,69,207,0.60)",
  profileCaptionPlaceholder: "rgba(255,255,255,0.72)",
  profileNameShadow: "rgba(0,0,0,0.24)",
  profileHeroRoleBorder: "rgba(33,69,207,0.28)",
  profileHeroTierBorder: "rgba(255,255,255,0.35)",
  profileHeroTierFill: "rgba(255,255,255,0.18)",
  profileHeroGoldBorder: "rgba(207,171,33,0.30)",
  profileHeroPlusBorder: "#FF7F50",
  profileHeroPlusFill: "#FF7F50",
  profilePhotoScrimStart: "rgba(0, 0, 0, 0.55)",
  profilePhotoScrimEnd: "rgba(0, 0, 0, 0)",
  verifyCameraScrim: "rgba(16, 24, 39, 0.52)",
  verifyCameraBaseRing: "rgba(255,255,255,0.22)",
  verifyCameraFallback: "#101827",
  profilePackCanvas: "#EEF0F5",
  photoSlotEmptyStart: "#FBFBFF",
  photoSlotEmptyEnd: "#FFFFFF",
  polaroidFrame: "#F0F0F0",
};

export const huddleFieldStates = {
  focused: {
    borderColor: huddleColors.fieldFocusBorder,
    borderWidth: 1,
    shadowColor: huddleColors.fieldFocusRing,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  error: {
    borderColor: huddleColors.fieldErrorBorder,
    borderWidth: 1,
    shadowColor: huddleColors.fieldErrorRing,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
} as const;

export const huddleFormFields = {
  background: huddleColors.canvas,
  labelSize: 11,
  labelLine: 15,
  valueSize: 16,
  valueLine: 22,
  errorSize: 14,
  errorLine: 20,
  compactLabelSize: 10,
  compactLabelLine: 13,
  compactFieldHeight: 36,
  compactRadius: 12,
  shadowRadius: 5,
  shadowOffset: 2,
  shadowOpacity: 0.8,
  // All app-owned multiline editors stop growing at this shared three-line-plus
  // surface and scroll internally so text never displaces adjacent controls.
  multilineHeight: 156,
} as const;

export const huddleRadii = {
  button: 14,
  card: 12,
  field: 14,
  glass: 20,
  sheet: 28,
  modal: 28,
  pill: 9999,
};

export const huddleSpacing = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 24,
  x6: 32,
  x7: 40,
  x8: 48,
  x9: 64,
  x10: 80,
};

export const huddleLayout = {
  headerHeight: 56,
  navHeight: 64,
  ctaHeight: 56,
  fieldHeight: 52,
  minTouch: 44,
};

export const huddleLayers = {
  modalBackdrop: 20,
  nestedBackdrop: 10,
  nestedModal: 30,
  coachMark: 1800,
} as const;

export const huddleType = {
  nativeHeaderTitle: 22,
  nativeHeaderTitleLine: 25,
  h1: 28,
  h1Line: 34,
  h2: 24,
  h2Line: 30,
  h3: 20,
  h3Line: 26,
  h4: 18,
  h4Line: 24,
  body: 16,
  label: 14,
  labelLine: 20,
  helper: 12,
  helperLine: 16,
  meta: 10,
  metaLine: 14,
  lineTight: 1.1,
  lineSnug: 1.25,
  lineNormal: 1.5,
};

export const huddleShadows = {
  glassElevation1: {
    shadowColor: "#0057FF",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  glassElevation2: {
    shadowColor: "#0057FF",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  glassHeader: {
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryButton: {
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  photoControl: {
    shadowColor: huddleColors.text,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  polaroidFrame: {
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  polaroidBadge: {
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  polaroidPrice: {
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dropdownMenu: {
    shadowColor: "#000000",
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

// Shared neutral surface for secondary controls and inactive toggles. It keeps
// controls visually light without introducing solid grey or light-blue fills.
export const huddleGlassControls = {
  toggleSurface: {
    borderWidth: 0.5,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.glassControl,
    ...huddleShadows.glassElevation1,
  },
  surface: {
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassControl,
    ...huddleShadows.glassElevation1,
  },
  borderlessSurface: {
    borderWidth: 0,
    backgroundColor: huddleColors.glassControl,
    ...huddleShadows.glassElevation1,
  },
} as const;

export const huddleButtons = {
  base: {
    minHeight: 48,
    borderRadius: huddleRadii.button,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 22,
  },
  label: {
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 20,
  },
  primary: {
    backgroundColor: huddleColors.blue,
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  secondary: {
    backgroundColor: huddleColors.mutedCanvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 5, height: 5 },
    elevation: 2,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "rgba(33,69,207,0.35)",
  },
  gold: {
    backgroundColor: huddleColors.premiumGold,
    shadowColor: huddleColors.premiumGold,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  destructive: {
    backgroundColor: huddleColors.validationRed,
    shadowColor: huddleColors.validationRed,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
} as const;

export const huddlePolaroid = {
  selectionWidth: 170,
  selectionBorderWidth: 2,
  selectionPlaceholderIconSize: 30,
  selectionCheckIconSize: 14,
  addIconSize: 22,
  addBorderWidth: 1,
  addLabelMaxWidth: "82%",
  frame: {
    aspectRatio: 4 / 5,
    radius: 4,
    backgroundColor: huddleColors.polaroidFrame,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  photo: {
    // 90% card width over 64% of a 4:5 card height.
    aspectRatio: 9 / 8,
    top: "5%",
    left: "5%",
    right: "5%",
    bottom: "31%",
    radius: 2,
  },
  badge: {
    size: 26,
    top: "2%",
    left: "2%",
    shadowColor: huddleColors.text,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  caption: {
    top: "69%",
    nameSize: 15,
    nameLine: 18,
    serviceSize: 12,
    serviceLine: 16,
  },
  detail: {
    photoBottom: "24%",
    captionTop: "76%",
    badgeSize: 32,
    badgeTop: "7%",
    badgeLeft: "7%",
    nameSize: 24,
    nameLine: 29,
    serviceSize: 14,
    serviceLine: 18,
    priceMetaSize: 11,
    priceMetaLine: 11,
    priceValueSize: 20,
    priceValueLine: 20,
  },
} as const;

// The full Family indicator cannot fit inside the fixed icon puck. This shared
// text badge keeps the established polaroid badge height/type/shadow treatment.
export const huddleFamilyPet = {
  badgeHeight: huddlePolaroid.badge.size,
  badgeMaxWidth: 144,
  badgeFontFamily: "Urbanist-600",
  badgeFontSize: huddleType.meta,
  badgeLineHeight: huddleType.metaLine,
} as const;

// Shared feedback glass. NativeToast established this exact light-blur and
// system-blue wash; coach marks reuse it so feedback surfaces do not drift into
// a second glass recipe.
export const huddleFeedbackGlass = {
  blurAmount: 24,
  reducedTransparencyFallbackColor: huddleColors.glassOverlay,
  systemWash: ["rgba(33,69,207,0.26)", "rgba(33,69,207,0.07)"] as const,
} as const;

// Coach-mark spotlight. Editorial copy sits directly on the shared feedback
// veil; no page-local card or panel is introduced.
export const huddleCoachMark = {
  blockLeft: huddleSpacing.x5,
  blockRight: huddleSpacing.x7,
  ruleWidth: 26,
  ruleHeight: 2,
  kickerLetterSpacing: 1.6,
  dashWidth: 14,
  dashHeight: 2,
  // Type is dark, because the veil is light glass.
  dashIdle: huddleColors.fieldBorderStrong,
  dashActive: huddleColors.text,
  kickerColor: huddleColors.mutedText,
  bodyColor: huddleColors.subtext,
  hintColor: huddleColors.mutedText,
  // Real clearance either side of the target — a bare fit check let the block
  // land 8pt from the footer, which is what pushed Discover's text into it.
  placementMargin: huddleSpacing.x6,
  // Swipe guide motion. Arrow geometry comes from the approved reference asset;
  // the guide begins lower and nearer the card centre, then turns outward toward
  // the existing Pass/Wave controls like the real card gesture.
  swipeGuideOpacity: 0.8,
  swipeGestureTravelX: huddleSpacing.x8,
  swipeGestureTravelY: huddleSpacing.x7,
  swipeGestureMidTravelX: huddleSpacing.x4,
  swipeGestureMidTravelY: huddleSpacing.x1,
  swipeGestureEndLift: huddleSpacing.x1,
  swipeGestureMidProgress: 0.58,
  swipeGestureReducedMotionProgress: 0.7,
  swipeGestureStartRotation: 45,
  swipeGestureMidRotation: 8,
  swipeGestureEndRotation: 4,
  swipeIconSize: 60,
  swipeGlyphSize: 22,
  // These exactly mirror Discover's pass and primary action treatments.
  passSurface: "rgba(17,24,39,0.18)",
  passBorder: "rgba(255,255,255,0.40)",
  waveSurface: huddleColors.blue,
  waveBorder: huddleColors.blue,
} as const;

export const huddleFamilyAccount = {
  searchResultsMaxHeight: 220,
  featureCheckSize: huddleType.h4,
  featureCheckIconSize: huddleType.meta,
  headerIconSize: huddleType.h4,
  rowActionIconSize: 17,
  inviteIconSize: 15,
} as const;

export const huddleCareUpdate = {
  polaroidWidth: 188,
  polaroidCaptionPadding: huddleSpacing.x2,
  polaroidMinWidth: 136,
  subjectLabelMinWidth: 148,
  subjectScrollMaxHeight: 172,
  subjectOptionMinHeight: 34,
  subjectRadioSize: 18,
  subjectRadioDotSize: huddleSpacing.x2,
  actionCircleSize: huddleSpacing.x8,
  retakeButtonSize: 32,
  stampLogoWidth: 116,
  stampLogoHeight: 38,
} as const;

export const huddleToggle = {
  trackWidth: 42,
  visibilityTrackWidth: 58,
  trackHeight: 26,
  trackPaddingHorizontal: 3,
  thumbSize: 20,
  visibilityIconLeft: 9,
} as const;

export const huddleProfilePhotoSlots = {
  progressSize: 36,
  progressTextSize: 11,
  railGap: 6,
  screenReaderSize: 1,
  slotWidth: 286,
  emptyIconSize: 56,
} as const;

export const huddleProfilePhotoCropper = {
  maxFrameWidth: 360,
  frameMaxViewportRatio: 0.58,
  zoomButtonSize: 44,
  zoomStep: 0.12,
  accessibilityPanStep: 18,
  accessibilityRotationStep: 5,
  minZoom: 1,
  maxZoom: 3,
  cropGridLineWidth: 1,
  imageFade: 120,
} as const;

/** Pet portrait and Home-card presentation are deliberately separate crops.
 * The Home crop is the one longer treatment used only for pet cards. */
export const huddlePetPhoto = {
  bannerAspect: 5 / 4,
  bannerHorizontalMargin: huddleSpacing.x5,
  bannerMinWidth: 280,
} as const;

export const huddleNativeChrome = {
  headerZIndex: 20,
  headerSideSlot: 40,
  headerBackButton: 40,
  headerIcon: 24,
  backChevronWidth: 9,
  backShaftWidth: 13,
  backStrokeWidth: 2,
  backStrokeRadius: 2,
};

export const huddleFormControls = {
  select: {
    menuMaxHeight: 220,
    menuPadding: huddleSpacing.x2,
    menuRadius: 14,
    menuBorderColor: "rgba(66,73,101,0.10)",
    optionMinHeight: 38,
    optionRadius: 10,
    optionPaddingHorizontal: huddleSpacing.x3,
    optionPaddingVertical: huddleSpacing.x2,
    checkSlot: 14,
  },
  datePicker: {
    columnMaxHeight: 200,
    columnRadius: huddleRadii.field,
    columnGap: huddleSpacing.x2,
    columnPadding: huddleSpacing.x3,
    optionMinHeight: 38,
    optionRadius: huddleRadii.field,
  },
} as const;

// Mirrors `--dur-*` and `--ease-*` from app/huddle Design System/colors_and_type.css.
// Single source of truth for native motion timings; consumers must not hardcode durations
// or easing curves in screen files. Easings are stored as cubic-bezier coefficients so
// they can be passed to any animation runtime (Reanimated, Animated, CSS-equivalent).
export const huddleMotion = {
  durations: {
    micro: 75,
    fast: 150,
    base: 200,
    slow: 300,
    enter: 350,
    coachMarkSwipe: 1200,
  },
  easings: {
    out: [0.22, 1.0, 0.36, 1.0],
    standard: [0.4, 0.0, 0.2, 1.0],
    in: [0.55, 0.0, 1.0, 0.45],
  },
} as const;

// Semantic haptic intent names. Page code references these intents only;
// the actual haptic library mapping lives in app/src/lib/nativeHaptics.ts.
// Intents picked so swap of haptic backend never requires per-screen edits.
export const huddleHaptics = {
  selectTab: "selection",
  toggleControl: "selection",
  primaryConfirm: "impact-medium",
  destructive: "impact-heavy",
  success: "notification-success",
  error: "notification-error",
} as const;

// Default props for `expo-image` callsites. Spread these first, then override only
// what differs (e.g. `priority="high"` on hero, `priority="low"` on list thumbnails).
// `transition` reuses the shared motion contract above so fade-in matches motion tokens.
export const huddleImageDefaults = {
  transition: huddleMotion.durations.fast,
  cachePolicy: "memory-disk",
  contentFit: "cover",
} as const;

export const huddleSocial = {
  avatarSize: 40,
  avatarBorderWidth: 1.5,
  actionIconSize: 16,
  actionButtonSize: huddleSpacing.x6,
  actionClusterMinWidth: 136,
  actionClusterGap: 2,
  actionBadgeMinWidth: 14,
  replyAvatarSize: 36,
  replyRailColumnWidth: 40,
  replyRailOffset: 18,
  replyRailColor: "rgba(74,73,101,0.14)",
  replyRailDotColor: "#C6CAD6",
  replyRailWidth: 1,
  replyRailDotSize: 10,
  replyRailDotTop: 25,
  replyRailLastSiblingHeight: 28,
  replyChildRailTop: 44,
  replyComposerIndentStep: 24,
  replyComposerMaxIndent: 48,
  replyComposerLeftInset: 4,
  replyComposerOuterInset: 8,
  replyComposerRadius: 22,
  replyComposerMinHeight: 56,
  replyComposerControlSize: 32,
  replyComposerControlsMarginTop: 6,
  commentComposerSnapOffset: 280,
  commentComposerSnapFallbackItemHeight: 360,
  topActionsReservedWidth: 76,
  authorVerifiedIconSize: 13,
  mapIconSize: 14,
  mapLinkFontSize: 13,
  composeFabSize: 56,
  feedTopInset: 0,
  mediaHeight: 260,
  mediaWidth: 292,
  mediaFrameAspectRatio: 1,
  mediaVerticalFrameAspectRatio: 0.8,
  mediaPeekRatio: 0.82,
  mediaPeekWidth: 56,
  sensitiveBlurRadius: 100,
  carouselButtonSize: 28,
  carouselDotSize: 6,
  carouselActiveDotWidth: 16,
  topicTabIndicatorWidth: 20,
  topicTabIndicatorHeight: 2,
  topicTabIndicatorRadius: 2,
  videoBadgeSize: 48,
  videoBadgeOffset: -24,
  emptyAssetWidth: 320,
  emptyAssetHeight: 213,
  chipFontSize: 13,
  tagFontSize: 11,
  tagPaddingVertical: 2,
  linkTitleSize: huddleFormFields.valueSize,
  linkPreviewImageHeight: 176,
  emptyTextSize: huddleFormFields.valueSize,
  emptyTextLineHeight: 22,
  topicTabRowHeight: 32,
  contentCollapsedLines: 5,
  // Total height of NativeSocialFilterBar's rendered block (filterBlock in
  // NativeSocialFeedPrimitives.tsx): topicTabRowHeight (32) + filterBlock's gap
  // (huddleSpacing.x2 = 8) + the search/sort row (huddleLayout.minTouch = 44) +
  // filterBlock's paddingBottom (huddleSpacing.x2 = 8) = 92. Used by RootNavigator
  // to keep the left-edge notification-swipe catcher below Social's own filter
  // bar instead of overlapping it. If NativeSocialFilterBar's layout changes,
  // update this alongside it.
  filterBarHeight: 92,
} as const;

export const huddleMapBroadcastFooter = {
  cameraButtonBackground: huddleColors.divider,
  cameraButtonBorderColor: huddleColors.fieldBorder,
  cameraButtonSize: 40,
  ctaHeight: 48,
  ctaRadius: 12,
  gap: huddleSpacing.x3,
  horizontalPadding: huddleSpacing.x6,
  topPadding: huddleSpacing.x3,
  bottomPadding: huddleSpacing.x6,
} as const;

export const huddleMap = {
  marker: {
    alertStray: "#EAB308",
    alertLost: huddleColors.validationRed,
    // Caution is intentionally neutral so it does not read as friend presence.
    alertCaution: huddleColors.alertOther,
    alertOthers: "#A1A4A9",
    ownPin: "#A6D539",
    ownPinRetained: "rgba(33,69,207,0.72)",
    friendVerified: huddleColors.blue,
    friendUnverified: "#C9CEDA",
    friendCompressedVerified: "#E6EEFF",
    friendCompressedUnverified: "#E3E7EF",
    friendBadgeFill: "#EEF2F8",
    friendBadgeText: "#5C6474",
  },
  size: {
    alertActive: 40,
    alertExpired: 12,
    userPin: 44,
    userPinCompressed: 32,
    userPinOverview: 24,
    userPinInnerInset: 4,
    userPinCompressedInnerInset: 2,
    alertTipWidth: 8,
    alertTipHeight: 12,
  },
} as const;


export const huddleVerifyIdentity = {
  headerIconSize: 22,
  cardIconSize: 22,
  faceIconSize: 34,
  panelIconSize: 28,
  backButtonWidth: 44,
  illustrationWidth: 236,
  illustrationHeight: 188,
  introMaxWidth: 360,
  cardHeaderMinHeight: 52,
  statusMinHeight: 32,
  actionMinHeight: 48,
  actionRadius: huddleRadii.button,
  actionLabelSize: 14,
  actionLabelLine: 18,
  pendingMinHeight: 48,
  verifiedSummaryMinHeight: 88,
  cameraHeaderMinHeight: 64,
  cameraFrameWidth: 340,
  cameraFrameHeight: 440,
  cameraRingWidth: 260,
  cameraRingHeight: 320,
  cameraRingBorderWidth: 2,
  cameraOvalWidth: 210,
  cameraOvalHeight: 260,
  humanOvalWidth: 230,
  humanOvalHeight: 310,
  humanOvalBorderWidth: 5,
  humanOvalRadius: 120,
  humanOvalScrimWidth: 320,
  faceOvalBorderWidth: 2,
  cameraHintMinHeight: 52,
  cameraStatusMinHeight: 42,
} as const;
