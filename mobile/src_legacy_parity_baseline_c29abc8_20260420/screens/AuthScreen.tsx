import { useState } from "react";
import { Alert, Linking, Platform, Pressable, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useNavigation } from "@react-navigation/native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Header } from "../components/Header";
import { InputField } from "../components/InputField";
import { CTAButton } from "../components/CTAButton";
import { HText } from "../components/HText";
import { COLORS, LAYOUT } from "../theme/tokens";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";
import { SUPPORT_EMAIL } from "../lib/support";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  // Contract: phone required at signup (DB enforces profiles_phone_required).
  phone: z.string().regex(/^\+?[1-9]\\d{7,14}$/, "Enter a valid phone number (E.164)"),
});

type Form = {
  email: string;
  password: string;
  phone?: string;
};

export function AuthScreen() {
  const { appleSignInAvailable, signInWithApple } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const navigation = useNavigation();

  const openSupportEmail = async () => {
    const supportUrl = `mailto:${SUPPORT_EMAIL}`;
    const supported = await Linking.canOpenURL(supportUrl);
    if (!supported) {
      Alert.alert("Support unavailable", `Please email ${SUPPORT_EMAIL}.`);
      return;
    }
    await Linking.openURL(supportUrl);
  };

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<Form>({
    resolver: zodResolver(mode === "signup" ? signUpSchema : signInSchema),
    mode: "onChange",
    defaultValues: { email: "", password: "", phone: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password, phone }) => {
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!consent) {
          Alert.alert("Agreement required", "Please agree to the Terms of Service and Privacy Policy to continue.");
          return;
        }
        const acceptedAt = new Date().toISOString();
        const res = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              phone,
              consent_terms_privacy_at: acceptedAt,
              consent_version: "v2.0",
            },
          },
        });
        if (res.error) throw res.error;
        // Best-effort consent audit log when a session exists.
        if (res.data?.user?.id) {
          try {
            await supabase.from("consent_logs").insert({
              user_id: res.data.user.id,
              consent_type: "terms_privacy",
              consent_version: "v2.0",
              accepted_at: acceptedAt,
              metadata: { source: "mobile_signup" },
            });
          } catch {
            // best-effort only
          }
        }
        Alert.alert("Check your email", "Confirm your email to finish signup.");
      } else {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) throw res.error;
        const uid = res.data?.user?.id;
        if (uid) {
          await supabase.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", uid);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      Alert.alert("Auth error", msg);
    } finally {
      setBusy(false);
    }
  });

  const handleAppleSignIn = async () => {
    setBusy(true);
    try {
      const result = await signInWithApple();
      if (!result.ok && result.error !== "Sign in canceled.") {
        Alert.alert("Auth error", result.error ?? "Apple sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />
      <View style={{ paddingHorizontal: LAYOUT.sectionPaddingH, paddingVertical: LAYOUT.sectionPaddingV, gap: 12 }}>
        <HText variant="heading" style={{ fontSize: 18, fontWeight: "800" }}>
          {mode === "signin" ? "Welcome back" : "Create account"}
        </HText>

        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField label="Email" placeholder="Email" value={value} onChangeText={onChange} autoCapitalize="none" error={error?.message} />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField
              label="Password"
              placeholder="Password"
              value={value}
              onChangeText={onChange}
              secureTextEntry
              autoCapitalize="none"
              error={error?.message}
            />
          )}
        />
        {mode === "signup" ? (
          <Controller
            control={control}
            name="phone"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <InputField
                label="Phone"
                placeholder="+852..."
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                error={error?.message}
              />
            )}
          />
        ) : null}

        {mode === "signup" ? (
          <Pressable
            onPress={() => setConsent((v) => !v)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: consent ? COLORS.brandBlue : `${COLORS.brandText}40`,
              backgroundColor: consent ? `${COLORS.brandBlue}10` : COLORS.white,
            }}
          >
            <HText variant="body" style={{ color: COLORS.brandText, fontWeight: "700" }}>
              {consent ? "Checked" : "Unchecked"}: I have read and agree to the Terms of Service and Privacy Policy.
            </HText>
          </Pressable>
        ) : null}

        <CTAButton
          title={busy ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
          disabled={!isValid || busy || (mode === "signup" && !consent)}
          onPress={onSubmit}
        />

        {Platform.OS === "ios" && appleSignInAvailable ? (
          <View style={{ gap: 8 }}>
            <HText variant="meta" style={{ textAlign: "center", color: COLORS.brandSubtext }}>
              or
            </HText>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={mode === "signin"
                ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={{ width: "100%", height: 50 }}
              onPress={handleAppleSignIn}
            />
          </View>
        ) : null}

        <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ paddingVertical: 8 }}>
          <HText variant="body" style={{ textAlign: "center", color: COLORS.brandBlue, fontWeight: "700" }}>
            {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
          </HText>
        </Pressable>

        <HText
          variant="meta"
          style={{
            marginTop: 4,
            textAlign: "center",
            color: COLORS.brandSubtext,
            lineHeight: 16,
          }}
        >
          By continuing, you agree to huddle's{" "}
          <HText
            variant="meta"
            onPress={() => navigation.navigate("Terms" as never)}
            style={{ color: COLORS.brandBlue, textDecorationLine: "underline" }}
          >
            Terms
          </HText>{" "}
          and{" "}
          <HText
            variant="meta"
            onPress={() => navigation.navigate("Privacy" as never)}
            style={{ color: COLORS.brandBlue, textDecorationLine: "underline" }}
          >
            Privacy Policy
          </HText>{" "}
          <HText
            variant="meta"
            onPress={openSupportEmail}
            style={{ color: COLORS.brandBlue, textDecorationLine: "underline" }}
          >
            Need help?
          </HText>
          .
        </HText>
      </View>
    </View>
  );
}
