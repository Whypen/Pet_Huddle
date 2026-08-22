import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SettingsAvatar } from "@/components/layout/SettingsAvatar";
import { LegalContent, type LegalType } from "@/components/legal/LegalContent";
import { HuddleWordmark } from "@/components/brand/HuddleWordmark";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuControl } from "@/components/ui/NeuControl";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useTurnstile } from "@/hooks/useTurnstile";
import { authChangePassword } from "@/lib/publicAuthApi";
import { passwordPolicyError } from "@/lib/passwordStrength";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MyHuddleCodeDialog = lazy(() => import("@/components/layout/HuddleCodeDialogs").then((module) => ({ default: module.MyHuddleCodeDialog })));
const AddFriendDialog = lazy(() => import("@/components/layout/HuddleCodeDialogs").then((module) => ({ default: module.AddFriendDialog })));

const LEGAL_DOCUMENTS: Array<{ type: LegalType; label: string }> = [
  { type: "privacy", label: "Privacy Policy" },
  { type: "terms", label: "Terms of Service" },
  { type: "community-guidelines", label: "Community Guidelines" },
  { type: "privacy-choices", label: "Privacy Choices" },
  { type: "collection-notice", label: "Personal Information Collection Notice" },
  { type: "cookies", label: "Cookies and Similar Technologies Notice" },
];

type Section = "profile" | "account" | "visibility" | "membership" | "protection";

