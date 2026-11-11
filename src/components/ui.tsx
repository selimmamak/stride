import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type TextProps,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

export const colors = {
  background: "#080C0F",
  surface: "#12191E",
  elevated: "#1A2329",
  border: "#273137",
  text: "#F2F5F4",
  muted: "#8C9A9F",
  accent: "#C5F76B",
  danger: "#FF8D8D",
  blue: "#9DCAFF",
};
export function Text(props: TextProps) {
  return <NativeText {...props} style={[styles.text, props.style]} />;
}
type Container = { children: React.ReactNode; style?: StyleProp<ViewStyle> };
export function Screen({
  children,
  scroll = true,
  style,
  contentContainerStyle,
}: Container & {
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.screen, contentContainerStyle]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.screen, { flex: 1 }, contentContainerStyle]}>
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children, style }: Container) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Row({ children, style }: Container) {
  return <View style={[styles.row, style]}>{children}</View>;
}
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === "primary";
  const foreground = primary
    ? colors.background
    : variant === "danger"
      ? colors.danger
      : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary
            ? colors.accent
            : variant === "ghost"
              ? "transparent"
              : colors.elevated,
          opacity: disabled || loading ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Ionicons name={icon} size={19} color={foreground} />
      ) : null}
      <Text style={{ color: foreground, fontSize: 15, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 8, flexShrink: 1 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        style={[styles.input, style]}
      />
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected && {
          backgroundColor: colors.accent,
          borderColor: colors.accent,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: selected ? colors.background : colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={{ fontSize: 19, fontWeight: "600", letterSpacing: -0.5 }}>
        {title}
      </Text>
      {action ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={{ paddingVertical: 10, paddingLeft: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 30 }}>
      <Ionicons name="sparkles-outline" size={26} color={colors.accent} />
      <Text style={{ fontSize: 20, fontWeight: "600", textAlign: "center" }}>
        {title}
      </Text>
      <Text style={[styles.muted, { textAlign: "center", lineHeight: 22 }]}>
        {message}
      </Text>
      {action}
    </Card>
  );
}
export function BackHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 18 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        {right}
      </Row>
      <View style={{ gap: 7 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
export const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 15 },
  screen: {
    padding: 22,
    paddingBottom: 44,
    gap: 22,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.5,
    fontWeight: "600",
    color: colors.text,
  },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  muted: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  gap: { gap: 14 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  chip: {
    minHeight: 42,
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
