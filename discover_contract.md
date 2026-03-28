# Discover Contract

## 1. Objective

Discover must help users find the best nearby, relevant, active, and trustworthy people in the Huddle community.

The system must:
- prioritize pet relevance first
- prioritize real and active users over stale users
- prefer closer and more location-ready users
- give Plus and Gold a bounded priority boost
- never let paid tiers fully override a clearly better organic match
- keep passed profiles recyclable instead of permanently hiding them
- reduce abuse from spammy “Wave everyone” behavior
- remain deterministic and rebuildable without guesswork

This contract is the sole source of truth for Discover behavior.

---

## 2. Tier Contract

### Canonical tier keys
Backend and runtime keys:
- `free`
- `plus`
- `gold`

### Daily Discover caps
- Free: `100/day`
- Plus: `250/day`
- Gold: `400/day`

### Tier score boost
This boost is added after all organic scoring:
- Free: `+0`
- Plus: `+8`
- Gold: `+15`

### Important rule
Gold is **not unlimited**.  
Gold is capped at **400/day**.

---

## 3. Discover Eligibility

## 3.1 Registered user
A registered user already has:
- DOB
- email
- phone
- name
- social ID

These are registration requirements, not Discover gates.

## 3.2 Discover-eligible profile
A user may use Discover and appear in Discover only if profile setup is complete.

Minimum Discover-eligible profile requirements:
- set profile step completed
- gender present
- location present
- Community Role present
- pet experience present

If profile completion is not satisfied:
- user cannot use Discover
- user cannot be shown in Discover

---

## 4. Hard Eligibility Gate

A candidate must be excluded before scoring if any of the following are true:

- same user as viewer
- already matched with viewer
- blocked either direction
- `non_social = true`
- age under 16
- outside selected viewer age range
- outside selected viewer radius
- fails any active filter gate
- inactive beyond freshness rule

### Important privacy distinction
- `hide_from_map = true` affects map visibility only
- `non_social = true` excludes from Discover

---

## 5. Freshness Gate

## 5.1 Default freshness rule
A candidate is eligible only if active within the last **14 days**.

## 5.2 Expansion rule
If the candidate pool is too small after hard gate and active filters, freshness expands to **30 days**.

## 5.3 Pool target definition
Pool target means the viewer’s daily Discover cap:
- Free target pool: `100`
- Plus target pool: `250`
- Gold target pool: `400`

## 5.4 Candidate pool count
`eligible_pool_count` means:
- candidate count after hard gate
- candidate count after active filter gate
- before scoring
- before sorting
- before final daily cap is applied

## 5.5 Beyond 30 days
Profiles inactive for more than **30 days** are excluded.

---

## 6. Location Rules

## 6.1 Required location baseline
A Discover-eligible profile must have valid location baseline data.

## 6.2 Distance source priority
Use location sources in this order:
1. live GPS / active precise location
2. recent manual pin
3. coarse profile fallback

## 6.3 Manual pin recency threshold
A manual pin counts as “recent” only if it is within **12 hours**.

If older than 12 hours:
- it no longer counts as recent pin
- it becomes coarse fallback only

## 6.4 Allowed radius
Allowed radius is the viewer’s current Discover radius setting.

Maximum system radius:
- `150 km`

A candidate must be within the selected radius to be eligible.

---

## 7. Filter Gate Contract

All selected filters are **hard gates**.

If the viewer selects a filter and the candidate does not match, the candidate is excluded before scoring.

### Canonical Discover filter set
1. Age Range
2. Gender
3. Distance
4. Species
5. Community Role
6. Height Range
7. Sexual Orientation
8. Highest Degree
9. Relationship Status
10. Car Badge
11. Pet Experience
12. Language
13. Verified Only
14. Who Waved At You
15. Active Users Only

---

## 8. Canonical Enum Contract

DB currently stores many Discover-related fields as free text or text arrays, so canonical values must come from shared app constants. No duplicate option lists are allowed.

The same option source must be used by:
- profile editor
- filter UI
- scoring normalization
- profile display
- Discover logic

