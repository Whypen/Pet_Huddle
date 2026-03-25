/**
 * SignupDob — C.5  Step 1 of 4
 * Date-of-birth selector. Uses SignupShell for layout + animations.
 */

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { dobSchema, isAtLeast13, isNotFuture, isValidDate } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui";
import { SignupShell } from "@/components/signup/SignupShell";
import signupDobImg from "@/assets/Sign up/Signup_DOB.png";

// ─── Helpers (unchanged from original) ───────────────────────────────────────

type DobForm = { dob_day: string; dob_month: string; dob_year: string };

const pad2 = (value: string) => value.padStart(2, "0");

const isAtLeast16FromDate = (value: string) => {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  const age = m < 0 || (m === 0 && now.getDate() < d.getDate()) ? years - 1 : years;
  return age >= 16;
};

const fromStoredDob = (value: string) => {
  if (!value) return { dob_day: "", dob_month: "", dob_year: "" };
  if (value.includes("-")) {
    const [yyyy, mm, dd] = value.split("-");
    if (!yyyy || !mm || !dd) return { dob_day: "", dob_month: "", dob_year: "" };
    return { dob_day: pad2(dd), dob_month: pad2(mm), dob_year: yyyy };
  }
  if (value.includes("/")) {
    const [p1, p2, p3] = value.split("/");
    if (!p1 || !p2 || !p3) return { dob_day: "", dob_month: "", dob_year: "" };
    let mm = p1;
    let dd = p2;
    if (Number(p1) > 12 && Number(p2) <= 12) { dd = p1; mm = p2; }
    return { dob_day: pad2(dd), dob_month: pad2(mm), dob_year: p3 };
  }
  return { dob_day: "", dob_month: "", dob_year: "" };
};

const monthOptions = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Component ────────────────────────────────────────────────────────────────

const FORM_ID = "signup-dob-form";

const SignupDob = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();
  const { user } = useAuth();
  const [isExiting, setIsExiting] = useState(false);

  const goTo = (to: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(to), 180);
  };

  const {
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<DobForm>({
    resolver: zodResolver(dobSchema),
    mode: "onChange",
    defaultValues: fromStoredDob(data.dob || ""),
  });

  const dobDay   = watch("dob_day");
  const dobMonth = watch("dob_month");
  const dobYear  = watch("dob_year");
  const allSelected = Boolean(dobDay && dobMonth && dobYear);
  const assembledDob = allSelected ? `${dobYear}-${pad2(dobMonth)}-${pad2(dobDay)}` : "";

  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - 13;
  const yearOptions = useMemo(
    () => Array.from({ length: maxYear - 1900 + 1 }, (_, i) => maxYear - i),
    [maxYear],
  );

  const isCalendarValid = allSelected ? isValidDate(assembledDob) : false;
  const isFutureValid   = allSelected ? isNotFuture(assembledDob) : false;
  const isUnder13       = allSelected && isCalendarValid && isFutureValid ? !isAtLeast13(assembledDob) : false;
  const isUnder16But13  = allSelected && isCalendarValid && isFutureValid && !isUnder13 ? !isAtLeast16FromDate(assembledDob) : false;
  const isInvalidDate   = allSelected ? !isCalendarValid || !isFutureValid : false;
  const dobError = isUnder13
    ? "You must be at least 13 years old to use Huddle."
    : isInvalidDate
      ? "Invalid date"
      : errors.dob_day?.message;
  const canContinue = allSelected && isCalendarValid && isFutureValid && !isUnder13;

  const fieldErrorClass = dobError ? "border-red-500 focus:border-red-500" : "";

  const onSubmit = () => {
    if (!canContinue) return;
    update({ dob: assembledDob });
    // OAuth users (Google/Apple) are already authenticated — skip credentials
    // and go straight to set-profile. Email signup users continue normally.
    goTo(user ? "/set-profile" : "/signup/credentials");
  };

  return (
    <SignupShell
      step={1}
      onBack={() => goTo("/auth")}
      isExiting={isExiting}
      cta={
        <Button
          variant="primary"
          type="submit"
          form={FORM_ID}
          disabled={!canContinue}
          className="w-full h-12"
        >
          Continue
        </Button>
      }
    >
      {/* Hero illustration */}
      <img
        src={signupDobImg}
        alt=""
        aria-hidden
        className="w-full object-contain -mt-2 mb-6"
      />

      {/* Headline */}
      <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
        When were you born?
      </h1>

      {/* Body copy */}
      <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
        Huddle is a cozy corner where you can{" "}
        <strong className="font-[600] text-[#424965]">Discover</strong>{" "}
        pet lovers, use{" "}
        <strong className="font-[600] text-[#424965]">Social</strong>{" "}
        to share thoughts, and{" "}
        <strong className="font-[600] text-[#424965]">Chat</strong>{" "}
        directly with trusted friends, nannies, groomers, and vets.
      </p>
      <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
        This helps keep our community safe and trusted for everyone.
      </p>

      {/* Form */}
      <form
        id={FORM_ID}
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-6"
        noValidate
      >
        <div>
          <label className="text-[13px] font-[500] text-[#424965] mb-2 block">
            Date of birth
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Controller
              control={control}
              name="dob_month"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={fieldErrorClass} style={{ fontSize: "16px" }}>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[260px] overflow-y-auto">
                    {monthOptions.map((label, i) => {
                      const month = i + 1;
                      return (
                        <SelectItem key={month} value={pad2(String(month))}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            />
            <Controller
              control={control}
              name="dob_day"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={fieldErrorClass} style={{ fontSize: "16px" }}>
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[260px] overflow-y-auto">
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      return (
                        <SelectItem key={day} value={pad2(String(day))}>
                          {day}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            />
            <Controller
              control={control}
              name="dob_year"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={fieldErrorClass} style={{ fontSize: "16px" }}>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[260px] overflow-y-auto">
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {/* Privacy reassurance */}
          <p className="text-[12px] text-[rgba(74,73,101,0.55)] mt-3">
            Don't worry— your full birthday is kept safe with us.
          </p>

          {dobError && (
            <p className="text-[12px] text-[#EF4444] mt-2" aria-live="polite">
              {dobError}
            </p>
          )}
          {!dobError && isUnder16But13 && (
            <p className="text-[12px] text-[rgba(74,73,101,0.55)] mt-2" aria-live="polite">
              You must be 16+ to access Discover feature on Chats.
            </p>
          )}
        </div>

        {/* Under-13 return link (body, not CTA bar) */}
        {isUnder13 && (
          <button
            type="button"
            onClick={() => goTo("/auth")}
            className="w-full text-[15px] font-[400] text-[rgba(74,73,101,0.55)] hover:text-[#424965] transition-colors duration-150 min-h-[44px]"
          >
            Return to Sign In
          </button>
        )}
      </form>
    </SignupShell>
  );
};

export default SignupDob;
