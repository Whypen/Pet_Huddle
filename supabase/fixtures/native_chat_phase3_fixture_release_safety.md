# Native Chat Phase 3 Fixture Release Safety

The Phase 3 smoke fixture lives outside `supabase/migrations` on purpose:

- Fixture SQL: `supabase/fixtures/native_chat_phase3_test_fixtures.uat.sql`
- Fixture account pattern: `native.chat.*@huddle.local`
- Fixture room ids: `10000000-0000-4000-8000-000000001001` through `10000000-0000-4000-8000-000000001003`

Do not promote this file as a production migration. Apply it only to disposable UAT or local databases for the native `/chats` and `/chat-dialogue` smoke proof.

Before release, confirm:

1. `supabase/migrations` contains no `native.chat.*@huddle.local` fixture inserts.
2. Production data contains no `profiles.email like 'native.chat.%@huddle.local'`.
3. If a UAT database must be cleaned, run the fixture SQL cleanup block or delete rows for the fixture chat ids and fixture emails before copying data forward.