## 8.1 Community Role
Community Role is a direct Discover filter enum.

Canonical values:
- Pet Parent
- Pet Nanny
- Animal Friend (No Pet)
- Veterinarian
- Pet Photographer
- Pet Groomer
- Vet Nurse
- Volunteer

If Community Role is selected:
- mismatch = exclude

If Community Role is not selected:
- Community Role may still contribute a small organic relevance score

## 8.2 Species
Species must use one canonical shared option source across:
- pet setup
- Discover filter
- profile display
- Discover scoring

## 8.3 Pet Size
Canonical values:
- Small
- Medium
- Large

Adjacency rules:
- Small ↔ Medium = adjacent
- Medium ↔ Large = adjacent
- Small ↔ Large = not adjacent

## 8.4 Gender
Gender must use one canonical shared option source.

## 8.5 Sexual Orientation
Sexual Orientation must use one canonical shared option source.

## 8.6 Highest Degree
Highest Degree must use one canonical shared option source.

## 8.7 Relationship Status
Relationship Status must use one canonical shared option source.

## 8.8 Language
Language must use one canonical shared option source.

## 8.9 Pet Experience
Pet Experience must use one canonical shared option source and normalization model for:
- profile entry
- filter matching
- scoring

---

## 9. Score Formula

### Final score
```text
final_score =
  pet_fit
+ proximity_readiness
+ trust_quality
+ role_intent
+ freshness
+ compatibility
+ connection
+ tier_boost
- wave_spam_penalty
```

### Sorting
Sort candidates by:
1. `final_score desc`
2. `freshness_score desc`
3. `distance asc`
4. `created_at desc`

---

## 10. Score Buckets

## A. Pet Fit — 0 to 70
This is the most important scoring bucket.

### A1. Species Affinity — 0 to 35
Species affinity scores even if the viewer did not explicitly choose a species filter.

- exact same primary species: `+35`
- strong overlap in owned/cared species: `+22`
- broad overlap only: `+10`
- none: `0`

If the viewer selected a Species filter:
- mismatch is already excluded by the filter gate

### A2. Pet Size Affinity — 0 to 10
- same pet size bucket: `+10`
- adjacent size bucket: `+5`
- none: `0`

### A3. Pet Experience Value — 0 to 25
Use pet experience years, care capability, or relevant service capability.

- strong experience or service capability: `+25`
- medium: `+15`
- some: `+8`
- none: `0`

---

## B. Proximity & Readiness — 0 to 35

### B1. Distance — 0 to 20
Distance is scored only after the candidate has passed the radius gate.

- 0–1 km: `+20`
- >1–3 km: `+16`
- >3–5 km: `+12`
- >5–10 km: `+8`
- >10–25 km: `+5`
- >25 km but still inside selected radius: `+2`

### B2. Has Car — 0 to 5
- has car: `+5`
- otherwise: `0`

### B3. Location Readiness — 0 to 10
This measures how ready the user is to meet, not just whether coarse location exists.

- live GPS / active precise location: `+10`
- manual pin within 12h: `+8`
- coarse fallback only: `+3`
- weak location confidence: `0`

---

## C. Trust & Quality — 0 to 30

### C1. Verified — 0 to 15
- verified: `+15`
- otherwise: `0`

### C2. Social Album — 0 to 5
- non-empty social album: `+5`
- none: `0`

### C3. Bio Presence — 0 to 5
Meaningful bio threshold:
- `30+` non-space characters = `+5`
- otherwise: `0`

### C4. Completion / Integrity — 0 to 5
Count presence of:
- occupation
- academic
- relationship status
- orientation
- languages

Score:
- 4–5 present: `+5`
- 2–3 present: `+3`
- 1 present: `+1`
- none: `0`

### Hidden-field rule
Hidden fields may improve internal ranking quality.
They must never be:
- displayed visually
- hinted in copy
- used in visible “why this profile” explanations

---

## D. Community Role / Intent Relevance — 0 to 15

