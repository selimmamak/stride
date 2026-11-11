import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  BackHeader,
  Button,
  Card,
  Field,
  Screen,
  Text,
  colors,
  styles,
} from "../components/ui";
import { id, updateData } from "../data/store";
import { parseLocalDate } from "../domain/calendar";
import { useStore } from "../hooks/useStore";
import { confirmAction, errorMessage } from "../lib/feedback";
import type { Marathon } from "../types";

export default function MarathonScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const marathonId = typeof params.id === "string" ? params.id : undefined;
  const { data, ready } = useStore();
  const loaded = useRef(false);
  const pending = useRef(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    const race = data.marathons.find((item) => item.id === marathonId);
    setMissing(Boolean(marathonId && !race));
    setName(race?.name ?? "");
    setLocation(race?.location ?? "");
    setDate(race?.date ?? (typeof params.date === "string" ? params.date : ""));
  }, [ready, data.marathons, marathonId, params.date]);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function save() {
    if (pending.current || !ready) return;
    if (!name.trim()) {
      setError("Add a race name.");
      return;
    }
    if (!location.trim()) {
      setError("Add the city or race location.");
      return;
    }
    if (!parseLocalDate(date.trim())) {
      setError("Enter a valid date as YYYY-MM-DD, for example 2027-10-10.");
      return;
    }
    setError(null);
    pending.current = true;
    setBusy(true);
    try {
      const race: Marathon = {
        id: marathonId ?? id(),
        name: name.trim(),
        location: location.trim(),
        date: date.trim(),
      };
      await updateData((current) => {
        if (
          marathonId &&
          !current.marathons.some((item) => item.id === marathonId)
        )
          throw new Error(
            "This marathon was removed. Go back and add it again.",
          );
        return {
          ...current,
          marathons: marathonId
            ? current.marathons.map((item) =>
                item.id === marathonId ? race : item,
              )
            : [...current.marathons, race],
        };
      });
      leave();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!marathonId || pending.current) return;
    if (
      !(await confirmAction(
        "Remove this marathon?",
        "This removes its countdown and calendar date. Your recorded runs stay saved.",
        true,
      ))
    )
      return;
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await updateData((current) => ({
        ...current,
        marathons: current.marathons.filter((item) => item.id !== marathonId),
      }));
      leave();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (missing)
    return (
      <Screen>
        <BackHeader title="Marathon not found" />
        <Text style={styles.muted}>This race may have been removed.</Text>
      </Screen>
    );

  return (
    <Screen>
      <BackHeader
        title={marathonId ? "Edit marathon" : "Add a marathon"}
        subtitle="A date to work toward."
      />
      <Card style={{ borderColor: "#3C4C31" }}>
        <Text
          style={{ color: colors.accent, fontSize: 12, letterSpacing: 1.5 }}
        >
          THE FULL DISTANCE
        </Text>
        <Text style={{ fontSize: 30, fontWeight: "600", letterSpacing: -1 }}>
          42.2 km / 26.2 mi
        </Text>
      </Card>
      <View style={{ gap: 20 }}>
        <Field
          label="Race name"
          placeholder="e.g. Chicago Marathon"
          value={name}
          onChangeText={setName}
          maxLength={100}
          autoCapitalize="words"
        />
        <Field
          label="Location"
          placeholder="City or race location"
          value={location}
          onChangeText={setLocation}
          maxLength={160}
          autoCapitalize="words"
        />
        <Field
          label="Race date"
          placeholder="YYYY-MM-DD"
          value={date}
          onChangeText={setDate}
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.subtitle}>
          Your countdown shows days until race day. Add as many marathons as you
          like.
        </Text>
      </View>
      {error && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.danger, lineHeight: 21 }}
        >
          {error}
        </Text>
      )}
      <Button
        title="Save marathon"
        icon="checkmark"
        onPress={save}
        loading={busy}
        disabled={!ready || busy}
      />
      {marathonId && (
        <Button
          title="Remove marathon"
          variant="danger"
          onPress={remove}
          disabled={busy}
        />
      )}
    </Screen>
  );
}
