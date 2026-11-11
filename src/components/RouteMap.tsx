import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import type { TrackPoint } from "../types";
import { colors, Text } from "./ui";

export function RouteMap({
  points,
  height = 220,
}: {
  points: TrackPoint[];
  height?: number;
}) {
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
  const cos = Math.max(0.01, Math.cos((points[0].latitude * Math.PI) / 180));
  const xs = points.map((p) => p.longitude * cos),
    ys = points.map((p) => -p.latitude);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.0005);
  const project = (p: TrackPoint) => ({
    x: 160 + ((p.longitude * cos - (minX + maxX) / 2) / span) * 240,
    y: 100 + ((-p.latitude - (minY + maxY) / 2) / span) * 150,
  });
  const groups = new Map<number, TrackPoint[]>();
  points.forEach((p) =>
    groups.set(p.segment, [...(groups.get(p.segment) ?? []), p]),
  );
  const first = project(points[0]),
    last = project(points[points.length - 1]);
  return (
    <View
      style={{
        height,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: colors.background,
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 320 200">
        {[40, 80, 120, 160].map((y) => (
          <Line
            key={`h${y}`}
            x1="0"
            x2="320"
            y1={y}
            y2={y}
            stroke={colors.border}
            strokeWidth="0.5"
          />
        ))}
        {[40, 80, 120, 160, 200, 240, 280].map((x) => (
          <Line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1="0"
            y2="200"
            stroke={colors.border}
            strokeWidth="0.5"
          />
        ))}
        {[...groups].map(([segment, group]) => (
          <Polyline
            key={segment}
            points={group
              .map((p) => {
                const c = project(p);
                return `${c.x},${c.y}`;
              })
              .join(" ")}
            fill="none"
            stroke={colors.accent}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        <Circle
          cx={first.x}
          cy={first.y}
          r="5"
          fill={colors.background}
          stroke={colors.accent}
          strokeWidth="2"
        />
        <Circle cx={last.x} cy={last.y} r="5" fill={colors.accent} />
      </Svg>
      <Text
        style={{
          position: "absolute",
          bottom: 10,
          right: 12,
          fontSize: 10,
          color: colors.muted,
        }}
      >
        ROUTE OUTLINE
      </Text>
    </View>
  );
}
export default RouteMap;
