# SignupDob Redesign — 2026-03-10

## Summary
Redesign the DOB step (Step 1 of 4) in the signup flow to lead with a hero illustration,
replace the minimal "We use this to verify your age" subtitle with richer community copy,
and add a privacy reassurance note below the date-of-birth dropdowns.

## Scope
**One file only:** `src/pages/signup/SignupDob.tsx`
`SignupShell.tsx` is unchanged.

## Layout (top → bottom)

1. **Hero illustration** — `src/assets/Sign up/Signup_DOB.png`, `w-full object-contain`, `mb-6`
2. **Headline** — "When were you born?" (unchanged, `text-[28px] font-[600]`)
3. **Body copy** — two sentences with inline bold words:
   - "Huddle is a cozy corner where you can **Discover** pet lovers, use **Social** to share thoughts, and **Chat** directly with trusted friends, nannies, groomers, and vets."
   - "This helps keep our community safe and trusted for everyone."
4. **Date of birth label + 3-column dropdowns** — unchanged
5. **Privacy note** — "Don't worry— your full birthday is kept safe with us." (`text-[12px]`, muted, `mt-3`, below dropdowns, above error)
6. **Error / under-16 return link** — unchanged
7. **CTA bar** — "Continue" button, unchanged

## Copy

### Subtitle (replaces "We use this to verify your age.")
> Huddle is a cozy corner where you can **Discover** pet lovers, use **Social** to share
> thoughts, and **Chat** directly with trusted friends, nannies, groomers, and vets.
>
> This helps keep our community safe and trusted for everyone.

Bold words rendered as `<strong>` inline within a `<p>`.

### Privacy note (new, below dropdowns)
> Don't worry— your full birthday is kept safe with us.

## Styling tokens
- Headline: `text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]` (unchanged)
- Body copy: `text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2`
- Bold words: `font-[600] text-[#424965]` via `<strong className="font-[600] text-[#424965]">`
- Privacy note: `text-[12px] text-[rgba(74,73,101,0.55)] mt-3`
- Illustration: `w-full object-contain mb-6 -mt-2` (slight negative top to hug the nav spacing)

## What does NOT change
- `SignupShell.tsx` layout (step nav, progress bar, CTA bar, animations)
- Form logic (react-hook-form, zodResolver, Controller fields)
- All three Select dropdowns (Month / Day / Year)
- Under-16 error message and return-to-sign-in link
- Route: `/signup/dob`
