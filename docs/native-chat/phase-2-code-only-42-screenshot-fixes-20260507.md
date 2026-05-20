# Phase 2 Code-Only 42 Screenshot Fixes - 2026-05-07

PHASE/GATE:
Code-only fix pass after user stopped runtime on modal screenshot mistakes.

RESULT:
CODE PASS / RUNTIME NOT RUN / DB NOT RUN / NOT SHIPPED.

FILES CHANGED:
- `app/src/components/nativeModalPrimitives.tsx`
- `app/src/components/nativeModalPrimitives.styles.ts`
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/screens/NativeChatDialogueScreen.tsx`

PATCH DIFFS:
- Added optional `fill` behavior to `AppBottomSheetScroll`.
- Changed default bottom-sheet scroll body from forced flex-grow to content-sized scroll; retained explicit fill mode for large fixed sheets.
- Moved My Group admin action cards above members so `Join requests` and `Invite users` are not hidden by members/footer.
- Removed the nested floating member action modal from My Group detail and replaced it with an inline row-anchored action block.
- Kept admin-only `Remove` inside member row actions; report/block remain available.
- Updated group dialogue info sheet to use the same shared group hero/modal primitives as My Group detail.
- Added dialogue group info admin action rows and fixed footer action.
- Added verified avatar composition for dialogue group info member rows.

DATABASE PROOF COMMANDS:
Not run by user instruction. Runtime and DB proof require approval.

UIUX PARITY PROOF:
Code audit only. No simulator proof was run in this pass by user instruction.

TEST RESULTS:
- `npm --prefix app run typecheck`: PASS
- `npx eslint app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/components/profile/NativePublicProfileModal.tsx`: PASS
- `git diff --check`: PASS
- `npm run build`: PASS with existing warnings only.

BLOCKERS:
- Runtime visual proof remains required for every modal/sheet state.
- DB proof remains required for invite/request/create mutations.
- Request-budget idle/navigation proof remains required.

SAFE TO CONTINUE TO NEXT GATE:
Yes, only if the user approves one-go runtime verification.

NEXT_AGENT_RESUME UPDATED:
yes
