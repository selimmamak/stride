import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  Button,
  Card,
  colors,
  EmptyState,
  Row,
  Screen,
  SectionTitle,
  Text,
  styles,
} from "../../components/ui";
import { elapsedMs } from "../../domain/engine";
import { runTitle } from "../../domain/importRuns";
import { useStore } from "../../hooks/useStore";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
} from "../../lib/format";

export default function HistoryScreen() {
  const { data } = useStore();
  const [limit, setLimit] = useState(30);
  const unit = data.settings.distanceUnit;
  const runs = useMemo(
    () => [...data.runs].sort((a, b) => b.startedAt - a.startedAt),
    [data.runs],
  );
  const totalMeters = data.runs.reduce(
    (sum, run) => sum + run.distanceMeters,
    0,
  );
  return (
    <Screen>
      <View style={{ gap: 8, paddingTop: 8 }}>
        <Text style={styles.label}>YOUR RUNS, OVER TIME</Text>
        <Text style={styles.title}>History</Text>
      </View>
      <Card>
        <Text style={styles.label}>TOTAL DISTANCE</Text>
        <Row
          style={{ alignItems: "baseline", justifyContent: "space-between" }}
        >
          <Text
            style={{
              color: colors.accent,
              fontSize: 44,
              letterSpacing: -1.5,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatDistance(totalMeters, unit)}
            <Text style={{ color: colors.muted, fontSize: 16 }}> {unit}</Text>
          </Text>
          <Text style={styles.muted}>
            {runs.length} {runs.length === 1 ? "run" : "runs"}
          </Text>
        </Row>
      </Card>
      <SectionTitle
        title="Run log"
        action="Import runs"
        onAction={() => router.push("/health")}
      />
      {!runs.length ? (
        <EmptyState
          title="Your first run is next."
          message="Record a run, add one to your calendar, or import from Apple Health."
          action={
            <Button
              title="Open calendar"
              onPress={() => router.push("/(tabs)/calendar")}
            />
          }
        />
      ) : (
        <View style={{ gap: 12 }}>
          {runs.slice(0, limit).map((run) => {
            const duration = elapsedMs(run);
            return (
              <Pressable
                key={run.id}
                accessibilityRole="button"
                accessibilityLabel={`View ${runTitle(run).toLowerCase()} from ${formatDate(run.startedAt)}`}
                onPress={() =>
                  router.push({
                    pathname: "/activity",
                    params: { id: run.id, type: "run" },
                  })
                }
              >
                <Card style={{ padding: 17, borderRadius: 20 }}>
                  <Row>
                    <Ionicons
                      name="walk-outline"
                      size={23}
                      color={colors.accent}
                    />
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontWeight: "600", fontSize: 16 }}>
                        {runTitle(run)}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {formatDate(run.startedAt)} ·{" "}
                        {run.source?.kind === "apple-health"
                          ? "Apple Health"
                          : run.source?.kind === "manual"
                            ? "Manual"
                            : "Stride"}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {formatDuration(duration)}
                        {run.distanceUnavailable
                          ? ""
                          : ` · ${formatPace(run.distanceMeters, duration, unit)} /${unit}`}
                      </Text>
                    </View>
                    <View
                      style={{ alignItems: "flex-end", gap: 8, maxWidth: 100 }}
                    >
                      <Text
                        style={{
                          fontSize: run.distanceUnavailable ? 12 : 18,
                          color: run.distanceUnavailable
                            ? colors.muted
                            : colors.text,
                          textAlign: "right",
                        }}
                      >
                        {run.distanceUnavailable
                          ? "No distance"
                          : `${formatDistance(run.distanceMeters, unit)} ${unit}`}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.muted}
                      />
                    </View>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
          {runs.length > limit && (
            <Button
              variant="ghost"
              title={`Show more (${runs.length - limit})`}
              onPress={() => setLimit((value) => value + 30)}
            />
          )}
        </View>
      )}
      <Text style={[styles.muted, { textAlign: "center", fontSize: 12 }]}>
        Saved on this device
      </Text>
    </Screen>
  );
}
