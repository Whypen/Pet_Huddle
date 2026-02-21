import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { nameSchema } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type NameForm = { display_name: string; social_id: string };

const SignupName = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();
  const errorRef = useRef<HTMLDivElement | null>(null);
  const [socialIdAvailability, setSocialIdAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    mode: "onChange",
    defaultValues: {
      display_name: data.display_name || "",
      social_id: data.social_id || ""
    },
  });

  useEffect(() => {
    if (errors.display_name || errors.social_id) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [errors.display_name, errors.social_id]);

  const displayName = watch("display_name") || "";
  const socialId = watch("social_id") || "";

  // Lowercase-only enforcement + availability check
  useEffect(() => {
    const normalized = socialId.toLowerCase().replace(/\s/g, "");

    // Clear debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    // Reset if empty or invalid length
    if (!normalized || normalized.length < 6 || normalized.length > 20) {
      setSocialIdAvailability("idle");
      return;
    }

    // Check format
    if (!/^[a-z0-9._]+$/.test(normalized)) {
      setSocialIdAvailability("idle");
      return;
    }

    // Debounce availability check
    setSocialIdAvailability("checking");
    debounceTimer.current = setTimeout(async () => {
      try {
        const { data: isTaken, error } = await supabase.rpc("is_social_id_taken", { candidate: normalized });
        if (error) throw error;
        setSocialIdAvailability(isTaken ? "taken" : "available");
      } catch (err) {
        console.error("Availability check failed:", err);
        setSocialIdAvailability("idle");
      }
    }, 400);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [socialId]);

  const onSubmit = (values: NameForm) => {
    // Final validation: must be available
    if (socialIdAvailability !== "available") {
      return;
    }
    const normalizedSocialId = values.social_id.toLowerCase().replace(/\s/g, "");
    update({ display_name: values.display_name, social_id: normalizedSocialId });
    navigate("/signup/verify");
  };

  const canContinue = isValid && socialIdAvailability === "available";

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/signup/credentials")} className="p-2 -ml-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">3 of 4</div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-muted">
        <div className="h-2 w-3/4 rounded-full bg-brandBlue" />
      </div>

      <h1 className="mt-6 text-xl font-bold text-brandText">What would you like us to call you?</h1>
      <p className="text-sm text-muted-foreground">This is your display name in the community</p>

      {(errors.display_name || errors.social_id) && (
        <div ref={errorRef} className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" aria-live="polite">
          {errors.display_name?.message || errors.social_id?.message}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Display name</label>
          <Input
            placeholder="Enter your name"
            className={`h-10 ${errors.display_name ? "border-red-500" : ""}`}
            {...register("display_name")}
          />
          <div className="text-xs text-muted-foreground text-right mt-1">{displayName.length}/30</div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">What is your social ID on huddle?</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">@</div>
            <Input
              placeholder="yourid"
              className={`h-10 pl-7 pr-9 ${errors.social_id || socialIdAvailability === "taken" ? "border-red-500" : ""}`}
              {...register("social_id", {
                onChange: (e) => {
                  e.target.value = e.target.value.toLowerCase().replace(/\s/g, "");
                },
              })}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {socialIdAvailability === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {socialIdAvailability === "available" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              {socialIdAvailability === "taken" && <XCircle className="h-4 w-4 text-red-500" />}
            </div>
          </div>
          <div className="text-xs text-right mt-1">{socialId.length}/20</div>
          {errors.social_id && <p className="text-xs text-red-500 mt-1">{errors.social_id.message}</p>}
          {!errors.social_id && socialIdAvailability === "taken" && (
            <p className="text-xs text-red-500 mt-1">This ID is already taken.</p>
          )}
          {!errors.social_id && socialIdAvailability === "available" && (
            <p className="text-xs text-green-600 mt-1">Available</p>
          )}
        </div>

        <Button type="submit" className="w-full h-10" disabled={!canContinue}>
          Continue
        </Button>
        {!canContinue && (
          <p className="text-xs text-muted-foreground">
            {socialIdAvailability === "checking"
              ? "Checking availability..."
              : socialIdAvailability === "taken"
                ? "This social ID is already taken"
                : socialIdAvailability === "idle"
                  ? "Enter a valid social ID (6-20 chars, lowercase, numbers, dot, underscore)"
                  : "Complete all fields to continue"}
          </p>
        )}
      </form>
    </div>
  );
};

export default SignupName;
