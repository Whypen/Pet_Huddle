import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = existsSync(join(process.cwd(), "app", "package.json")) ? process.cwd() : join(process.cwd(), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("native Family pet sharing contract", () => {
  it("keeps sharing authority, recipient removal, and membership cleanup server-side", () => {
    const sharingMigration = read("supabase/migrations/20260811113840_native_family_pet_sharing.sql");
    const cleanupMigration = read("supabase/migrations/20260811115618_native_family_pet_membership_cleanup.sql");
    const recipientRemovalMigration = read("supabase/migrations/20260811120552_native_family_pet_recipient_removal.sql");

    expect(sharingMigration).toContain("allow_pet_sharing boolean not null default false");
    expect(sharingMigration).toContain("share_with_family boolean not null default false");
    expect(sharingMigration).toContain("alter table public.family_pet_profiles enable row level security");
    expect(sharingMigration).toContain("pet_sharing_owner_only");
    expect(sharingMigration).toContain("remove_native_family_shared_pet");
    expect(sharingMigration).toContain("added a pet to your profile.");
    expect(sharingMigration).toContain("'/pet-details?id=' || new.id::text");
    expect(cleanupMigration).toContain("cleanup_native_family_pet_profiles_on_membership_end");
    expect(cleanupMigration).toContain("after update of status on public.family_members");
    expect(cleanupMigration).toContain("after delete on public.family_members");
    expect(recipientRemovalMigration).toContain("removed_by_user boolean not null default false");
    expect(recipientRemovalMigration).toContain("where not public.family_pet_profiles.removed_by_user");
    expect(recipientRemovalMigration).toContain("removed_by_user = true");
  });

  it("uses one Family card with the existing modal controls and shared Care carousel", () => {
    const settings = read("app/src/components/NativeSettingsDrawer.tsx");
    const care = read("app/src/screens/NativeServiceChatScreen.tsx");
    const carousel = read("app/src/components/NativePetMultiSelectCarousel.tsx");

    const familySheet = settings.slice(settings.indexOf("function NativeFamilyAccountSheet"), settings.indexOf("const styles = StyleSheet.create"));
    expect(familySheet).not.toContain("<Modal");
    expect(familySheet).toContain("modalPrimitiveStyles.appModalCard");
    expect(familySheet).toContain("FadeInRight.duration(huddleMotion.durations.base)");
    expect(familySheet).toContain("FadeOutLeft.duration(huddleMotion.durations.base)");
    expect(familySheet).toContain("<NativePetMultiSelectCarousel");
    expect(familySheet).toContain("const [sharedPetStepOpen, setSharedPetStepOpen] = useState(false)");
    expect(familySheet).toContain("sharedPetStepOpen && sharedPetCandidates.length > 0");
    expect(familySheet).toContain("<AppModalButton onPress={() => setSharedPetStepOpen(true)} variant=\"secondary\">Add shared pets</AppModalButton>");
    expect(familySheet).toContain("<AppModalToggleRow label=\"Allow pet sharing\"");
    expect(familySheet).toContain("You cannot change it later.");
    expect(familySheet).toContain("Add shared pets");
    expect(care).toContain("function RequestPetCarousel");
    expect(care).toContain("<NativePetMultiSelectCarousel");
    expect(carousel).toContain("huddlePolaroid.selectionWidth");
    expect(carousel).not.toMatch(/size=\{\d+\}/);
  });

  it("keeps the agreed badge, toggle, and local-only removal language exact", () => {
    const badge = read("app/src/components/NativeFamilyPetBadge.tsx");
    const setPet = read("app/src/screens/NativeSetPetScreen.tsx");
    const details = read("app/src/screens/NativePetDetailsScreen.tsx");
    const home = read("app/src/screens/NativeHomeScreen.tsx");

    expect(badge).toContain("Shared with ${displayName}'s family");
    expect(setPet).toContain("Share with family");
    expect(setPet).toContain("Remove from my profile");
    expect(details).toContain("Remove from my profile");
    expect(home).toContain("<NativeFamilyPetBadge displayName={pet.shared_by_display_name}");
  });
});
