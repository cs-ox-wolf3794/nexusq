import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { readTokens } from "./useTheme";
import type { Series } from "../lib/data";
import type { Points, Transform } from "../lib/transform";
import { TRANSFORM_LABELS } from "../lib/transform";

export interface OverlaySeries {
  series: Series;
  points: Points;
  color: string; // css var name, e.g. --series-1
}

const AXIS_LABEL: Record<Transform, string> = {
  index: "index (start = 100)",
  zscore: "standard deviations",
  yoy: "% change y/y",
  raw: "",
};

export function OverlayChart({ items, transform, themeMode }: {
  items: OverlaySeries[];
  transform: Transform;
  themeMode: string; // only used to invalidate the memo when tokens change
}) {
  const option = useMemo<EChartsOption>(() => {
    const tokens = readTokens([
      "--surface-1", "--text-primary", "--text-secondary", "--text-muted",
      "--gridline", "--baseline", "--border",
      ...items.map((i) => i.color),
    ]);
    const unitLabel = transform === "raw"
      ? (items[0]?.series.unit ?? "")
      : AXIS_LABEL[transform];

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 56, right: 16, top: items.length > 1 ? 44 : 20, bottom: 40 },
      legend: items.length > 1 ? {
        top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4,
        textStyle: { color: tokens["--text-secondary"], fontSize: 12 },
      } : undefined,
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "cross", label: { backgroundColor: tokens["--baseline"], color: tokens["--text-primary"] } },
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--border"],
        textStyle: { color: tokens["--text-primary"], fontSize: 12 },
        valueFormatter: (v) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"),
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
        axisLabel: { color: tokens["--text-muted"], fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: unitLabel,
        nameTextStyle: { color: tokens["--text-muted"], fontSize: 11, align: "left" },
        scale: true,
        axisLabel: { color: tokens["--text-muted"], fontSize: 11 },
        splitLine: { lineStyle: { color: tokens["--gridline"], width: 1 } },
      },
      series: items.map((it) => ({
        name: it.series.name,
        type: "line",
        showSymbol: false,
        data: it.points,
        lineStyle: { width: 2, color: tokens[it.color] },
        itemStyle: { color: tokens[it.color] },
        emphasis: { lineStyle: { width: 2.5 } },
      })),
    };
    // themeMode is part of the key on purpose: token values change with it
  }, [items, transform, themeMode]);

  return (
    <div>
      <EChart option={option} height={380} />
      <p className="sub" style={{ marginTop: 4 }}>
        {items.length > 1
          ? `Overlaid on a single axis as ${TRANSFORM_LABELS[transform].toLowerCase()} — mixed units are never dual-axed.`
          : items.length === 1
            ? `${items[0].series.name}, ${items[0].series.unit} (${items[0].series.source})`
            : "Select at least one series."}
      </p>
    </div>
  );
}
