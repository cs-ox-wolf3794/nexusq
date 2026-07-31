import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { readTokens } from "./useTheme";
import type { Series } from "../lib/data";
import { alignSeries, returnCorrelation } from "../lib/transform";

export function CorrelationMatrix({ list, from, themeMode }: {
  list: Series[];
  from: string;
  themeMode: string;
}) {
  const { names, cells } = useMemo(() => {
    const names = list.map((s) => s.name);
    const grid = alignSeries(list, from);
    const cells: [number, number, number][] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j <= i; j++) {
        const c = i === j ? 1 : returnCorrelation(grid.values[i], grid.values[j]);
        if (c != null) {
          cells.push([j, i, Math.round(c * 100) / 100]);
          if (i !== j) cells.push([i, j, Math.round(c * 100) / 100]);
        }
      }
    }
    return { names, cells };
  }, [list, from]);

  const option = useMemo<EChartsOption>(() => {
    const t = readTokens([
      "--surface-1", "--text-primary", "--text-secondary", "--text-muted",
      "--gridline", "--baseline", "--border", "--diverge-neutral",
    ]);
    const dark = themeMode === "dark";
    return {
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 8, right: 16, top: 8, bottom: 74, containLabel: true },
      tooltip: {
        confine: true,
        backgroundColor: t["--surface-1"],
        borderColor: t["--border"],
        textStyle: { color: t["--text-primary"], fontSize: 12 },
        formatter: (p) => {
          const v = (p as unknown as { value: [number, number, number] }).value;
          return `${names[v[1]]} × ${names[v[0]]}<br/>ρ (log-return) = <b>${v[2].toFixed(2)}</b>`;
        },
      },
      xAxis: {
        type: "category", data: names, position: "top",
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: t["--text-muted"], fontSize: 10.5, rotate: 32, width: 90, overflow: "truncate" },
      },
      yAxis: {
        type: "category", data: names, inverse: true,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: t["--text-muted"], fontSize: 10.5, width: 110, overflow: "truncate" },
      },
      visualMap: {
        min: -1, max: 1, calculable: false, orient: "horizontal",
        left: "center", bottom: 0, itemHeight: 130,
        text: ["+1  positively linked", "inversely linked  −1"],
        textStyle: { color: t["--text-muted"], fontSize: 10.5 },
        // diverging blue (−1) ↔ red (+1) with a neutral gray midpoint (never a hue at 0)
        inRange: { color: dark
          ? ["#3987e5", "#28527f", t["--diverge-neutral"], "#7f3535", "#e66767"]
          : ["#2a78d6", "#9ec5f4", t["--diverge-neutral"], "#eda9a8", "#e34948"],
        },
      },
      series: [{
        type: "heatmap",
        data: cells,
        label: {
          show: true, fontSize: 10.5,
          color: t["--text-primary"],
          formatter: (p) => (p.value as [number, number, number])[2].toFixed(2),
        },
        itemStyle: { borderColor: t["--surface-1"], borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t["--baseline"] } },
      }],
    };
  }, [names, cells, themeMode]);

  if (list.length < 2) return <p className="sub">Select at least two series to correlate.</p>;
  return <EChart option={option} height={Math.max(260, 66 * list.length + 130)} />;
}
