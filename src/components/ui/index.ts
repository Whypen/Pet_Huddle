/**
 * components/ui/index.ts — UI CONTRACT v6.1 exports
 *
 * Canonical primitive: NeuControl (Section 6).
 * All button/control rendering flows through NeuControl.
 *
 * Import: import { NeuControl } from '@/components/ui'
 *
 * Legacy shims: Button (v3 shim) and NeuButton still importable from
 * their own files for backward-compat during migration (RULE 3 C5).
 */

// ── CANONICAL — NeuControl (Section 6) ─────────────────────────────────────
export { NeuControl, neuControlVariants } from "./NeuControl";
export type { NeuControlProps, NeuControlVariant, NeuControlSize, NeuControlTier } from "./NeuControl";

// ── Section 7 — FormField anatomy ──────────────────────────────────────────
export { FormField, FormTextArea }    from "./FormField";
export type { FormFieldProps, FormTextAreaProps } from "./FormField";
export { FormFieldOtp }               from "./FormFieldOtp";
export type { FormFieldOtpProps }     from "./FormFieldOtp";
export { NeuDropdown }                from "./NeuDropdown";
export type { NeuDropdownProps, NeuDropdownOption } from "./NeuDropdown";

// ── Section 6 controls ──────────────────────────────────────────────────────
export { NeuCheckbox }                from "./NeuCheckbox";
export type { NeuCheckboxProps }      from "./NeuCheckbox";
export { NeuToggle }                  from "./NeuToggle";
export type { NeuToggleProps }        from "./NeuToggle";
export { NeuSlider }                  from "./NeuSlider";
export type { NeuSliderProps }        from "./NeuSlider";

// ── Settings anatomy (T5) ───────────────────────────────────────────────────
export { InsetPanel, InsetDivider, InsetRow } from "./InsetPanel";
export type { InsetPanelProps, InsetRowProps, InsetRowVariant } from "./InsetPanel";

// ── State templates ─────────────────────────────────────────────────────────
export { EmptyStateCard }             from "./EmptyStateCard";
export type { EmptyStateCardProps }   from "./EmptyStateCard";
export { PageErrorState }             from "./PageErrorState";
export type { PageErrorStateProps }   from "./PageErrorState";

// ── Existing primitives (unchanged) ────────────────────────────────────────
// ── Step 4 — Button (B.2 shim → NeuControl) ───────────────────────────────
export { Button }            from "./v3/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./v3/Button";

// ── Step 5 — GlassCard (B.1) ──────────────────────────────────────────────
export { GlassCard }         from "./v3/GlassCard";
export type { GlassCardProps, GlassLevel } from "./v3/GlassCard";

// ── Step 6 — TextInput + TextArea (B.3) ───────────────────────────────────
export { TextInput, TextArea } from "./v3/TextInput";
export type { TextInputProps, TextAreaProps } from "./v3/TextInput";

// ── Step 7 — IconButton (B.2 IconButton) ──────────────────────────────────
export { IconButton }        from "./v3/IconButton";
export type { IconButtonProps, IconButtonSize } from "./v3/IconButton";

// ── Step 8 — SectionDivider (B.5) ─────────────────────────────────────────
export { SectionDivider }    from "./v3/SectionDivider";
export type { SectionDividerProps, SectionDividerVariant } from "./v3/SectionDivider";

// ── Step 9 — AnimatedUploadButton (B.7) ───────────────────────────────────
export { AnimatedUploadButton } from "./v3/AnimatedUploadButton";
export type { AnimatedUploadButtonProps, UploadState } from "./v3/AnimatedUploadButton";

// ── Step 10 — FilterChip (B.6 / B.9) ─────────────────────────────────────
export { FilterChip }        from "./v3/FilterChip";
export type { FilterChipProps, FilterChipSize } from "./v3/FilterChip";

// ── Step 11 — DrawerSheet (B.4) ───────────────────────────────────────────
export { DrawerSheet, DrawerNavItem, DrawerTierBlock, DrawerDivider } from "./v3/DrawerSheet";
export type { DrawerSheetProps, DrawerNavItemProps, DrawerTierBlockProps } from "./v3/DrawerSheet";

// ── Step 12 — PlanToggle (B.6.1) ──────────────────────────────────────────
export { PlanToggle }        from "./v3/PlanToggle";
export type { PlanToggleProps, BillingPeriod } from "./v3/PlanToggle";
