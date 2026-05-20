import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { InputField } from "../components/InputField";
import { DateField } from "../components/DateField";
import { SelectField } from "../components/SelectField";
import { CTAButton } from "../components/CTAButton";
import { COLORS, LAYOUT } from "../theme/tokens";
import { useAuth } from "../contexts/useAuth";
import { yearsBetween } from "../lib/dates";
import { supabase } from "../lib/supabase";

const genderOptions = [
  { label: "Male", value: "Male" },
  { label: "Female", value: "Female" },
  { label: "Non-binary", value: "Non-binary" },
  { label: "Prefer not to say", value: "Prefer not to say" },
] as const;

type Gender = (typeof genderOptions)[number]["value"];

const orientationOptions = [
  { label: "Straight", value: "Straight" },
  { label: "Gay", value: "Gay" },
  { label: "Lesbian", value: "Lesbian" },
  { label: "Bisexual", value: "Bisexual" },
  { label: "Asexual", value: "Asexual" },
  { label: "Pansexual", value: "Pansexual" },
  { label: "Queer", value: "Queer" },
  { label: "Questioning", value: "Questioning" },
  { label: "Prefer not to say", value: "Prefer not to say" },
] as const;

type Orientation = (typeof orientationOptions)[number]["value"];

const languageOptions = [
  { label: "English", value: "English" },
  { label: "Cantonese", value: "Cantonese" },
  { label: "Mandarin", value: "Mandarin" },
  { label: "Japanese", value: "Japanese" },
  { label: "Korean", value: "Korean" },
  { label: "Others", value: "Others" },
] as const;

type Language = (typeof languageOptions)[number]["value"];

const schema = z
  .object({
    legalName: z.string().min(1, "Legal Name is required"),
    displayName: z.string().min(1, "Name is required"),
    userId: z.string().length(10, "User ID must be 10 digits"),
    phone: z.string().optional(),
    dob: z.date().optional(),
    gender: z.enum(genderOptions.map((o) => o.value) as [Gender, ...Gender[]]),
    orientation: z.enum(orientationOptions.map((o) => o.value) as [Orientation, ...Orientation[]]),
    languages: z.array(z.string()).default([]),
    languageOther: z.string().optional(),
  })
  .refine((d) => d.dob instanceof Date, { path: ["dob"], message: "DOB is required" });

type Form = z.input<typeof schema>;

