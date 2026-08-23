const textOf = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.message || record.error || record.code || record.detail || "");
  }
  return String(value || "");
};

export function nativeSafeErrorCopy(value: unknown, fallback = "Something went wrong. Please try again.") {
  const raw = textOf(value).trim();
  const normalized = raw.toLowerCase();

  if (normalized.includes("missing_access_token")) return "Looks like you're not signed in. Let's get you logged in first.";
  if (normalized.includes("auth_required")) return "You need to be signed in to see this page.";
  if (normalized.includes("unauthorized")) return "We can't confirm your account permissions for this. Try signing in again.";
  if (normalized.includes("invalid jwt")) return "Verification is preparing. Try again in a moment.";
  if (normalized.includes("jwt expired")) return "You've been signed out for security. Quick sign-in to continue!";
  if (normalized.includes("session not found")) return "We can't find your active session. Mind signing in again?";

  if (normalized.includes("delete_failed")) return "We couldn't close your account right now. Mind trying again later?";
  if (normalized.includes("user_delete_failed")) return "We hit a glitch closing your account. Let's try again in a bit.";
  if (normalized.includes("profile_delete_failed")) return "We deleted your login, but your profile data is sticking. Tap later to clear it.";
  if (normalized.includes("storage_cleanup_failed")) return "Your photos are taking a second to clear out. Try deleting again in a bit.";
  if (normalized.includes("active_care_booking")) return "Account deletion is paused. You have an active Care booking. Complete or cancel it first, then try again.";
  if (normalized.includes("active_care_payment")) return "Account deletion is paused. A Care payment action is still processing. Please try again once it finishes.";
  if (normalized.includes("open_care_dispute")) return "Account deletion is paused. You have an open Care dispute. Resolve it first, then try again.";
  if (normalized.includes("pending_customer_refund")) return "Account deletion is paused. You have a pending Care refund. Please wait for the refund to finish before deleting your account.";
  if (normalized.includes("pending_provider_payout")) return "Account deletion is paused. You have a pending Care payout. Please wait for the payout to finish before deleting your account.";
  if (normalized.includes("delete_account_cleanup_failed")) return "We couldn't delete your account. Something on our side blocked the cleanup.";
  if (normalized.includes("delete_account_storage_failed")) return "We couldn't finish deleting your account. Some photos or files could not be cleared yet.";

  if (normalized.includes("password_min_8_chars")) return "Make sure your new password is at least 8 characters long!";
  if (normalized.includes("password_missing_uppercase")) return "Add at least one uppercase letter to your password.";
  if (normalized.includes("password_missing_number")) return "Add at least one number to your password.";
  if (normalized.includes("password_missing_special")) return "Add at least one special character to your password.";
  if (normalized.includes("password_found_in_breach")) return "This password has appeared in a data breach. Choose a different one.";
  if (normalized.includes("password_breach_check_unavailable")) return "We couldn't check this password against known breaches. Please try again.";
  if (normalized.includes("weak_password")) return "Try a mix of letters, numbers, and symbols to make it extra secure.";
  if (normalized.includes("same_password")) return "That's your current password! Pick a brand new one to update it.";
  if (normalized.includes("password_change_failed")) return "We couldn't update your password just yet. Try saving it again later.";
  if (normalized.includes("apple_oauth_required")) return "This email is linked to Apple Sign In. Continue with Apple instead.";
  if (normalized.includes("google_oauth_required")) return "This email is linked to Google Sign-In. Continue with Google instead.";
  if (normalized.includes("this account uses apple sign in")) return "This account uses Apple Sign In. Continue with Apple to access huddle.";
  if (normalized.includes("this account uses google sign-in")) return "This account uses Google Sign-In. Continue with Google to access huddle.";
  if (normalized.includes("this email is linked to apple sign in")) return "This email is linked to Apple Sign In. Continue with Apple instead.";
  if (normalized.includes("this email is linked to google sign-in")) return "This email is linked to Google Sign-In. Continue with Google instead.";
  if (normalized.includes("google_sign_in_not_configured")) return "Google Sign-In is not configured for this build. Please use email or Apple Sign In for now.";
  if (normalized.includes("google_sign_in_incomplete")) return "Google did not finish sign-in. Please reopen Google Sign-In and try again.";
  if (normalized.includes("google_identity_token_missing")) return "Google did not return the secure sign-in token. Please try again.";
  if (normalized.includes("apple_identity_token_missing")) return "Apple did not return the secure sign-in token. Please try again.";
  if (normalized.includes("id token")) return "The sign-in token could not be accepted. Please try again.";

  if (normalized.includes("human_verification_failed")) return "Security check failed. Try again.";
  if (normalized.includes("timeout-or-duplicate")) return "Security check expired. Try again.";
  if (normalized.includes("invalid_token")) return "Security check expired. Try again.";
  if (normalized.includes("action_mismatch")) return "Security check mismatch. Restart this step.";
  if (normalized.includes("hostname_mismatch")) return "Security check could not confirm this app. Try again.";
  if (normalized.includes("missing_secret")) return "Security check is unavailable. Try again later.";
  if (normalized.includes("siteverify_unreachable")) return "Security check could not connect. Try again later.";

  if (normalized.includes("new row violates row-level security policy")) return "We can't add this under your account right now. Mind checking back later?";
  if (normalized.includes("violates row-level security policy")) return "This action isn't allowed on your account. Give it a reload in a bit.";
  if (normalized.includes("row-level security")) return "Your local app sync dropped out. Try signing back in to fix this.";
  if (normalized.includes("permission denied")) return "You don't have the permissions needed to touch this item.";

  if (normalized.includes("23505")) return "That unique ID is already claimed by a neighbor. Pick a new one!";
  if (normalized.includes("duplicate key value violates unique constraint")) return "That custom text or link is already taken! Try another one.";
  if (normalized.includes("already exists")) return "This item or profile name is already set up on your account.";

  if (normalized.includes("23503")) return "We can't attach this item because its main record is gone.";
  if (normalized.includes("foreign key constraint")) return "This depends on something that was deleted. Refresh and check back later.";
  if (normalized.includes("not found")) return "We looked everywhere, but that item isn't here anymore.";
  if (normalized.includes("missing record")) return "This data entry can't be pulled up right now. Please check back later.";

  if (normalized.includes("23514")) return "This info doesn't match our community rules. Give it a look and try again later.";
  if (normalized.includes("check constraint")) return "Some numbers or dates are outside the allowed limit. Double-check them!";
  if (normalized.includes("invalid enum")) return "That option isn't on our official list. Pick a different choice!";
  if (normalized.includes("invalid input syntax")) return "The text layout format looks wrong here. Check your typing!";

  if (normalized.includes("bucket not found")) return "Our media storage room is down right now. Let's try uploading later.";
  if (normalized.includes("profile_photo_replace_failed")) return "We couldn't replace your existing profile photo. Please sign in again and retry.";
  if (normalized.includes("profile_photo_registration_failed")) return "Your photo uploaded, but we couldn't attach it to your profile. Please retry.";
  if (normalized.includes("profile_photo_upload_failed")) return "We couldn't upload your profile photo. Please check the photo and try again.";
  if (normalized.includes("service_care_evidence_not_registered")) return "Your check-in photo didn't finish saving. Please try again.";
  if (normalized.includes("invalid_service_care_evidence_path") || normalized.includes("service_care_evidence_content_id_mismatch")) return "We couldn't verify your check-in photo. Please retake it and try again.";
  if (normalized.includes("service_care_evidence_permission_denied") || normalized.includes("invalid_service_care_evidence_bucket")) return "We couldn't confirm you have access to upload this photo. Please sign in again and retry.";
  if (normalized.includes("storage_delete_failed_401") || normalized.includes("storage_delete_failed_403")) return "We couldn't replace your existing photo under this session. Please sign in again and retry.";
  if (normalized.includes("storage_delete_failed")) return "We couldn't replace the old photo yet. Please retry in a moment.";
  if (normalized.includes("storage_object_not_found")) return "We can't load this photo file from our servers anymore.";
  if (normalized.includes("object not found")) return "This media link appears to be broken. Try re-uploading the photo later.";
  if (normalized.includes("payload too large")) return "Whoa, that file is way too heavy! Shrink it down and try again later.";
  if (normalized.includes("file too large")) return "This photo size exceeds our upload limit. Choose a lighter file later!";
  if (normalized.includes("413")) return "Server says this upload is too large to handle. Try another photo in a bit.";
  if (normalized.includes("mime type")) return "We can't convert this specific file format. Try a JPG or PNG instead.";
  if (normalized.includes("unsupported media type")) return "This media format won't work on huddle. Stick to normal photos/videos!";
  if (normalized.includes("invalid file type")) return "That file extension isn't allowed here. Try uploading a clear image later.";
  if (normalized.includes("storage_quota")) return "Your storage limit is reached! Reach out to support to help unlock more space.";
  if (normalized.includes("quota exceeded")) return "This space has hit its upload limit. Chat with support to see how to upgrade.";
  if (normalized.includes("insufficient storage")) return "Our media servers are full right now. Let's try this again a bit later!";

  if (normalized.includes("network request failed")) return "Your internet connection dropped out. Check your signal and try again later.";
  if (normalized.includes("fetch failed")) return "We can't reach the huddle servers right now. Let's try again in a little while.";
  if (normalized.includes("aborterror")) return "The request was canceled before it finished. Try again later if you need it!";
  if (normalized.includes("timeout")) return "The server is taking too long to reply. Let's try your request later.";

  if (normalized.includes("rate_limit")) return "Slow down a bit! Let's try that action again in a little while.";
  if (normalized.includes("too_many_requests")) return "Too many taps at once. Wait a moment and give it another go later.";
  if (normalized.includes("429")) return "Action paused for safety. Hang tight and try again a bit later.";

  if (normalized.includes("otp_expired")) return "That verification code has expired. Tap below to send a fresh one.";
  if (normalized.includes("invalid_otp")) return "That code doesn't match what we sent. Check your text app and retype it.";
  if (normalized.includes("token expired")) return "This login link is no longer active. Let's request a brand new link.";
  if (normalized.includes("token invalid")) return "This confirmation link looks broken. Try requesting a new one later.";
  if (normalized.includes("phone_provider_unavailable")) return "Our texting system is down at the moment. Try verifying again shortly!";
  if (normalized.includes("sms_failed")) return "We couldn't deliver the text right now. Give it a check and try later.";
  if (normalized.includes("otp_send_failed")) return "The verification text didn't go out. Tap to resend it later.";

  if (normalized.includes("map_mutation_failed")) return "We couldn't drop the pin on the map. Try tapping the spot again later.";
  if (normalized.includes("map_action_failed")) return "The map tool failed to load your changes. Let's try again in a bit.";
  if (normalized.includes("location permission denied")) return "Location access is turned off. Type your neighborhood in manually instead!";
  if (normalized.includes("location unavailable")) return "We can't find your exact GPS spot right now. Use manual entry below.";

  if (normalized.includes("direct_chat_unavailable")) return "This private chat can't be opened right now.";
  if (normalized.includes("cannot_chat_with_self")) return "You can't start a direct chat conversation with yourself!";
  if (normalized.includes("blocked_relationship")) return "Messaging is unavailable between these two accounts right now.";
  if (normalized.includes("unmatched_relationship")) return "You need an active booking request to open a chat with this user.";
  if (normalized.includes("group_room_required")) return "This post needs to be placed inside an official group room.";
  if (normalized.includes("not_group_member")) return "Join this huddle group first to start chatting with the pack!";
  if (normalized.includes("not_admin")) return "Only group leaders have the access to change these settings.";
  if (normalized.includes("membership_required")) return "You need to be a member of this group to view the roster list.";

  if (normalized.includes("provider_unavailable")) return "This carer is fully booked up or offline now. Try looking nearby!";
  if (normalized.includes("care_request_not_found")) return "This specific care request has been removed or canceled.";
  if (normalized.includes("booking_not_found")) return "We can't track down this booking record. Head back to your dashboard.";
  if (normalized.includes("stripe_account_not_ready")) return "Your payout profile isn't fully set up yet. Tap to connect Stripe!";
  if (normalized.includes("payouts_disabled")) return "Payouts are paused on your account. Check your Stripe settings to fix this.";
  if (normalized.includes("onboarding_incomplete")) return "Finish your onboarding details first so we can unlock your wallet setup.";
  if (normalized.includes("purchase_failed")) return "Your purchase didn't go through. Mind trying again a bit later?";
  if (normalized.includes("restore_failed")) return "We couldn't find any past purchases linked to this account.";
  if (normalized.includes("product_unavailable")) return "This feature package isn't open for purchase right now.";

  if (normalized.includes("credential_upload_failed")) return "We couldn't save your certification document right now. Try uploading later.";
  if (normalized.includes("credential_check_failed")) return "This document image isn't clear enough for our checks. Let's try again later.";
  if (normalized.includes("unable_to_verify")) return "We couldn't verify this detail right now. Check back later or contact support.";
  if (normalized.includes("identifier_check_failed")) return "This social ID or email didn't pass our security checks. Try a different one later.";
  if (normalized.includes("display_name_change_cooldown")) return "Display name can be changed once every 7 days.";
  if (normalized.includes("social_id_change_cooldown")) return "Social ID can be changed once every 30 days.";
  if (normalized.includes("social_id_unavailable")) return "This Social ID is not available. Try another one.";
  if (normalized.includes("social_id_check_failed")) return "We couldn't process this link to your social profile. Try again later.";
  if (normalized.includes("verify_status_failed")) return "We couldn't load your verification history. Pull down to refresh later.";

  return fallback;
}
