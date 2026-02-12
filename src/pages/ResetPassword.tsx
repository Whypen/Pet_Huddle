import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Invalid email format"),
});

type FormData = z.infer<typeof schema>;

const ResetPassword = () => {
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
  });

  const onSubmit = async (values: FormData) => {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) {
      toast.error(error.message || "Failed to send reset link");
      return;
    }
    toast.success("Password reset link sent to your email");
  };

  return (
    <div className="min-h-screen bg-background px-6 pt-10">
      <h1 className="text-xl font-bold text-brandText">Reset Password</h1>
      <p className="text-sm text-muted-foreground">Enter your email to receive a reset link.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
        <Input type="email" className={`h-9 ${errors.email ? "border-red-500" : ""}`} {...register("email")} />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        <Button type="submit" className="w-full h-10" disabled={!isValid}>Send reset link</Button>
      </form>
    </div>
  );
};

export default ResetPassword;
