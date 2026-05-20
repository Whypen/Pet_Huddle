# Phase 0 Launch Blocker Tracker

Status: In progress
Date: 2026-04-19
Scope: organization enrollment, legal identity, support ownership, and submission-blocking setup

## Current State

- Apple Developer Organization enrollment: not verified in repo
- D-U-N-S validation: not verified in repo
- Legal entity alignment: not verified in repo
- Org-domain email ownership: not verified in repo
- Google Play organization verification: not verified in repo
- Final app identity: unresolved by decision, treated as hard gate
- Final support/privacy/terms public URLs: unresolved by decision, treated as hard gate

## Owners

- Engineering: implement native/web/backend changes without breaking current web
- Legal / policy: entity alignment, policy copy, support/privacy/terms review
- Store ops: Apple / Google account setup, screenshots, submission records
- Support: support mailbox ownership, escalation path, reviewer-facing contact path

## Hard Gate Checklist

| Item | Status | Owner | Target date |
| --- | --- | --- | --- |
| Apple Developer Organization enrollment started | [ ] | Store ops | 2026-04-20 |
| Apple Developer Organization enrollment completed | [ ] | Store ops | 2026-04-25 |
| D-U-N-S validation started | [ ] | Legal / policy | 2026-04-20 |
| D-U-N-S validation completed | [ ] | Legal / policy | 2026-04-24 |
| Legal entity name confirmed to match developer enrollment | [ ] | Legal / policy | 2026-04-22 |
| Org-domain email ownership confirmed | [ ] | Support | 2026-04-21 |
| Google Play organization verification started | [ ] | Store ops | 2026-04-20 |
| Google Play organization verification completed | [ ] | Store ops | 2026-04-24 |
| Support mailbox owner assigned | [ ] | Support | 2026-04-20 |
| Support escalation owner assigned | [ ] | Support | 2026-04-20 |
| Final app identity approved | [ ] | Engineering + legal / policy | 2026-04-26 |
| Final public privacy URL approved | [ ] | Legal / policy | 2026-04-26 |
| Final public terms URL approved | [ ] | Legal / policy | 2026-04-26 |
| Final public support URL approved | [ ] | Support + engineering | 2026-04-26 |

## Unresolved Inputs Still Required

- Final app name
- Final iOS bundle identifier
- Final Android package name
- Final support email
- Final support URL
- Final privacy URL
- Final terms URL

## Immediate Workstreams Opened

1. Apple org enrollment workstream
2. Google Play org verification workstream
3. D-U-N-S and legal entity alignment workstream
4. Org-domain email / support mailbox ownership workstream
5. Final identity decision workstream
6. Public privacy / terms / support URL workstream

## Submission Constraint Notes

- Native submission cannot proceed until Apple and Google organization verification work is complete.
- Final branding fields are explicitly allowed to remain unresolved during non-blocked engineering work, but they must be tracked as submission blockers.
- Support/privacy/terms public URLs are required early enough to support App Store Connect / Play Console setup and reviewer notes.