### D1. Exact selected Community Role match — 0 to 10
If the viewer selected Community Role:
- exact selected role match: `+10`
- otherwise: excluded by filter gate

If the viewer did not select Community Role:
- D1 = `0`

### D2. Organic role usefulness — 0 to 5
If Community Role was not selected, role can still help a little.

- high-value community/service role: `+5`
- moderate relevance: `+3`
- none: `0`

High-value:
- Veterinarian
- Vet Nurse
- Pet Groomer
- Pet Photographer
- Pet Nanny
- Volunteer

Base relevance:
- Pet Parent
- Animal Friend (No Pet)

---

## E. Freshness — 0 to 20

- active in last 24h: `+20`
- active in last 3d: `+15`
- active in last 7d: `+10`
- active in last 14d: `+5`
- shown only through 15–30d fallback: `+1`

---

## F. Compatibility — 0 to 10

### F1. Language Overlap — 0 to 5
- any overlap: `+5`
- none: `0`

### F2. Relationship / Orientation Alignment — 0 to 5
- relationship alignment: `+3`
- orientation alignment: `+2`

These are light-weight only and must not dominate pet fit or proximity.

---

## G. Connection — 0 to 5

### G1. Waved at viewer
- candidate waved at viewer: `+5`
- otherwise: `0`

---

## H. Tier Boost
This is applied last.

- Free: `+0`
- Plus: `+8`
- Gold: `+15`

Paid users get a nudge, not a guaranteed win.

A clearly better free profile may still outrank a weak gold profile.

---

## 11. Pass / X Behavior

### X means defer, not permanent dislike
Passed profiles are not permanently hidden.

### Same session behavior
- move passed profile to the end of the current queue
- do not show again until all higher-priority unpassed eligible profiles are exhausted

### Next login session behavior
- passed profiles become eligible again
- they may reappear near the end of the queue

### Permanent suppression only happens for:
- block
- match created
- `non_social = true`
- hard ineligibility

### Queue serving order
1. unpassed eligible candidates
2. recycled passed candidates from the same session
3. widened-freshness fallback candidates
4. next-session resurfaced passed candidates

---

## 12. Anti-Spam Wave Guard

This is an internal trust safeguard.

### Trigger window
- last `50` Discover decisions

### Trigger thresholds
- `wave_rate >= 90%` → mild penalty
- `wave_rate = 100%` → stronger penalty

### Safeguards
Do not trigger if:
- fewer than 30 reviewed profiles
- account age < 3 days
- eligible pool was below 30

### Penalty
- 90–99% Wave rate: `-5`
- 100% Wave rate: `-10`

### Visibility
This is:
- internal only
- no warning
- no badge
- no permanent punishment

Penalty must decay automatically once behavior normalizes.

---

## 13. Performance Requirement

The system must process Discover in this order:

1. hard eligibility gate
2. active filter gate
3. freshness gate
4. score buckets
5. tier boost
6. wave spam penalty
7. sort
8. apply daily cap

Never compute full scoring across the entire user table first.

---

## 14. Debug Fields

The scoring function must expose these internally or in debug/admin mode:

- `pet_fit_score`
- `proximity_score`
- `trust_quality_score`
- `role_intent_score`
- `freshness_score`
- `compatibility_score`
- `connection_score`
- `tier_boost_score`
- `wave_spam_penalty`
- `final_score`

---

## 15. Discover Exhausted Copy

### Free
`Ready to expand the pack? Upgrade to Huddle+ for more or Huddle Gold for the full daily cap.`

### Plus
`You’ve reached today’s Discover limit. Upgrade to Gold for the full daily cap.`

### Gold
`You’ve reached today’s Discover cap. More profiles will be ready tomorrow.`

---

## 16. Rebuild Rule

Any developer implementing Discover from scratch must follow this document exactly.

No alternate behavior is allowed for:
- caps
- tier boosts
- Community Role enum
- freshness gate
- pass/X resurfacing
- anti-spam Wave penalty
- sort order
- score bucket ranges
- hidden-field handling

If implementation differs, this contract wins.
