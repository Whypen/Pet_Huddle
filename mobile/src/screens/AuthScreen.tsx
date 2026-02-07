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

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type Form = z.infer<typeof schema>;

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
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    SecureStore.getItemAsync(BIOMETRIC_PREF_KEY)
      .then((v) => setBiometricsEnabled(v === "true"))
      .catch(() => setBiometricsEnabled(false));
  }, []);

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!consent) {
          Alert.alert("Agreement required", "Please agree to the Terms of Service and Privacy Policy to continue.");
          return;
        }
        const res = await supabase.auth.signUp({ email, password });
        if (res.error) throw res.error;
        Alert.alert("Check your email", "Confirm your email to finish signup.");
      } else {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) throw res.error;
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
