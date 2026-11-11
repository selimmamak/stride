import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import {
  Button,
  Card,
  colors,
  Row,
  Screen,
  SectionTitle,
  styles,
  Text,
} from "../../components/ui";
import { useStore } from "../../hooks/useStore";
import { useNow } from "../../hooks/useNow";
import { runTitle } from "../../domain/importRuns";
import { summarizeRuns } from "../../domain/calendar";
import { MarathonCountdown } from "../../components/MarathonCountdown";
import {
  formatDistance,
  formatDate,
  formatPace,
  unitMeters,
} from "../../lib/format";
import type { RunKind } from "../../types";

const runTypes: {
  kind: RunKind;
  label: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  {
    kind: "easy",
    label: "Easy run",
    detail: "Keep it comfortable",
    icon: "leaf-outline",
  },
  {
    kind: "long",
    label: "Long run",
    detail: "Go a little further",
    icon: "trail-sign-outline",
  },
  {
    kind: "interval",
    label: "Intervals",
    detail: "Find your faster gear",
    icon: "flash-outline",
  },
];
export default function TodayScreen() {
  const { data } = useStore();
  const now = useNow();
  const week = summarizeRuns(data.runs, "week", now);
  const month = summarizeRuns(data.runs, "month", now);
  const meters = week.distanceMeters;
  const progress = Math.min(meters / (data.settings.weeklyGoalKm * 1000), 1);
  const radius = 47,
    circumference = 2 * Math.PI * radius;
  const day = new Date(now).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const last = data.runs
    .map((run) => ({
      id: run.id,
      type: "run",
      title: runTitle(run),
      startedAt: run.startedAt,
      value: run.distanceUnavailable
        ? "Distance unavailable"
        : `${formatDistance(run.distanceMeters, data.settings.distanceUnit)} ${data.settings.distanceUnit}`,
    }))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", paddingTop: 4 }}>
        <Row style={{ gap: 9 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.accent,
            }}
          />
          <Text style={{ fontSize: 17, letterSpacing: 5, fontWeight: "700" }}>
            STRIDE
          </Text>
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          style={styles.iconButton}
        >
          <Ionicons name="options-outline" color={colors.text} size={20} />
        </Pressable>
      </Row>
      <View style={{ gap: 9, marginTop: 2 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {day.toUpperCase()}
        </Text>
        <Text style={[styles.title, { fontSize: 34, lineHeight: 38 }]}>
          Your pace.{`\n`}Your progress.
        </Text>
      </View>
      {data.activeRun ? (
        <Card style={{ borderColor: colors.accent }}>
          <Text style={{ color: colors.accent }}>
            Your run is{" "}
            {data.activeRun.status === "running" ? "recording" : "paused"}
          </Text>
          <Button
            title="Return to run"
            icon="arrow-forward"
            onPress={() => router.push("/run")}
          />
        </Card>
      ) : null}
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ gap: 8, flex: 1 }}>
            <Text style={styles.label}>THIS WEEK</Text>
            <Row style={{ alignItems: "baseline", gap: 6 }}>
              <Text
                style={{
                  fontSize: 40,
                  fontWeight: "600",
                  letterSpacing: -2,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatDistance(meters, data.settings.distanceUnit)}
              </Text>
              <Text style={styles.muted}>{data.settings.distanceUnit}</Text>
            </Row>
            <Text style={styles.muted}>
              {week.count} {week.count === 1 ? "run" : "runs"} · Mon to today
            </Text>
          </View>
          <View
            style={{
              width: 110,
              height: 110,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Svg width={110} height={110} style={{ position: "absolute" }}>
              <Circle
                cx={55}
                cy={55}
                r={radius}
                stroke={colors.border}
                strokeWidth={7}
                fill="none"
              />
              <Circle
                cx={55}
                cy={55}
                r={radius}
                stroke={colors.accent}
                strokeWidth={7}
                fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                transform="rotate(-90 55 55)"
              />
            </Svg>
            <Text style={{ fontSize: 23, fontWeight: "600" }}>
              {Math.round(progress * 100)}%
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>
              WEEKLY GOAL
            </Text>
          </View>
        </Row>
        <Row
          style={{ justifyContent: "space-between", alignItems: "baseline" }}
        >
          <Text style={styles.muted}>Average pace</Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPace(
              week.distanceMeters,
              week.durationMs,
              data.settings.distanceUnit,
            )}
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {" "}
              /{data.settings.distanceUnit}
            </Text>
          </Text>
        </Row>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Goal ·{" "}
            {(
              (data.settings.weeklyGoalKm * 1000) /
              unitMeters(data.settings.distanceUnit)
            ).toFixed(0)}{" "}
            {data.settings.distanceUnit}
          </Text>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 12, color: colors.accent }}>
              Adjust goal ↗
            </Text>
          </Pressable>
        </Row>
      </Card>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={styles.label}>THIS MONTH</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {new Date(now).toLocaleDateString(undefined, { month: "long" })} ·{" "}
            {month.count} {month.count === 1 ? "run" : "runs"}
          </Text>
        </Row>
        <Row style={{ alignItems: "flex-start", gap: 18 }}>
          <View style={{ flex: 1, gap: 7 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: "600",
                letterSpacing: -1,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatDistance(month.distanceMeters, data.settings.distanceUnit)}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {" "}
                {data.settings.distanceUnit}
              </Text>
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Distance</Text>
          </View>
          <View
            style={{ height: 48, width: 1, backgroundColor: colors.border }}
          />
          <View style={{ flex: 1, gap: 7 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: "600",
                letterSpacing: -1,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatPace(
                month.distanceMeters,
                month.durationMs,
                data.settings.distanceUnit,
              )}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {" "}
                /{data.settings.distanceUnit}
              </Text>
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Average pace
            </Text>
          </View>
        </Row>
      </Card>
      <MarathonCountdown races={data.marathons} now={now} />
      <View style={{ gap: 12 }}>
        <SectionTitle title="Go for a run" />
        {runTypes.map((item) => (
          <Pressable
            key={item.kind}
            accessibilityRole="button"
            accessibilityLabel={`Start ${item.label.toLowerCase()}`}
            onPress={() =>
              router.push({ pathname: "/run", params: { kind: item.kind } })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 17,
                borderRadius: 20,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: "#253024",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={item.icon} color={colors.accent} size={21} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontWeight: "600", fontSize: 16 }}>
                  {item.label}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {item.detail}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.muted} />
            </Card>
          </Pressable>
        ))}
      </View>
      {last ? (
        <View style={{ gap: 12 }}>
          <SectionTitle
            title="Last run"
            action="View all"
            onAction={() => router.push("/history")}
          />
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/activity",
                params: { id: last.id, type: last.type },
              })
            }
            accessibilityRole="button"
          >
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ gap: 6, flex: 1 }}>
                  <Text style={{ fontWeight: "600" }}>{last.title}</Text>
                  <Text style={styles.muted}>{formatDate(last.startedAt)}</Text>
                </View>
                <Text style={{ color: colors.accent, fontSize: 18 }}>
                  {last.value}
                </Text>
              </Row>
            </Card>
          </Pressable>
        </View>
      ) : (
        <Text
          style={{
            color: colors.muted,
            fontSize: 12,
            textAlign: "center",
            lineHeight: 19,
          }}
        >
          One session at a time.{`\n`}Your history starts whenever you do.
        </Text>
      )}
    </Screen>
  );
}
