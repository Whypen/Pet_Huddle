import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Flow = Readonly<{
  name: string;
  transitions: readonly string[];
  requiredTests: readonly string[];
  requiredBoundaries: readonly string[];
}>;

// This prevents the contract suite from silently losing a critical-flow test.
// It does not imitate remote authorization; deployed RLS and Edge Functions
// remain authoritative and require a separate read-only deployed gate.
const criticalFlows: readonly Flow[] = [
  {
    name: "signup to home",
    transitions: ["identifier", "email verification", "session", "identity", "profile", "location", "home"],
    requiredTests: ["nativeSignupGateContract.test.ts", "signupVerificationSecurityContract.test.ts", "nativeSignupDraftStorage.test.ts", "nativeAuthBootContract.test.ts", "supabaseSecureStorage.test.ts"],
    requiredBoundaries: ["check_identifier_registered", "get-pre-signup-verify-status", "confirm-pre-signup-verify", "complete_native_signup_identity", "complete_native_signup_profile", "mark_native_signup_location"],
  },
  {
    name: "session lifecycle",
    transitions: ["login", "refresh", "logout", "cold restore", "expired session"],
    requiredTests: ["nativeAuthTransport.test.ts", "nativeActionAuthLifecycleContract.test.ts", "nativeAuthRedirect.test.ts", "supabaseSecureStorage.test.ts"],
    requiredBoundaries: ["delete-account"],
  },
  {
    name: "chat block and unmatch",
    transitions: ["match", "message", "retry", "block", "unmatch"],
    requiredTests: ["nativeChatOutbox.test.ts", "nativeChatIdempotencyContract.test.ts", "nativeChatNavigationContracts.test.ts", "nativeChatUnreadContract.test.ts"],
    requiredBoundaries: ["send_match_first_message", "update_native_chat_message_content", "block_user", "unmatch_user_one_sided"],
  },
  {
    name: "map broadcast",
    transitions: ["precision", "broadcast", "recipient visibility", "expiry"],
    requiredTests: ["nativeMapPrecision.test.ts", "nativeMapPrivacyFix.test.ts", "nativeMapMutationsContract.test.ts", "nativeMapAlertInteractionAuthContract.test.ts", "nativeMapBroadcastLocation.test.ts"],
    requiredBoundaries: ["create_alert_thread_and_pin", "get_native_broadcast_reach", "set_native_social_thread_image_metadata"],
  },
  {
    name: "care lifecycle",
    transitions: ["request", "scope", "payment boundary", "cancel", "completion"],
    requiredTests: ["careBookingScopeContract.test.ts", "careExactServiceIdentityContract.test.ts", "carePaymentMovementContract.test.ts", "carePolicyContract.test.ts", "nativeCareUpdates.test.ts"],
    requiredBoundaries: ["send_service_request", "create_care_scope_counterproposal", "create-service-payment", "confirm-service-payment", "cancel-service-booking", "complete_service_if_both_confirmed_by_service_id"],
  },
  {
    name: "private pet media",
    transitions: ["owner read", "care-authorized read", "non-owner denial"],
    requiredTests: ["nativePrivatePetPhotoStorage.test.ts", "nativePetPhotoPresentation.test.ts", "nativePetPhotoVisionContract.test.ts"],
    requiredBoundaries: ["get_service_care_pet_scope", "register_native_media_asset", "request_storage_cleanup"],
  },
];

const appRoot = existsSync(join(process.cwd(), "app", "package.json")) ? join(process.cwd(), "app") : process.cwd();
const libRoot = join(appRoot, "src", "lib");
const ledgerSource = join(libRoot, "nativeActionBoundaryLedger.test.ts");

describe("native critical-flow coverage gate", () => {
  it("keeps a concrete contract suite attached to every critical user journey", () => {
    for (const flow of criticalFlows) {
      expect(flow.transitions.length, `${flow.name} has no state transitions`).toBeGreaterThan(2);
      expect(flow.requiredTests.length, `${flow.name} has no regression contracts`).toBeGreaterThan(1);
      for (const testFile of flow.requiredTests) {
        expect(existsSync(join(libRoot, testFile)), `${flow.name} lost ${testFile}`).toBe(true);
      }
    }
  });

  it("requires every critical-flow boundary to remain in the reviewed action ledger", () => {
    const source = readFileSync(ledgerSource, "utf8");
    for (const flow of criticalFlows) {
      for (const boundary of flow.requiredBoundaries) {
        expect(source, `${flow.name} boundary is no longer ledgered: ${boundary}`).toContain(`name: "${boundary}"`);
      }
    }
  });
});
