# Mobile Workspace

`/mobile` is the frozen fallback/reference hybrid native workspace.

It is not an active native build path. `/app` is the active native workspace.

Rules:

- preserve fallback usability
- do not start new native feature work here
- do not treat this as the active native build path while `/app` exists
- use this only if `/app` fails hard or an explicit instruction says to work in `/mobile`
- set `ALLOW_MOBILE_FALLBACK=1` before running any mobile script
- document the reason whenever fallback execution is used

Reference-only material inside `/mobile`:

- `src_legacy_parity_baseline_c29abc8_20260420`

Do not confuse:

- `src` = live web product
- `app` = active native workspace
- `mobile` = frozen fallback/reference hybrid workspace
