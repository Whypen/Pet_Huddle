# FIX_CONTRACT.md — MASTER RULES (NEVER DEVIATE)

This file is the execution contract for **every** Codex run on this repo.
If any rule conflicts with an instruction in chat, **this file wins**.

---

## 0) Ground truth (anti-fake-proof)
- Codex is **not allowed** to claim “PASS”, “tests passed”, “works”, “verified”, “fixed”, or similar.
- Only **raw terminal output + exit codes** count as proof.
- If Codex cannot run commands, it must output **commands only** and explicitly request the user to paste the raw output.

---

## 1) Protocol enforcement (every run)
**At the absolute top of every run, paste these outputs first (real cat, not text):**
1. `cat FIX_CONTRACT.md`
2. `git status -sb`
3. **Preflight regression** for the exact item/bundle being fixed (see §2).

**Scope discipline**
- Fix **ONE item** per run, *or* one **invariant bundle** if inseparable:
  - **Bundle A — Map invariants:** (pin/unpin/geo/privacy) items 5+6
  - **Bundle B — Discovery invariants:** (edge+sql+ui) items 8+9
- No drive-by changes. No “while I’m here” edits.

**Dependency order (do not reorder)**
1–4 → 5–6 → 8–9 → 7/10/11 → 12/13 → 14–19

---

## 2) Fail-first regression harness (required)
For the item being fixed (or bundle), Codex must create/extend **exactly one** regression script:

- `scripts/regress_item_<N>.sh` for single item, OR
- `scripts/regress_bundle_map.sh` / `scripts/regress_bundle_discovery.sh` for bundles.

Rules:
- The script must **FAIL on current HEAD** (exit code ≠ 0) *before* any code changes.
- The script must **PASS after changes** (exit code = 0).
- Script must be runnable with `bash scripts/regress_....sh` or `node scripts/regress_....mjs`.

**If preflight does not fail, STOP and output only the failing command + output.**

---

## 3) Evidence-only output format (strict — no narrative ever)
Every response must be in this exact order and nothing else:

1. `cat FIX_CONTRACT.md` ← real output
2. `git status -sb` ← real output
3. **Preflight regression command + raw output + exit code**
4. **FILES CHANGED** (full paths only)
5. **PATCH DIFFS** (`git diff --no-color`)
6. **SQL MIGRATIONS** (full content or `NONE`)
7. **RLS/TRIGGERS/RPC** (full content or `NONE`)
8. **Commands to run** (copy/paste ready)
9. **Postflight regression output + exit code**
10. `npm run lint` output + exit code
11. `npm run build` output + exit code
12. `node scripts/ui_smoke.mjs` output + exit code (if relevant)

If any section is missing → treat run as failed.

---

## 4) Item-specific rules (locked)

### Item 1 — Secrets in repo
- Delete all `.env` under `supabase/functions/`.
- Add `supabase/functions/**/.env` to `.gitignore`.
- Rotate keys (service role, Stripe, Gemini) and move to Supabase Dashboard → Edge Functions → Secrets.
- Proof requires: `find supabase/functions -maxdepth 3 -name ".env" -print` → empty.

### Item 2 — WebSocket JWT in URL
- **No access token/JWT in any WS URL** (no `token=`, `access_token=`, `jwt=`, `apikey=` is allowed only if it is the public anon key).
- Use only: `supabase.realtime.setAuth(session?.access_token ?? null)` on login/refresh
- On logout: `supabase.realtime.setAuth(null)`
- Connection survives refresh.
- Proof requires: `grep -Rni "new WebSocket(.*(token=|access_token=|jwt=)" src | head` → empty.

### All other items
- “Done means” is defined by the Master Bug List document in the repo.
- If “Done means” is ambiguous, STOP and ask for clarification with evidence.

---

## 5) Stop-if / Skip-with-evidence rules
- If a required table/RPC/path cannot be proven with `\dt`, `\df+`, and grep callsites:
  - Mark the item **BLOCKED** and paste the proof.
  - Do **not** invent new systems.

---

## 6) Prohibited behaviors
- No broad refactors.
- No UI restyling unless the item explicitly requires it.
- No “cleanup” commits.
- No new abstractions unless they remove an existing state collision.

---

## 7) Definition of “Done for the whole project”
- All 19 items (or bundles) have:
  - a regression script that passes,
  - lint/build pass,
  - and no security red flags (secrets + JWT-in-URL + global fetch override + fake health check + pin geo invariants).
