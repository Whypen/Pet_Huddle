import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { dobSchema, isAtLeast16, isValidDate } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type DobForm = { dob: string };

const formatDob = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const parts = [] as string[];
  if (digits.length >= 2) parts.push(digits.slice(0, 2));
  if (digits.length >= 4) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4));
  return parts.join("/");
};

const SignupDob = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();
  const errorRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<DobForm>({
    resolver: zodResolver(dobSchema),
    mode: "onChange",
    defaultValues: { dob: data.dob || "" },
  });

  const dob = watch("dob");
  const isUnder16 = useMemo(() => (dob && isValidDate(dob) ? !isAtLeast16(dob) : false), [dob]);

  useEffect(() => {
    if (errors.dob && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [errors.dob]);

  const onSubmit = (values: DobForm) => {
    update({ dob: values.dob });
    navigate("/signup/name");
  };

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/auth")} className="p-2 -ml-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">1 of 4</div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-muted">
        <div className="h-2 w-1/4 rounded-full bg-brandBlue" />
      </div>

      <h1 className="mt-6 text-xl font-bold text-brandText">What is your date of birth?</h1>
      <p className="text-sm text-muted-foreground">We use this to verify your age</p>

      {isUnder16 && (
        <div ref={errorRef} className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          Some functions in this app are only available to users above 16 years old
        </div>
      )}
      {errors.dob && !isUnder16 && (
        <div ref={errorRef} className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" aria-live="polite">
          {errors.dob.message}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Date of birth</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              inputMode="numeric"
              placeholder="DD / MM / YYYY"
              className={`h-9 pl-9 ${errors.dob ? "border-red-500" : ""}`}
              {...register("dob")}
              onChange={(e) => setValue("dob", formatDob(e.target.value), { shouldValidate: true })}
            />
          </div>
          {errors.dob && <p className="text-xs text-red-500 mt-1">{errors.dob.message}</p>}
        </div>

        <Button type="submit" className="w-full h-10" disabled={!isValid || isUnder16}>
          Continue
        </Button>

        {isUnder16 && (
          <Button type="button" variant="outline" className="w-full h-10" onClick={() => navigate("/auth")}>
            Return to Sign In
          </Button>
        )}
      </form>
    </div>
  );
};

export default SignupDob;
