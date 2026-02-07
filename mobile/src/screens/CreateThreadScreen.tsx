import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { InputField } from "../components/InputField";
import { SelectField } from "../components/SelectField";
import { CTAButton } from "../components/CTAButton";
import { COLORS, LAYOUT } from "../theme/tokens";
import { useAuth } from "../contexts/useAuth";
import { supabase } from "../lib/supabase";

const topicOptions = [
  { label: "Dog 🐶", value: "Dog" },
  { label: "Cat 🐱", value: "Cat" },
  { label: "News 📰", value: "News" },
  { label: "Social 💬", value: "Social" },
  { label: "Adoption 🏠", value: "Adoption" },
  { label: "Others ✨", value: "Others" },
] as const;

type Topic = (typeof topicOptions)[number]["value"];

const schema = z.object({
  topic: z.enum(topicOptions.map((o) => o.value) as [Topic, ...Topic[]]),
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});

type Form = z.infer<typeof schema>;

export function CreateThreadScreen() {
  const { user } = useAuth();
  const [remaining, setRemaining] = useState<number | null>(null);

  // UAT: quota display near post button. Backend tier logic lives in full spec.
  const limit = 1;

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      topic: "Dog",
      title: "",
      content: "",
    },
  });

  useEffect(() => {
    (async () => {
      if (!user) return;
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const res = await supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString());
      if (!res.error) {
        const used = res.count ?? 0;
        setRemaining(Math.max(0, limit - used));
      }
    })();
  }, [user]);

  const onSubmit = handleSubmit(async (values) => {
    if (remaining !== null && remaining <= 0) {
      Alert.alert("Quota reached", "Upgrade to Premium for more posts.");
      return;
    }
    Alert.alert("Thread ready", "Valid thread draft. Persistence is wired in the full app backend.");
    console.log("thread_values", values);
  });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />
      <ScrollView contentContainerStyle={{ padding: LAYOUT.sectionPaddingH, gap: 12, paddingBottom: 24 }}>
        <HText variant="heading" style={{ fontSize: 16, fontWeight: "800" }}>
          Create Thread
        </HText>

        <Controller
          control={control}
          name="topic"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <SelectField<Topic>
              label="Topic"
              value={value}
              options={topicOptions.map((o) => ({ label: o.label, value: o.value }))}
              onChange={(v) => onChange(v)}
              error={error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="title"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField label="Title" placeholder="Title" value={value} onChangeText={onChange} error={error?.message} />
          )}
        />

        <Controller
          control={control}
          name="content"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <InputField
              label="Content"
              placeholder="Write something..."
              value={value}
              onChangeText={onChange}
              error={error?.message}
              multiline
              style={{ minHeight: 120, textAlignVertical: "top" }}
            />
          )}
        />

        {/* UAT: upsell banner white bg, brand border 1px */}
        <View style={{ borderWidth: 1, borderColor: `${COLORS.brandGold}66`, borderRadius: 12, padding: 12, backgroundColor: COLORS.white }}>
          <HText variant="body" style={{ fontWeight: "800" }}>
            Upgrade for more posts
          </HText>
          <HText variant="meta" style={{ color: COLORS.brandSubtext, marginTop: 4 }}>
            Premium and Gold tiers increase your monthly post quota and visibility.
          </HText>
        </View>

        <HText variant="meta" style={{ color: "rgba(66,73,101,0.7)" }}>
          Available post: {remaining === null ? "..." : `${remaining} remaining`}
        </HText>

        <CTAButton title="Post" disabled={!isValid} onPress={onSubmit} onInvalidPress={() => Alert.alert("Fix errors", "Please correct fields in red.")} />
      </ScrollView>
    </View>
  );
}
