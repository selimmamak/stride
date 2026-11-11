import { useMemo, useRef } from "react";
import { View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import type { TrackPoint } from "../types";
import { colors, Text } from "./ui";
export function RouteMap({
  points,
  height = 220,
}: {
  points: TrackPoint[];
  height?: number;
}) {
  const ref = useRef<MapView>(null);
  const segments = useMemo(() => {
    const groups = new Map<number, TrackPoint[]>();
    for (const point of points) {
      const group = groups.get(point.segment) ?? [];
      group.push(point);
      groups.set(point.segment, group);
    }
    return [...groups];
  }, [points]);
  if (!points.length)
    return (
      <View
        style={{
          height,
          backgroundColor: colors.background,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 30, color: colors.accent }}>◎</Text>
        <Text style={{ color: colors.muted }}>Your route will appear here</Text>
      </View>
    );
  const fit = () =>
    ref.current?.fitToCoordinates(points, {
      edgePadding: { top: 35, right: 35, bottom: 35, left: 35 },
      animated: false,
    });
  return (
    <View style={{ height, borderRadius: 18, overflow: "hidden" }}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        userInterfaceStyle="dark"
        onMapReady={fit}
        onLayout={fit}
        initialRegion={{
          latitude: points[0].latitude,
          longitude: points[0].longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        }}
        showsUserLocation={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        rotateEnabled={false}
      >
        {segments.map(([segment, coords]) => (
          <Polyline
            key={segment}
            coordinates={coords}
            strokeColor={colors.accent}
            strokeWidth={4}
          />
        ))}
        <Marker coordinate={points[0]} title="Start" pinColor={colors.accent} />
        <Marker
          coordinate={points[points.length - 1]}
          title="Latest point"
          pinColor={colors.blue}
        />
      </MapView>
    </View>
  );
}
export default RouteMap;
