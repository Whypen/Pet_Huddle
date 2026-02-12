import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { nameSchema } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type NameForm = { display_name: string };

const SignupName = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();
  const errorRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    mode: "onChange",
    defaultValues: { display_name: data.display_name || "" },
  });

  useEffect(() => {
    if (errors.display_name && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [errors.display_name]);

  const value = watch("display_name") || "";

  const onSubmit = (values: NameForm) => {
    update({ display_name: values.display_name });
    navigate("/signup/credentials");
  };

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/signup/dob")} className="p-2 -ml-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">2 of 4</div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-muted">
        <div className="h-2 w-2/4 rounded-full bg-brandBlue" />
      </div>

      <h1 className="mt-6 text-xl font-bold text-brandText">What would you like us to call you?</h1>
      <p className="text-sm text-muted-foreground">This is your display name in the community</p>

      {errors.display_name && (
        <div ref={errorRef} className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" aria-live="polite">
          {errors.display_name.message}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Display name</label>
          <Input
            placeholder="Enter your name"
            className={`h-9 ${errors.display_name ? "border-red-500" : ""}`}
            {...register("display_name")}
          />
          <div className="text-xs text-muted-foreground text-right mt-1">{value.length}/30</div>
        </div>

        <Button type="submit" className="w-full h-10" disabled={!isValid}>
          Continue
        </Button>
      </form>
    </div>
  );
};

export default SignupName;