async function compressToUnder500KB(uri: string) {
  // Start with a reasonable size; iteratively reduce quality if needed.
  let quality = 0.8;
  let current = uri;
  for (let i = 0; i < 8; i += 1) {
    const manip = await ImageManipulator.manipulateAsync(
      current,
      [{ resize: { width: 1280 } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    current = manip.uri;
    const bytes = (await (await fetch(current)).arrayBuffer()).byteLength;
    if (bytes <= 500 * 1024) return current;
    quality = Math.max(0.25, quality - 0.1);
  }
  return current;
}

export function UserProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const verified = profile?.verification_status === "Verified";
  const initialLegalName = useRef<string>(profile?.legal_name ?? "");
  const [legalNameConfirmed, setLegalNameConfirmed] = useState(false);

  const [albumLocalUris, setAlbumLocalUris] = useState<string[]>([]);
  const [albumRemotePaths, setAlbumRemotePaths] = useState<string[]>(profile?.social_album ?? []);
  const [albumRemoteUris, setAlbumRemoteUris] = useState<string[]>([]);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);
  const carouselRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setAlbumRemotePaths(profile?.social_album ?? []);
  }, [profile?.social_album]);

  useEffect(() => {
    (async () => {
      if (!albumRemotePaths.length || !profile?.id) {
        setAlbumRemoteUris([]);
        return;
      }
      const urls: string[] = [];
      for (const path of albumRemotePaths.slice(0, 5)) {
        const signed = await supabase.storage.from("social_album").createSignedUrl(path, 60 * 60);
        if (!signed.error && signed.data?.signedUrl) urls.push(signed.data.signedUrl);
      }
      setAlbumRemoteUris(urls);
    })();
  }, [albumRemotePaths, profile?.id]);

  const maxDob = useMemo(() => {
    // UAT: age 13-130 range
    const now = new Date();
    const max = new Date(now);
    max.setFullYear(now.getFullYear() - 13);
    return max;
  }, []);
  const minDob = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setFullYear(now.getFullYear() - 130);
    return min;
  }, []);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isValid },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      legalName: profile?.legal_name ?? "",
      displayName: profile?.display_name ?? "",
      userId: (profile?.user_id ?? "").padStart(10, "0").slice(0, 10),
      phone: profile?.phone ?? "",
      dob: profile?.dob ? new Date(profile.dob) : undefined,
      gender: "Prefer not to say" as Gender,
      orientation: "Prefer not to say" as Orientation,
      languages: [],
      languageOther: "",
    },
  });

  useEffect(() => {
    initialLegalName.current = profile?.legal_name ?? "";
    setLegalNameConfirmed(false);
  }, [profile?.legal_name]);

  const dob = watch("dob");
  const age = dob ? yearsBetween(dob) : null;

  const pickAlbumImage = async () => {
    const totalCount = Math.min(5, albumRemotePaths.length) + albumLocalUris.length;
    if (totalCount >= 5) {
      Alert.alert("Max 5 images", "Remove one image to add another.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo access to upload social album images.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (res.canceled) return;
    const uri = res.assets[0]?.uri;
    if (!uri) return;

    const compressedUri = await compressToUnder500KB(uri);
    setAlbumLocalUris((prev) => [...prev, compressedUri].slice(0, 5));

    // Persist: upload to Supabase storage and update profiles.social_album.
    try {
      const fileName = `album_${Date.now()}.jpg`;
      const arrayBuffer = await (await fetch(compressedUri)).arrayBuffer();
      const upload = await supabase.storage.from("social_album").upload(`${profile?.id}/${fileName}`, arrayBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upload.error) throw upload.error;
      const path = upload.data.path;
      const updated = [...(profile?.social_album ?? []), path].slice(0, 5);
      const upd = await supabase.from("profiles").update({ social_album: updated }).eq("id", profile?.id ?? "");
      if (upd.error) throw upd.error;
      await refreshProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to upload";
      Alert.alert("Upload failed", msg);
    }
  };

  const addLanguage = (lang: string) => {
    const current = watch("languages") ?? [];
    if (current.includes(lang)) return;
    const next = [...current, lang].slice(0, 10);
    setValue("languages", next, { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    if (verified) {
      // UAT: confirmed alert on edit attempt
      Alert.alert("Verified profile", "Some fields are locked after verification.");
    }
    try {
      if (!values.dob) {
        Alert.alert("DOB required", "Please select your date of birth.");
        return;
      }
      const upd = await supabase
        .from("profiles")
        .update({
          legal_name: values.legalName,
          display_name: values.displayName,
          phone: values.phone ?? null,
          dob: values.dob.toISOString().slice(0, 10),
        })
        .eq("id", profile?.id ?? "");
      if (upd.error) throw upd.error;
      await refreshProfile();
      Alert.alert("Saved", "Profile updated.");
      console.log("user_profile_values", values);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      Alert.alert("Save failed", msg);
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />
      <ScrollView contentContainerStyle={{ padding: LAYOUT.sectionPaddingH, gap: 12, paddingBottom: 24 }}>
        <HText variant="heading" style={{ fontSize: 16, fontWeight: "800" }}>
          User Profile
        </HText>

        <Controller
          control={control}
          name="legalName"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField
              label="Legal Name"
              placeholder="Legal Name"
              value={value}
              onChangeText={(t) => {
                if (verified) {
                  Alert.alert("Verified", "Legal Name cannot be edited after verification.");
                  return;
                }
                if (!legalNameConfirmed && t.trim() !== (initialLegalName.current ?? "").trim()) {
                  Alert.alert(
                    "Confirm Legal Name Change",
                    "Legal Name changes may affect verification. Continue?",
                    [
                      { text: "Cancel", style: "cancel", onPress: () => onChange(initialLegalName.current) },
                      {
                        text: "Continue",
                        style: "default",
                        onPress: () => {
                          setLegalNameConfirmed(true);
                          onChange(t);
                        },
                      },
                    ]
                  );
                  return;
                }
                onChange(t);
              }}
              disabled={verified}
              error={error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="displayName"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField label="Display Name" placeholder="Name" value={value} onChangeText={onChange} error={error?.message} />
          )}
        />

        <Controller
          control={control}
          name="userId"
          render={({ field: { value }, fieldState: { error } }) => (
            <InputField label="User ID" placeholder="User ID" value={value} editable={false} disabled error={error?.message} />
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({ field: { value, onChange } }) => (
            <InputField label="Phone No." placeholder="Phone No." value={value ?? ""} onChangeText={onChange} disabled={verified} />
          )}
        />

        <Controller
          control={control}
          name="dob"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <View style={{ gap: 6 }}>
              <DateField
                label="DOB"
                value={value ?? null}
                onChange={(d) => {
                  if (verified) {
                    Alert.alert("Verified", "DOB cannot be edited after verification.");
                    return;
                  }
                  onChange(d ?? undefined);
                }}
                minimumDate={minDob}
                maximumDate={maxDob}
                disabled={verified}
                error={error?.message}
              />
              {value ? (
                <HText variant="meta" style={{ color: COLORS.brandSubtext }}>
                  Age: {age} years
                </HText>
              ) : null}
            </View>
          )}
        />

        <HText variant="heading" style={{ fontSize: 14, fontWeight: "800" }}>
          Social Album
        </HText>
        <HText variant="meta" style={{ color: COLORS.brandSubtext }}>
          Up to 5 images. Images are compressed under 500KB before upload.
        </HText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {albumRemoteUris.map((uri, idx) => (
            <Pressable
              key={`remote_${uri}`}
              onPress={() => {
                setAlbumIndex(idx);
                setAlbumOpen(true);
              }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: `${COLORS.brandText}33`,
                backgroundColor: "rgba(66,73,101,0.06)",
                overflow: "hidden",
              }}
            >
              <Image source={{ uri }} style={{ width: 72, height: 72 }} />
            </Pressable>
          ))}
          {albumLocalUris.map((uri, idx) => {
            const index = albumRemoteUris.length + idx;
            return (
              <Pressable
                key={`local_${uri}`}
                onPress={() => {
                  setAlbumIndex(index);
                  setAlbumOpen(true);
                }}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${COLORS.brandText}33`,
                  backgroundColor: "rgba(66,73,101,0.06)",
                  overflow: "hidden",
                }}
              >
                <Image source={{ uri }} style={{ width: 72, height: 72 }} />
              </Pressable>
            );
          })}
          <Pressable
            onPress={pickAlbumImage}
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandBlue}55`,
              backgroundColor: "rgba(33,69,207,0.06)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HText variant="body" style={{ color: COLORS.brandBlue, fontWeight: "800" }}>
              + Add
            </HText>
          </Pressable>
        </View>

        <Modal visible={albumOpen} transparent animationType="fade" onRequestClose={() => setAlbumOpen(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }}>
            {/* UAT: close top-right */}
            <Pressable
              onPress={() => setAlbumOpen(false)}
              hitSlop={8}
              style={{ position: "absolute", top: 48, right: 16, zIndex: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="close" size={24} color={COLORS.white} />
            </Pressable>

              <ScrollView
                ref={(r) => {
                  carouselRef.current = r;
                }}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
              contentOffset={{ x: albumIndex * 360, y: 0 }}
                onMomentumScrollEnd={(e) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const idx = Math.round(x / 360);
                  setAlbumIndex(idx);
                }}
                contentContainerStyle={{ paddingTop: 120, paddingHorizontal: 0 }}
              >
              {[...albumRemoteUris, ...albumLocalUris].slice(0, 5).map((uri) => (
                <View key={uri} style={{ width: 360, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
                  <Image source={{ uri }} style={{ width: 328, height: 420, borderRadius: 16 }} resizeMode="cover" />
                </View>
              ))}
            </ScrollView>

            <HText variant="meta" style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 12 }}>
              {albumIndex + 1} / {Math.min(5, albumRemoteUris.length + albumLocalUris.length)}
            </HText>
          </View>
        </Modal>

        <Controller
          control={control}
          name="gender"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <SelectField<Gender>
              label="Gender"
              value={value}
              options={genderOptions.map((o) => ({ label: o.label, value: o.value }))}
              onChange={(v) => onChange(v)}
              error={error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="orientation"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <SelectField<Orientation>
              label="Orientation"
              value={value}
              options={orientationOptions.map((o) => ({ label: o.label, value: o.value }))}
              onChange={(v) => onChange(v)}
              error={error?.message}
            />
          )}
        />

        {/* UAT: Physical remove weight field (not present) */}

        <Controller
          control={control}
          name="languages"
          render={({ field: { value } }) => (
            <View style={{ gap: 8 }}>
              <SelectField<Language>
                label="Languages"
                value={null}
                options={languageOptions.map((o) => ({ label: o.label, value: o.value }))}
                onChange={(v) => {
                  if (v === "Others") return;
                  addLanguage(v);
                }}
              />

              <Controller
                control={control}
                name="languageOther"
                render={({ field: { value: other, onChange } }) => (
                  <View style={{ gap: 8 }}>
                    <InputField label="Others" placeholder="Type language" value={other ?? ""} onChangeText={onChange} />
                    <Pressable
                      onPress={() => {
                        const v = (other ?? "").trim();
                        if (!v) return;
                        addLanguage(v);
                        setValue("languageOther", "", { shouldValidate: true });
                      }}
                      style={({ pressed }) => ({
                        height: 44,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: `${COLORS.brandBlue}55`,
                        backgroundColor: pressed ? "rgba(33,69,207,0.08)" : COLORS.white,
                        alignItems: "center",
                        justifyContent: "center",
                      })}
                    >
                      <HText variant="body" style={{ color: COLORS.brandBlue, fontWeight: "900" }}>
                        Add Language
                      </HText>
                    </Pressable>
                  </View>
                )}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(value ?? []).map((lang) => (
                  <Pressable
                    key={lang}
                    onPress={() => {
                      const next = (value ?? []).filter((x) => x !== lang);
                      setValue("languages", next, { shouldValidate: true });
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: `${COLORS.brandText}33`,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: "rgba(66,73,101,0.06)",
                    }}
                  >
                    <HText variant="meta" style={{ fontSize: 12, fontWeight: "700" }}>
                      {lang} ×
                    </HText>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />

        <CTAButton title="Save" disabled={!isValid} onPress={onSubmit} onInvalidPress={() => Alert.alert("Fix errors", "Please correct fields in red.")} />
      </ScrollView>
    </View>
  );
}
