import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { postPublicFunction } from "@/lib/publicFunctionClient";

type SecureAccountResponse = {
  redirect_url?: string | null;
};

const SecureAccount = () => {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("Securing your account...");

  useEffect(() => {
    const run = async () => {
      const token = String(params.get("token") || "").trim();
      if (!token) {
        setMessage("This secure-account link is missing or expired. Request a password reset to continue.");
        return;
      }

      const { data, error } = await postPublicFunction<SecureAccountResponse>("secure-account", { token });
      const redirectUrl = String(data?.redirect_url || "").trim();
      if (error || !redirectUrl) {
        setMessage("This secure-account link is no longer valid. Request a password reset to continue.");
        return;
      }

      window.location.assign(redirectUrl);
    };

    void run();
  }, [params]);

  return (
    <div className="min-h-svh bg-background px-6 pt-10">
      <h1 className="text-xl font-bold text-brandText">Security check</h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
};

export default SecureAccount;
