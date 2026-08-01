# Huddle Growth Agent — current implementation

This folder documents the production control plane. The live function code is
under `supabase/functions/`; the operator panel is the local Huddle Operations
app under `Operations/Huddle Operations/`.

## Latest pass

- Live sync records explicit conversation source (`Comment`, `Reply`, or the
  named inbox) and the parent post copy/permalink where Meta supplies it.
- Huddle-owned authors are filtered from imported comments and the panel has a
  second defensive filter.
- WhatsApp delivery/read/status callbacks without message text are ignored;
  inbound text is preserved exactly.
- Threads replies are imported when the connected token permits the replies
  edge; a clear sync note is surfaced if Meta denies that edge.
- Comment drafts use Huddle's social voice; private inbox drafts use a calmer
  customer-support voice. Sensitive cases remain approval-gated.
- The panel has newest/oldest/engagement sorting, cross-platform content
  deduplication, and a safe fallback when Meta media URLs have expired.

No database migration was required for this pass. Backend functions were
deployed to Supabase project `ztrbourwcnhrpmzwlrcn` and the backend changes were
committed to `codex/huddle-growth-agent`.
