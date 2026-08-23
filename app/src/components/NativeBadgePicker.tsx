import { Feather } from "@expo/vector-icons";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { huddleColors, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";

// Searchable tap-to-badge multi-select kept intentionally clean: with an empty
// search box it shows only what you've already picked (removable), and the full
// option list appears only once you start typing. Tapping a badge adds or
// removes it. Built for Languages on the profile; generic for Care specialties /
// Pet traits later. `header` renders above the search box (e.g. a visibility
// toggle).

type NativeBadgePickerProps = {
  header?: ReactNode;
  onChange: (values: string[]) => void;
  options: string[];
  searchPlaceholder?: string;
  values: string[];
};

export function NativeBadgePicker({ header, onChange, options, searchPlaceholder = "Search", values }: NativeBadgePickerProps) {
  const [query, setQuery] = useState("");

  const searching = query.trim().length > 0;
  const ordered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    // Empty search → only the current picks; typing → the matching options,
    // selected ones first so the answer never hides behind the fold.
    if (!clean) return values;
    const matches = options.filter((option) => option.toLowerCase().includes(clean));
    const selected = matches.filter((option) => values.includes(option));
    const rest = matches.filter((option) => !values.includes(option));
    return [...new Set([...selected, ...rest])];
  }, [options, query, values]);

  const toggle = (option: string) => {
    onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  };

  return (
    <View style={styles.root}>
      {header}
      <View style={styles.searchField}>
        <Feather color={huddleColors.iconSubtle} name="search" size={16} />
        <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
          accessibilityLabel={searchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={huddleColors.mutedText}
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
            <Feather color={huddleColors.iconSubtle} name="x" size={16} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.grid}>
        {ordered.map((option) => {
          const selected = values.includes(option);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => toggle(option)}
              style={({ pressed }) => [styles.badge, selected ? styles.badgeSelected : null, pressed ? styles.pressed : null]}
            >
              <Text style={[styles.badgeText, selected ? styles.badgeTextSelected : null]}>{option}</Text>
              {selected ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
            </Pressable>
          );
        })}
        {ordered.length === 0 ? (
          <Text style={styles.emptyText}>{searching ? "No matches found." : "Search to add the languages you speak."}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: huddleSpacing.x4,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.mutedCanvas,
    paddingHorizontal: huddleSpacing.x4,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    color: huddleColors.text,
    paddingVertical: huddleSpacing.x2,
    overflow: "hidden",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2 + 2,
  },
  badgeSelected: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  pressed: {
    opacity: 0.82,
  },
  badgeText: {
    fontFamily: "Urbanist-700",
    fontSize: 14,
    color: huddleColors.text,
  },
  badgeTextSelected: {
    color: huddleColors.onPrimary,
  },
  emptyText: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    color: huddleColors.mutedText,
  },
});
