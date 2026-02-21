# Phase 1 Truth Table

Generated: 2026-02-18T16:21:11.132Z

## Routes Found
- /auth (src/App.tsx)
- /reset-password (src/App.tsx)
- /auth/callback (src/App.tsx)
- /signup/dob (src/App.tsx)
- /signup/name (src/App.tsx)
- /signup/credentials (src/App.tsx)
- /signup/verify (src/App.tsx)
- /onboarding (src/App.tsx)
- / (src/App.tsx)
- /social (src/App.tsx)
- /threads (src/App.tsx)
- /threads/:threadId (src/App.tsx)
- /chats (src/App.tsx)
- /chat-dialogue (src/App.tsx)
- /ai-vet (src/App.tsx)
- /map (src/App.tsx)
- /notifications (src/App.tsx)
- /edit-profile (src/App.tsx)
- /edit-pet-profile (src/App.tsx)
- /pet-details (src/App.tsx)
- /settings (src/App.tsx)
- /account-settings (src/App.tsx)
- /subscription (src/App.tsx)
- /premium (src/App.tsx)
- /manage-subscription (src/App.tsx)
- /verify-identity (src/App.tsx)
- /privacy (src/App.tsx)
- /terms (src/App.tsx)
- /admin (src/App.tsx)
- /admin/verifications (src/App.tsx)
- /admin/control-center (src/App.tsx)
- /admin/reports (src/App.tsx)
- * (src/App.tsx)

## Truth Table
| SPEC Section | Route | Component | Membership Fields | DB Tables | Component File |
| --- | --- | --- | --- | --- | --- |
| 2.1 Social ID System | /auth | Auth | none | none | src/pages/Auth.tsx |
| 2.1 Social ID System | /reset-password | ResetPassword | none | none | src/pages/ResetPassword.tsx |
| 2.1 Social ID System | /auth/callback | AuthCallback | none | none | src/pages/AuthCallback.tsx |
| 2.1 Social ID System | /signup/dob | SignupDob | none | none | src/pages/signup/SignupDob.tsx |
| 2.1 Social ID System | /signup/name | SignupName | none | none | src/pages/signup/SignupName.tsx |
| 2.1 Social ID System | /signup/credentials | SignupCredentials | none | profiles | src/pages/signup/SignupCredentials.tsx |
| 2.1 Social ID System | /signup/verify | SignupVerify | none | profiles | src/pages/signup/SignupVerify.tsx |
| 1. Product Definition | /onboarding | Unknown | none | none | unknown |
| 5. Social Discovery | / | Index | none | pets | src/pages/Index.tsx |
| 5. Social Discovery | /social | Social | none | none | src/pages/Social.tsx |
| 7. Threads (Community Forum) | /threads | Social | none | none | src/pages/Social.tsx |
| 7. Threads (Community Forum) | /threads/:threadId | Social | none | none | src/pages/Social.tsx |
| 8. Chat Safety & Moderation | /chats | Chats | membership_tier | pets, chat_room_members, waves, profiles, social_album, notices, chat_rooms, notifications | src/pages/Chats.tsx |
| 8. Chat Safety & Moderation | /chat-dialogue | ChatDialogue | none | chat_room_members, chat_messages, notices | src/pages/ChatDialogue.tsx |
| 4.1 Gemini AI Vet | /ai-vet | AIVet | membership_tier | pets | src/pages/AIVet.tsx |
| 6. Broadcast Mesh Network | /map | MapPage | membership_tier | pins, profiles, poi_locations | src/pages/Map.tsx |
| 1. Product Definition | /notifications | Notifications | none | none | src/pages/Notifications.tsx |
| 9.1 Core Tables (profiles/pets) | /edit-profile | EditProfile | none | social_album, pets, avatars, profiles | src/pages/EditProfile.tsx |
| 9.1 Core Tables (profiles/pets) | /edit-pet-profile | EditPetProfile | none | pets | src/pages/EditPetProfile.tsx |
| 1. Product Definition | /pet-details | PetDetails | none | pets | src/pages/PetDetails.tsx |
| 4.2 Nanny Marketplace Escrow | /settings | Settings | none | none | src/pages/Settings.tsx |
| 9.1 Core Tables (profiles/pets) | /account-settings | AccountSettings | membership_tier | profiles | src/pages/AccountSettings.tsx |
| 3. Membership Economy | /subscription | Unknown | none | none | unknown |
| 3. Membership Economy | /premium | Premium | none | none | src/pages/Premium.tsx |
| 3. Membership Economy | /manage-subscription | Unknown | none | none | unknown |
| 2.2 Identity Verification (KYC) | /verify-identity | VerifyIdentity | none | identity_verification, profiles | src/pages/auth/verify/VerifyIdentity.tsx |
| 1. Product Definition | /privacy | Privacy | none | none | src/pages/Privacy.tsx |
| 1. Product Definition | /terms | Terms | none | none | src/pages/Terms.tsx |
| 1. Product Definition | /admin | Admin | none | identity_verification | src/pages/Admin.tsx |
| 1. Product Definition | /admin/verifications | AdminKYCReview | none | verification_uploads, identity_verification | src/pages/admin/AdminKYCReview.tsx |
| 1. Product Definition | /admin/control-center | AdminDisputes | none | marketplace_bookings | src/screens/AdminDisputes.tsx |
| 1. Product Definition | /admin/reports | AdminReports | none | user_reports | src/pages/admin/AdminReports.tsx |
| 1. Product Definition | * | NotFound | none | none | src/pages/NotFound.tsx |

## FAIL
### Missing Required Routes
- none

### Legacy Fields Still Referenced
- effective_tier @ src/lib/membership.ts:20

### Mismatched Route Strings
- /family-invite
  - src/pages/AccountSettings.tsx
- /change-password
  - src/pages/AccountSettings.tsx