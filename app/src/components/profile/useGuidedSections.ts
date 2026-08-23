import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutAnimation, Platform, UIManager } from "react-native";
import { isReduceMotionActive } from "../../lib/nativeReduceMotion";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Smooth, understated expand/collapse: ~200ms ease, body fades as it grows.
// Honors Reduce Motion — sections then open/close instantly with no transition.
const animateSectionLayout = () => {
  if (isReduceMotionActive()) return;
  LayoutAnimation.configureNext(
    LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
  );
};

// Guided accordion controller shared by the profile / set-pet / carer forms so
// they behave identically in every mode (onboarding and edit).
//
// Behaviour:
//   • Opens the first INCOMPLETE section, and auto-follows forward as sections
//     become complete — completing the open section moves "first incomplete"
//     to the next one, which opens in place (no auto-scroll). This also rides
//     out async data hydration without ever firing a false advance.
//   • The moment the user manually opens a section (taps a header), auto-follow
//     stops — they navigate freely and are never yanked.
//   • A fully complete form just opens the first section, calm.
//   • Every open/close animates (LayoutAnimation), and `progress` (0–1) reports
//     completion for a slim top progress bar.
//
// `flow` is the ordered section titles; `isComplete(title)` reports per-section
// completion from current form state.
export function useGuidedSections(flow: string[], isComplete: (title: string) => boolean) {
  const [openSection, setOpenSection] = useState<string>(flow[0] ?? "");
  const userTookControlRef = useRef(false);

  const completedCount = flow.reduce((count, title) => (isComplete(title) ? count + 1 : count), 0);
  const progress = flow.length > 0 ? completedCount / flow.length : 0;
  const firstIncomplete = flow.find((title) => !isComplete(title));

  useEffect(() => {
    if (userTookControlRef.current) return;
    const next = firstIncomplete ?? flow[0] ?? "";
    setOpenSection((current) => {
      if (current === next) return current;
      animateSectionLayout();
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstIncomplete]);

  // Header tap: collapse if already open, otherwise open — and hand control to
  // the user so auto-follow no longer moves the open section.
  const toggleSection = useCallback((title: string) => {
    userTookControlRef.current = true;
    animateSectionLayout();
    setOpenSection((current) => (current === title ? "" : title));
  }, []);

  // Programmatic force-open (e.g. scroll-to-error) — opens and takes control so
  // the error section is never immediately moved away from.
  const openSectionManually = useCallback((title: string) => {
    userTookControlRef.current = true;
    animateSectionLayout();
    setOpenSection(title);
  }, []);

  return { openSection, toggleSection, openSectionManually, progress };
}
