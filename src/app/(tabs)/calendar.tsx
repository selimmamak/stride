import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  Card,
  Row,
  Screen,
  SectionTitle,
  Text,
  colors,
  styles as ui,
} from "../../components/ui";
import { updateData } from "../../data/store";
import { localDateKey, monthGrid, parseLocalDate } from "../../domain/calendar";
import { runTitle } from "../../domain/importRuns";
import { useNow } from "../../hooks/useNow";
import { useStore } from "../../hooks/useStore";
import { errorMessage, notify } from "../../lib/feedback";
import { formatDistance } from "../../lib/format";
import type { CalendarEntry } from "../../types";

const kindLabels: Record<CalendarEntry["kind"], string> = {
  easy: "Easy run",
  long: "Long run",
  interval: "Intervals",
  weightlifting: "Weightlifting",
  rest: "Rest day",
};

function fullDate(date: string) {
  const parsed = parseLocalDate(date);
  if (!parsed) return date;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function CalendarScreen() {
  const { data } = useStore();
  const now = useNow();
  const today = localDateKey(now);
  const [selected, setSelected] = useState(() => localDateKey());
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return { year: date.getFullYear(), index: date.getMonth() };
  });
  const [saving, setSaving] = useState<string | null>(null);
  const dates = monthGrid(month.year, month.index);
  const entries = data.calendarEntries.filter(
    (item) => item.date === selected && item.kind !== "rest",
  );
  const marathons = data.marathons.filter((item) => item.date === selected);
  const runs = data.runs.filter(
    (item) => localDateKey(item.startedAt) === selected,
  );
  const markedDates = new Set([
    ...data.calendarEntries
      .filter((item) => item.kind !== "rest")
      .map((item) => item.date),
    ...data.marathons.map((item) => item.date),
    ...data.runs.map((item) => localDateKey(item.startedAt)),
  ]);

  function moveMonth(offset: number) {
    const date = new Date(month.year, month.index + offset, 1);
    if (date.getFullYear() < 1900 || date.getFullYear() > 2200) return;
    setMonth({ year: date.getFullYear(), index: date.getMonth() });
    setSelected(localDateKey(date.getTime()));
  }

  function selectDate(date: string) {
    const parsed = parseLocalDate(date);
    if (!parsed) return;
    setSelected(date);
    setMonth({ year: parsed.getFullYear(), index: parsed.getMonth() });
  }

  async function toggle(entry: CalendarEntry) {
    if (saving) return;
    setSaving(entry.id);
    try {
      await updateData((current) => ({
        ...current,
        calendarEntries: current.calendarEntries.map((item) =>
          item.id === entry.id ? { ...item, completed: !item.completed } : item,
        ),
      }));
    } catch (error) {
      notify("Could not update entry", errorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 8, paddingTop: 8 }}>
        <Text style={ui.label}>ONE DAY AT A TIME</Text>
        <Text style={ui.title}>Your calendar.</Text>
        <Text style={ui.subtitle}>
          Pick a day. Add your run or lifting session.
        </Text>
      </View>

      <Card style={{ padding: 12, gap: 14 }}>
        <Row style={{ justifyContent: "space-between", gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            disabled={month.year === 1900 && month.index === 0}
            onPress={() => moveMonth(-1)}
            style={ui.iconButton}
          >
            <Ionicons name="chevron-back" size={20} color={colors.muted} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "600" }}>
            {new Date(month.year, month.index, 1).toLocaleDateString(
              undefined,
              {
                month: "long",
                year: "numeric",
              },
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            disabled={month.year === 2200 && month.index === 11}
            onPress={() => moveMonth(1)}
            style={ui.iconButton}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        </Row>
        <View style={s.grid}>
          {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
            <View key={index} style={[s.cell, { minHeight: 28 }]}>
              <Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text>
            </View>
          ))}
          {dates.map((date) => {
            const available = !!parseLocalDate(date);
            const isSelected = date === selected;
            const isToday = date === today;
            const isCurrentMonth = Number(date.slice(5, 7)) - 1 === month.index;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={`${fullDate(date)}${isToday ? ", today" : ""}${markedDates.has(date) ? ", has training" : ""}`}
                accessibilityState={{
                  selected: isSelected,
                  disabled: !available,
                }}
                disabled={!available}
                onPress={() => selectDate(date)}
                style={s.cell}
              >
                <View
                  style={[
                    s.day,
                    isToday && { borderColor: colors.accent, borderWidth: 1 },
                    isSelected && { backgroundColor: colors.accent },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected || isToday ? "700" : "400",
                      color: isSelected
                        ? colors.background
                        : isCurrentMonth
                          ? colors.text
                          : colors.muted,
                      opacity: isSelected || isCurrentMonth ? 1 : 0.5,
                    }}
                  >
                    {Number(date.slice(8, 10))}
                  </Text>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: markedDates.has(date)
                        ? isSelected
                          ? colors.background
                          : colors.accent
                        : "transparent",
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
        <Button
          title="Today"
          variant="ghost"
          onPress={() => selectDate(today)}
        />
      </Card>

      <View style={{ gap: 13 }}>
        <SectionTitle
          title={(parseLocalDate(selected) ?? new Date()).toLocaleDateString(
            undefined,
            {
              month: "short",
              day: "numeric",
              weekday: "short",
            },
          )}
        />
        <Row style={{ gap: 10 }}>
          <Button
            title="Add run"
            icon="add"
            style={{ flex: 1, paddingHorizontal: 12 }}
            onPress={() =>
              router.push({
                pathname: "/calendar-entry",
                params: { date: selected, kind: "run" },
              })
            }
          />
          <Button
            title="Add lifting"
            icon="add"
            variant="secondary"
            style={{ flex: 1, paddingHorizontal: 12 }}
            onPress={() =>
              router.push({
                pathname: "/calendar-entry",
                params: { date: selected, kind: "weightlifting" },
              })
            }
          />
        </Row>
        {marathons.map((marathon) => (
          <Pressable
            key={`marathon:${marathon.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${marathon.name}`}
            onPress={() =>
              router.push({
                pathname: "/marathon",
                params: { id: marathon.id },
              })
            }
          >
            <Card style={{ borderColor: colors.accent }}>
              <Row>
                <Ionicons name="flag-outline" size={23} color={colors.accent} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.itemTitle}>{marathon.name}</Text>
                  <Text style={s.detail}>
                    Full marathon · {marathon.location}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Row>
            </Card>
          </Pressable>
        ))}
        {entries.map((entry) => (
          <Card key={`entry:${entry.id}`} style={{ padding: 16, gap: 12 }}>
            <Row style={{ alignItems: "flex-start" }}>
              {entry.kind === "weightlifting" ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Mark ${entry.title} ${entry.completed ? "planned" : "done"}`}
                  accessibilityState={{
                    checked: entry.completed,
                    disabled: saving !== null,
                  }}
                  aria-checked={entry.completed}
                  aria-disabled={saving !== null}
                  disabled={saving !== null}
                  onPress={() => void toggle(entry)}
                  style={s.check}
                >
                  <Ionicons
                    name={
                      entry.completed ? "checkmark-circle" : "ellipse-outline"
                    }
                    size={26}
                    color={entry.completed ? colors.accent : colors.muted}
                  />
                </Pressable>
              ) : (
                <Ionicons
                  name="walk-outline"
                  size={24}
                  color={colors.accent}
                  style={{ marginTop: 8 }}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${entry.title}`}
                onPress={() =>
                  router.push({
                    pathname: "/calendar-entry",
                    params: { id: entry.id },
                  })
                }
                style={{ flex: 1, gap: 6, paddingVertical: 5 }}
              >
                <Text style={s.itemTitle}>
                  {entry.kind === "weightlifting" && entry.liftType
                    ? { push: "Push", pull: "Pull", legs: "Legs/Abs" }[
                        entry.liftType
                      ]
                    : entry.title}
                </Text>
                <Text style={s.detail}>
                  {kindLabels[entry.kind]} ·{" "}
                  {entry.completed ? "Done" : "Planned"}
                </Text>
                {entry.distanceMeters != null && (
                  <Text style={s.detail}>
                    {formatDistance(
                      entry.distanceMeters,
                      data.settings.distanceUnit,
                    )}{" "}
                    {data.settings.distanceUnit}
                    {entry.durationMinutes != null
                      ? ` · ${entry.durationMinutes} min`
                      : ""}
                  </Text>
                )}
                {entry.notes ? (
                  <Text style={s.detail} numberOfLines={2}>
                    {entry.notes}
                  </Text>
                ) : null}
              </Pressable>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.muted}
                style={{ marginTop: 14 }}
              />
            </Row>
          </Card>
        ))}
        {runs.map((run) => (
          <Pressable
            key={`run:${run.id}`}
            accessibilityRole="button"
            accessibilityLabel={`View ${runTitle(run).toLowerCase()}`}
            onPress={() =>
              router.push({
                pathname: "/activity",
                params: { id: run.id, type: "run" },
              })
            }
          >
            <Card style={{ padding: 17 }}>
              <Row>
                <Ionicons name="walk-outline" size={23} color={colors.blue} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.itemTitle}>{runTitle(run)}</Text>
                  <Text style={s.detail}>
                    {run.source?.kind === "apple-health"
                      ? "Apple Health"
                      : run.source?.kind === "manual"
                        ? "Added manually"
                        : "Recorded"}{" "}
                    ·{" "}
                    {run.distanceUnavailable
                      ? "Distance unavailable"
                      : `${formatDistance(run.distanceMeters, data.settings.distanceUnit)} ${data.settings.distanceUnit}`}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Row>
            </Card>
          </Pressable>
        ))}
        {!entries.length && !runs.length && !marathons.length ? (
          <Text style={ui.subtitle}>Nothing added yet.</Text>
        ) : null}
      </View>
      <Button
        title="Import runs"
        icon="heart-outline"
        variant="ghost"
        onPress={() => router.push("/health")}
      />
      <Text style={[ui.subtitle, { textAlign: "center", fontSize: 12 }]}>
        Recorded and imported runs appear here automatically.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  day: {
    width: 39,
    height: 42,
    borderRadius: 13,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 40,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: { fontSize: 16, fontWeight: "600" },
  detail: { fontSize: 12, lineHeight: 18, color: colors.muted },
});
