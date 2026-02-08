import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useNavigation } from "@react-navigation/native";
import { Header } from "../components/Header";
import { InputField } from "../components/InputField";
import { CTAButton } from "../components/CTAButton";
import { HText } from "../components/HText";
import { COLORS, LAYOUT } from "../theme/tokens";
import { supabase } from "../lib/supabase";

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

const BIOMETRIC_PREF_KEY = "huddle_biometrics_enabled";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const navigation = useNavigation();

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<Form>({
    resolver: zodResolver(mode === "signup" ? signUpSchema : signInSchema),
    mode: "onChange",
    defaultValues: { email: "", password: "", phone: "" },
  });

  useEffect(() => {
    SecureStore.getItemAsync(BIOMETRIC_PREF_KEY)
      .then((v) => setBiometricsEnabled(v === "true"))
      .catch(() => setBiometricsEnabled(false));
  }, []);

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

  const toggleBiometrics = async () => {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!has || !enrolled) {
        Alert.alert("Biometrics unavailable", "Enable Face ID / Touch ID in system settings first.");
        return;
      }
      const next = !biometricsEnabled;
      setBiometricsEnabled(next);
      await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, next ? "true" : "false");
    } catch {
      // ignore
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

        <Pressable onPress={toggleBiometrics} style={{ paddingVertical: 6 }}>
          <HText variant="body" style={{ color: COLORS.brandText, fontWeight: "600" }}>
            Biometric Login: {biometricsEnabled ? "On" : "Off"}
          </HText>
          <HText variant="meta" style={{ color: COLORS.brandSubtext }}>
            Enables Face ID / Touch ID choice on sign-in.
          </HText>
        </Pressable>

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
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              <Pressable onPress={() => navigation.navigate("Terms" as never)}>
                <HText variant="meta" style={{ color: COLORS.brandBlue, fontWeight: "800", textDecorationLine: "underline" }}>
                  Terms of Service
                </HText>
              </Pressable>
              <Pressable onPress={() => navigation.navigate("Privacy" as never)}>
                <HText variant="meta" style={{ color: COLORS.brandBlue, fontWeight: "800", textDecorationLine: "underline" }}>
                  Privacy Policy
                </HText>
              </Pressable>
            </View>
          </Pressable>
        ) : null}

        <CTAButton
          title={busy ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
          disabled={!isValid || busy || (mode === "signup" && !consent)}
          onPress={onSubmit}
        />

        <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ paddingVertical: 8 }}>
          <HText variant="body" style={{ textAlign: "center", color: COLORS.brandBlue, fontWeight: "700" }}>
            {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
          </HText>
        </Pressable>
      </View>
    </View>
  );
}