const ActionRow = ({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[14px] font-semibold text-brandText transition hover:bg-muted/55 active:scale-[0.985] focus-visible:bg-muted/55 focus-visible:outline-none">
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {value ? <span className="mr-1 text-[13px] font-medium text-muted-foreground">{value}</span> : null}
    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
  </button>
);

const SectionButton = ({ label, value, open, onClick }: { label: string; value?: string; open: boolean; onClick: () => void }) => (
  <button type="button" aria-expanded={open} onClick={onClick} className="flex h-12 w-full items-center rounded-xl px-3 text-left text-[15px] text-brandText transition hover:bg-muted/55 active:scale-[0.985] focus-visible:bg-muted/55 focus-visible:outline-none">
    <span className={cn("min-w-0 flex-1 truncate font-semibold", open && "font-extrabold")}>{label}</span>
    {value ? <span className="mr-1 text-[14px] font-medium text-muted-foreground">{value}</span> : null}
    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
  </button>
);

export interface SettingsMenuProps {
  displayName: string;
  avatarUrl?: string | null;
  socialId?: string | null;
  accountEmail?: string | null;
  isVerified?: boolean;
  tierLabel?: string;
  nonSocial?: boolean;
  hideFromMap?: boolean;
  onVisibilityChange?: (next: { nonSocial: boolean; hideFromMap: boolean }) => void | Promise<void>;
  onLogout: () => void;
  onEditProfile?: () => void;
  onHelp?: () => void;
  triggerContent?: React.ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  initialView?: "main" | "profile";
  onManageMembership?: () => void;
}

export const SettingsMenu = ({
  displayName,
  avatarUrl,
  socialId,
  accountEmail,
  isVerified = false,
  tierLabel = "Free",
  nonSocial = false,
  hideFromMap = false,
  onVisibilityChange,
  onLogout,
  onEditProfile,
  onHelp,
  triggerContent,
  triggerClassName,
  triggerAriaLabel = "Settings",
  initialView = "main",
  onManageMembership,
}: SettingsMenuProps) => {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section | null>(initialView === "profile" ? "profile" : null);
  const [query, setQuery] = useState("");
  const [legalType, setLegalType] = useState<LegalType | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const changePasswordTurnstile = useTurnstile("change_password");

  useEffect(() => {
    if (!open) {
      setSection(initialView === "profile" ? "profile" : null);
      setQuery("");
      setLegalType(null);
      setPasswordOpen(false);
      setDeleteOpen(false);
    }
  }, [initialView, open]);

  const closeThen = (action?: () => void) => {
    setOpen(false);
    action?.();
  };
  const toggle = (next: Section) => setSection((current) => current === next ? null : next);
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return [
      { label: "Edit profile", action: () => closeThen(onEditProfile) },
      { label: "My huddle Code", action: () => { setOpen(false); setCodeOpen(true); } },
      { label: "Add a Friend", action: () => { setOpen(false); setAddFriendOpen(true); } },
      { label: "Change password", action: () => { setSection("account"); setPasswordOpen(true); setDeleteOpen(false); setQuery(""); } },
      { label: "Delete account", action: () => { setSection("account"); setDeleteOpen(true); setPasswordOpen(false); setQuery(""); } },
      { label: "Manage membership", action: () => closeThen(onManageMembership) },
      { label: "Get help", action: () => closeThen(onHelp) },
      ...LEGAL_DOCUMENTS.map((document) => ({ label: document.label, action: () => { setSection("protection"); setLegalType(document.type); setQuery(""); } })),
    ].filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, onEditProfile, onHelp, onManageMembership]);

  const submitPasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }
    const token = changePasswordTurnstile.getToken();
    if (!token || !changePasswordTurnstile.isTokenUsable) {
      toast.error("Complete human verification first.");
      return;
    }
    setBusy(true);
    const { error } = await authChangePassword({ password: newPassword, turnstile_token: token, turnstile_action: "change_password" });
    setBusy(false);
    changePasswordTurnstile.reset();
    if (error) {
      toast.error(error.message || "We couldn't update your password. Please retry.");
      return;
    }
    setPasswordOpen(false);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated.");
  };

  const submitDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Your session expired. Please sign in again.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.functions.invoke("delete-account", { body: {}, headers: { Authorization: `Bearer ${session.access_token}` } });
    setBusy(false);
    if (error) {
      toast.error("We couldn't delete your account. Please retry.");
      return;
    }
    await supabase.auth.signOut();
    window.location.assign("/join");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" aria-label={triggerAriaLabel} className={triggerClassName || "rounded-full transition-opacity hover:opacity-80 focus-visible:bg-muted/55 focus-visible:outline-none"}>
          {triggerContent ?? <SettingsAvatar displayName={displayName} avatarUrl={avatarUrl} isVerified={isVerified} size={34} showVerifiedBadge={false} />}
        </button>
      </SheetTrigger>

      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        onEscapeKeyDown={(event) => {
          if (legalType) { event.preventDefault(); setLegalType(null); return; }
          if (passwordOpen) { event.preventDefault(); setPasswordOpen(false); return; }
          if (deleteOpen) { event.preventDefault(); setDeleteOpen(false); return; }
          if (section) { event.preventDefault(); setSection(null); }
        }}
        className={cn(
          "z-[8601] flex overflow-hidden border-border/60 bg-background/95 p-0 backdrop-blur-xl",
          isDesktop ? "h-full w-[min(380px,calc(100vw-16px))] rounded-l-[24px] border-l sm:max-w-[380px]" : "max-h-[88svh] w-full rounded-t-[28px] border-t pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <SheetHeader className="sr-only"><SheetTitle>Settings</SheetTitle><SheetDescription>huddle account and settings</SheetDescription></SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-3 pt-3">
          {!isDesktop ? <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted-foreground/30" aria-hidden /> : null}

          <button type="button" aria-expanded={section === "profile"} onClick={() => toggle("profile")} className="flex min-h-[68px] items-center gap-3 rounded-xl px-3 text-left transition hover:bg-muted/55 focus-visible:bg-muted/55 focus-visible:outline-none">
            <SettingsAvatar displayName={displayName} avatarUrl={avatarUrl} isVerified={isVerified} size={48} />
            <span className="min-w-0 flex-1"><strong className="block truncate text-[17px] font-extrabold text-brandText">{displayName}</strong><span className="block truncate text-[13px] font-semibold text-muted-foreground">{socialId ? `@${socialId.replace(/^@/, "")}` : "huddle member"} · {tierLabel}</span></span>
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", section === "profile" && "rotate-90")} aria-hidden />
          </button>
          <div className="h-px bg-border/60" />

          <label className="relative my-2 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><span className="sr-only">What do you need?</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What do you need?" className="h-10 w-full rounded-xl border-0 bg-muted/40 pl-10 pr-3 text-[15px] font-medium outline-none placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-brandBlue/25" /></label>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {normalizedQuery ? (
              <div>
                {searchResults.map((item) => <ActionRow key={item.label} label={item.label} onClick={item.action} />)}
                {searchResults.length === 0 ? <button type="button" onClick={() => closeThen(onHelp)} className="min-h-11 w-full px-3 text-left text-[14px] font-semibold text-brandBlue">Nothing here matches. Need help?</button> : null}
              </div>
            ) : (
              <>
                {section === "profile" ? <div className="px-3 pb-3"><ActionRow label="My huddle Code" onClick={() => { setOpen(false); setCodeOpen(true); }} /><ActionRow label="Add a Friend" onClick={() => { setOpen(false); setAddFriendOpen(true); }} /><ActionRow label="Edit profile" onClick={() => closeThen(onEditProfile)} /></div> : null}

                <SectionButton label="Your account" open={section === "account"} onClick={() => toggle("account")} />
                {section === "account" ? <div className="px-3 pb-4">
                  <p className="px-3 pb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Signed in as</p>
                  <p className="break-all px-3 pb-2 text-[14px] font-semibold text-brandText">{accountEmail || "huddle member"}</p>
                  {passwordOpen ? <div className="space-y-3 rounded-xl border border-border/70 p-3">
                    <button type="button" onClick={() => setPasswordOpen(false)} className="flex min-h-10 items-center gap-1 text-[13px] font-bold text-muted-foreground"><ChevronRight className="h-4 w-4 rotate-180" />Back</button>
                    <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:ring-2 focus:ring-brandBlue/30" />
                    <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" className="h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:ring-2 focus:ring-brandBlue/30" />
                    <TurnstileWidget siteKeyMissing={changePasswordTurnstile.siteKeyMissing} setContainer={changePasswordTurnstile.setContainer} />
                    <NeuControl size="lg" fullWidth disabled={busy || !newPassword || !confirmPassword || !changePasswordTurnstile.isTokenUsable} onClick={() => void submitPasswordChange()}>Update password</NeuControl>
                  </div> : deleteOpen ? <div className="rounded-xl border border-red-200/70 p-3">
                    <button type="button" onClick={() => setDeleteOpen(false)} className="mb-2 flex min-h-10 items-center gap-1 text-[13px] font-bold text-muted-foreground"><ChevronRight className="h-4 w-4 rotate-180" />Back</button>
                    <p className="mb-4 text-[14px] leading-6 text-muted-foreground">This permanently deletes your huddle account. Type DELETE to confirm.</p>
                    <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder="DELETE" className="mb-3 h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:ring-2 focus:ring-red-400/30" />
                    <NeuControl size="lg" variant="danger" fullWidth disabled={busy || deleteConfirm !== "DELETE"} onClick={() => void submitDeleteAccount()}>Delete account</NeuControl>
                  </div> : <><ActionRow label="Change password" onClick={() => { setPasswordOpen(true); setDeleteOpen(false); }} /><div className="my-1 h-px bg-border/60" /><button type="button" onClick={() => { setDeleteOpen(true); setPasswordOpen(false); }} className="min-h-11 w-full rounded-xl px-3 text-left text-[14px] font-semibold text-muted-foreground transition hover:bg-muted/55 hover:text-red-500">Delete account</button></>}
                </div> : null}

                <SectionButton label="Who can see you" open={section === "visibility"} onClick={() => toggle("visibility")} />
                {section === "visibility" ? <div className="space-y-3 px-6 pb-4 pt-1"><label className="flex min-h-14 items-start gap-3"><span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-brandText">Appear in Discovery</strong><span className="mt-0.5 block text-[13px] font-medium leading-[1.45] text-muted-foreground">Let neighbours find your profile.</span></span><NeuToggle checked={!nonSocial} onCheckedChange={(value) => void onVisibilityChange?.({ nonSocial: !value, hideFromMap })} /></label><label className="flex min-h-14 items-start gap-3"><span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-brandText">Incognito on Map</strong><span className="mt-0.5 block text-[13px] font-medium leading-[1.45] text-muted-foreground">Hide your pin from everyone, including friends.</span></span><NeuToggle checked={hideFromMap} onCheckedChange={(value) => void onVisibilityChange?.({ nonSocial, hideFromMap: value })} /></label></div> : null}

                <SectionButton label="Membership" value={tierLabel} open={section === "membership"} onClick={() => toggle("membership")} />
                {section === "membership" ? <div className="px-3 pb-4"><p className="px-3 pb-2 text-[14px] font-medium text-muted-foreground">{tierLabel === "Free" ? "You're on the free plan." : `You're on ${tierLabel}.`}</p><ActionRow label={tierLabel === "Free" ? "See plans" : "Manage billing"} onClick={() => closeThen(onManageMembership)} /></div> : null}

                <SectionButton label="How huddle protects you" open={section === "protection"} onClick={() => toggle("protection")} />
                {section === "protection" ? <div className="px-3 pb-4"><p className="px-3 pb-2 text-[14px] font-medium leading-6 text-brandText">We protect your account and never show exactly where your pets live.</p><ActionRow label="Get help" onClick={() => closeThen(onHelp)} /><ActionRow label="Report a problem" onClick={() => closeThen(onHelp)} /><p className="px-3 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">The legal detail</p>{LEGAL_DOCUMENTS.map((document) => <ActionRow key={document.type} label={document.label} onClick={() => setLegalType(document.type)} />)}{legalType ? <div className="mt-2 overflow-hidden rounded-xl border border-border"><button type="button" onClick={() => setLegalType(null)} className="flex min-h-11 w-full items-center gap-1 border-b border-border px-3 text-[13px] font-bold text-muted-foreground"><ChevronRight className="h-4 w-4 rotate-180" />Back</button><LegalContent type={legalType} compact /></div> : null}</div> : null}
              </>
            )}
          </div>

          <div className="mt-1 border-t border-border/60 pt-1"><a href="https://huddle.pet" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-xl px-3 no-underline transition hover:bg-muted/55"><HuddleWordmark size={20} /><span className="sr-only">Learn more about huddle</span></a><button type="button" onClick={() => closeThen(onLogout)} className="min-h-11 w-full rounded-xl px-3 text-left text-[15px] font-semibold text-brandText transition hover:bg-muted/55 hover:text-red-500">Log out</button></div>
        </div>
      </SheetContent>

      <Suspense fallback={null}>{codeOpen ? <MyHuddleCodeDialog open onOpenChange={setCodeOpen} onAddFriend={() => setAddFriendOpen(true)} /> : null}{addFriendOpen ? <AddFriendDialog open onOpenChange={setAddFriendOpen} /> : null}</Suspense>

    </Sheet>
  );
};

export default SettingsMenu;
