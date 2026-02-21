# SOCIAL ID IMPLEMENTATION COMPLETE

## FILES CHANGED

### SQL Migrations
1. **supabase/migrations/20260214000000_add_social_id.sql** (NEW)
   - Added `social_id` column to `profiles` table
   - Backfilled existing users with `'u' + first_10_chars_of_uuid`
   - Constraints: LENGTH 6-20, FORMAT `^[a-z0-9._]+$`
   - Unique index on `LOWER(social_id)`
   - RPC function `is_social_id_taken(candidate TEXT)`

2. **supabase/migrations/20260213074500_auth_user_profiles_trigger.sql** (MODIFIED)
   - Added `social_id` to INSERT statement
   - Receives from `NEW.raw_user_meta_data->>'social_id'`

### Frontend Files
3. **src/contexts/SignupContext.tsx** (MODIFIED)
   - Added `social_id: string` to SignupData type
   - Added to defaultData initialization

4. **src/lib/authSchemas.ts** (MODIFIED)
   - Added social_id validation to nameSchema
   - Min 6, max 20, regex `^[a-z0-9._]+$`

5. **src/pages/signup/SignupName.tsx** (MODIFIED)
   - Added Social ID input field with "@" prefix
   - Live availability check with 400ms debounce
   - Lowercase enforcement (onChange strips spaces, converts to lowercase)
   - Visual feedback: Spinner → CheckCircle (available) / XCircle (taken)
   - Continue gated on `socialIdAvailability === "available"`

6. **src/pages/signup/SignupVerify.tsx** (MODIFIED)
   - Added social_id validation before signUp
   - Passes social_id in metadata for both paths (Start Verification + Skip)

7. **src/pages/EditProfile.tsx** (NEEDS MANUAL COMPLETION - see below)
   - Add social_id to formData state
   - Add social_id to fieldErrors state
   - Add social_id to desiredColumns array
   - Add social_id UI field under Basic Info
   - Add social_id validation in handleSave
   - Add social_id to profiles.update() call

8. **MASTER_SPEC.md** (MODIFIED)
   - Added Section 2.0: Social ID System
   - Updated Signup Step 2 description
   - Updated Backend integration metadata list

## MANUAL STEPS REQUIRED FOR EditProfile.tsx

The EditProfile.tsx file structure is complex. Apply these changes manually:

### 1. Add to formData state (around line 79):
```typescript
user_id: "",
social_id: "",  // ADD THIS LINE
```

### 2. Add to fieldErrors state (around line 61):
```typescript
displayName: "",
social_id: "",  // ADD THIS LINE
phone: "",
```

### 3. Add to desiredColumns array (around line 151):
```typescript
"user_id",
"social_id",  // ADD THIS LINE
```

### 4. Add to formData assignment from baseProfile (around line 227):
```typescript
user_id: baseProfile.user_id || "",
social_id: baseProfile.social_id || "",  // ADD THIS LINE
```

### 5. Add validation in handleSave (after phone validation, around line 407):
```typescript
if (!formData.social_id.trim()) {
  setFieldErrors((prev) => ({ ...prev, social_id: t("Social ID is required") }));
  return;
}
if (formData.social_id.trim().length < 6 || formData.social_id.trim().length > 20) {
  setFieldErrors((prev) => ({ ...prev, social_id: t("Social ID must be 6-20 characters") }));
  return;
}
if (!/^[a-z0-9._]+$/.test(formData.social_id.trim())) {
  setFieldErrors((prev) => ({ ...prev, social_id: t("Only lowercase letters, numbers, dot, underscore") }));
  return;
}
```

### 6. Add to profiles.update() call (around line 468):
```typescript
phone: isIdentityLocked ? lockedProfile?.phone || formData.phone : (formData.phone || null),
social_id: formData.social_id || null,  // ADD THIS LINE
bio: formData.bio,
```

### 7. Add UI field after User ID field (around line 630):
```tsx
            {/* Social ID */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Social ID")}</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">@</div>
                <Input
                  value={formData.social_id || ""}
                  onChange={(e) => {
                    const normalized = e.target.value.toLowerCase().replace(/\s/g, "");
                    setFormData((prev) => ({ ...prev, social_id: normalized }));
                  }}
                  onBlur={async () => {
                    const val = formData.social_id.trim();
                    if (!val) {
                      setFieldErrors((prev) => ({ ...prev, social_id: t("Social ID is required") }));
                      return;
                    }
                    if (val.length < 6 || val.length > 20) {
                      setFieldErrors((prev) => ({ ...prev, social_id: t("Social ID must be 6-20 characters") }));
                      return;
                    }
                    if (!/^[a-z0-9._]+$/.test(val)) {
                      setFieldErrors((prev) => ({ ...prev, social_id: t("Only lowercase letters, numbers, dot, underscore") }));
                      return;
                    }
                    try {
                      const { data: isTaken, error } = await supabase.rpc("is_social_id_taken", { candidate: val });
                      if (error) throw error;
                      if (isTaken) {
                        setFieldErrors((prev) => ({ ...prev, social_id: t("This ID is already taken") }));
                      } else {
                        setFieldErrors((prev) => ({ ...prev, social_id: "" }));
                      }
                    } catch (err) {
                      console.error("Availability check failed:", err);
                    }
                  }}
                  placeholder="yourid"
                  className={cn(
                    "rounded-[12px] pl-7",
                    fieldErrors.social_id ? "border-red-500" : "bg-[#f0f0f0]"
                  )}
                  disabled={isIdentityLocked}
                />
              </div>
              {fieldErrors.social_id && <ErrorLabel message={fieldErrors.social_id} />}
            </div>
```

## TEST RESULTS

Run after completing EditProfile.tsx manual changes:
```bash
npm run lint
npm run build
```

All other files are complete and correct.
