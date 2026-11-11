import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { daysUntil, parseLocalDate } from "../domain/calendar";
import type { Marathon } from "../types";
import { Button, Card, colors, Row, SectionTitle, styles, Text } from "./ui";

const raceDate = (date: string) =>
  parseLocalDate(date)?.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) ?? date;

export function MarathonCountdown({
  races,
  now,
}: {
  races: Marathon[];
  now: number;
}) {
  const upcoming = races
    .filter((race) => daysUntil(race.date, now) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = races
    .filter((race) => daysUntil(race.date, now) < 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const next = upcoming[0];
  const others = [...upcoming.slice(1), ...past];
  const edit = (race: Marathon) =>
    router.push({ pathname: "/marathon", params: { id: race.id } });
  const days = next ? daysUntil(next.date, now) : 0;

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle
        title="Your marathons"
        action="+ Add race"
        onAction={() => router.push("/marathon")}
      />
      {next ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${next.name}`}
          onPress={() => edit(next)}
        >
          <Card
            style={{
              borderColor: "#435434",
              backgroundColor: "#172019",
              gap: 16,
            }}
          >
            <Row
              style={{
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 11,
                    letterSpacing: 1.5,
                    fontWeight: "600",
                  }}
                >
                  NEXT START LINE
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "600",
                    letterSpacing: -0.5,
                  }}
                >
                  {next.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {next.location}
                </Text>
              </View>
              <Ionicons name="flag-outline" size={23} color={colors.accent} />
            </Row>
            <Row style={{ alignItems: "baseline", gap: 10 }}>
              <Text
                style={{
                  color: colors.accent,
                  fontSize: days === 0 ? 36 : 58,
                  lineHeight: 64,
                  letterSpacing: -2,
                  fontWeight: "600",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {days === 0 ? "Race day" : days}
              </Text>
              {days > 0 && (
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 12,
                    letterSpacing: 1,
                  }}
                >
                  {days === 1 ? "DAY TO GO" : "DAYS TO GO"}
                </Text>
              )}
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {raceDate(next.date)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                42.2 km / 26.2 mi
              </Text>
            </Row>
          </Card>
        </Pressable>
      ) : (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>
            Your next start line.
          </Text>
          <Text style={styles.subtitle}>
            Add a marathon, its date, and its location. Your countdown lives
            here.
          </Text>
          <Button
            title="Add a marathon"
            icon="add"
            variant="secondary"
            onPress={() => router.push("/marathon")}
          />
        </Card>
      )}
      {others.map((race) => {
        const remaining = daysUntil(race.date, now);
        return (
          <Pressable
            key={race.id}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${race.name}`}
            onPress={() => edit(race)}
          >
            <Card style={{ padding: 16, borderRadius: 18 }}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ fontWeight: "600" }}>{race.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {race.location} · {raceDate(race.date)}
                  </Text>
                </View>
                <Text
                  style={{
                    color: remaining >= 0 ? colors.accent : colors.muted,
                    fontSize: 12,
                    maxWidth: 90,
                    textAlign: "right",
                  }}
                >
                  {remaining === 0
                    ? "Race day"
                    : remaining > 0
                      ? `${remaining} days`
                      : "Past race"}
                </Text>
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}
