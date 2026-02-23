import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { dobSchema, isAtLeast16, isNotFuture, isValidDate } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DobForm = { dob_day: string; dob_month: string; dob_year: string };

const pad2 = (value: string) => value.padStart(2, "0");

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
    if (Number(p1) > 12 && Number(p2) <= 12) {
      dd = p1;
      mm = p2;
    }
    return { dob_day: pad2(dd), dob_month: pad2(mm), dob_year: p3 };
  }
  return { dob_day: "", dob_month: "", dob_year: "" };
};

const monthOptions = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SignupDob = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();

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

  const dobDay = watch("dob_day");
  const dobMonth = watch("dob_month");
  const dobYear = watch("dob_year");
  const allSelected = Boolean(dobDay && dobMonth && dobYear);
  const assembledDob = allSelected ? `${dobYear}-${pad2(dobMonth)}-${pad2(dobDay)}` : "";
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - 16;
  const yearOptions = useMemo(
    () => Array.from({ length: maxYear - 1900 + 1 }, (_, index) => maxYear - index),
    [maxYear],
  );
  const isCalendarValid = allSelected ? isValidDate(assembledDob) : false;
  const isFutureValid = allSelected ? isNotFuture(assembledDob) : false;
  const isUnder16 = allSelected && isCalendarValid && isFutureValid ? !isAtLeast16(assembledDob) : false;
  const isInvalidDate = allSelected ? !isCalendarValid || !isFutureValid : false;
  const dobError = isUnder16
    ? "Some functions in this app are only available to users above 16 years old"
    : isInvalidDate
      ? "Invalid date"
      : errors.dob_day?.message;
  const canContinue = allSelected && isCalendarValid && isFutureValid && !isUnder16;

  const onSubmit = () => {
    if (!canContinue) return;
    update({ dob: assembledDob });
    navigate("/signup/credentials");
  };

  const fieldErrorClass = dobError ? "border-red-500 focus:border-red-500" : "";

  return (
    <div className="min-h-screen bg-white px-6">
      {/* Navigation + step indicator */}
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/auth")} className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-brandText" strokeWidth={1.75} />
        </button>
        <span className="text-helper text-brandSubtext/60">Step 1 of 4</span>
      </div>

      {/* Progress bar — thin */}
      <div className="mt-3 h-1 w-full rounded-full bg-gray-100">
        <div className="h-1 w-1/4 rounded-full bg-brandBlue transition-all" />
      </div>

      {/* Hero block */}
      <div className="mt-8 space-y-2">
        <h1 className="font-display text-[28px] leading-[1.1] font-semibold text-brandText">
          When were you born?
        </h1>
        <p className="text-base text-brandSubtext/70 leading-relaxed">
          We use this to verify your age.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6" noValidate>
        <div>
          <label className="text-sub font-medium text-brandText mb-2 block">Date of birth</label>
          <div className="grid grid-cols-3 gap-2">
            <Controller
              control={control}
              name="dob_month"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={fieldErrorClass}>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[260px] overflow-y-auto">
                    {monthOptions.map((label, index) => {
                      const month = index + 1;
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
                  <SelectTrigger className={fieldErrorClass}>
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[260px] overflow-y-auto">
                    {Array.from({ length: 31 }, (_, index) => {
                      const day = index + 1;
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
                  <SelectTrigger className={fieldErrorClass}>
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
          {dobError && <p className="text-helper text-brandError mt-2" aria-live="polite">{dobError}</p>}
        </div>

        <Button type="submit" className="w-full neu-primary" disabled={!canContinue}>
          Continue
        </Button>

        {isUnder16 && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
            Return to Sign In
          </Button>
        )}
      </form>
    </div>
  );
};

export default SignupDob;
