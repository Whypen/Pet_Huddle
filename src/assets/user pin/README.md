## User Pin Review Set

This folder is a review pack built from the official DiceBear `notionists` style only.

Source style:
- `https://www.dicebear.com/styles/notionists/`

Source endpoint:
- `https://api.dicebear.com/9.x/notionists/svg?seed=<seed>`

Structure:
- `male/` -> 8 direct SVG downloads
- `female/` -> 8 direct SVG downloads
- `neutral/` -> 8 direct SVG downloads
- `groups/` -> 8 grouped SVG composites, each built from exactly 1 female + 1 male + 1 neutral local source avatar

Manifest:
- `manifest.json` contains the exact source URL used for every local SVG file.
- `manifest.json` also records the exact 3 source avatars used for every grouped SVG.

Rules for this pack:
- No AI-drawn imitation assets
- No manual vector redraws
- No style substitutions
- Every single-avatar SVG here is fetched directly from the official DiceBear Notionists endpoint
- Every grouped SVG here is composed only from those same local official-source Notionists SVGs
