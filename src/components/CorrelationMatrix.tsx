import { number } from '../lib/preferences';
import { t as tr } from '../lib/i18n';
import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { readTokens } from "./useTheme";
import type { Series } from "../lib/data";
import { observedCorrelation } from "../lib/transform";

/** Width as state so the option rebuilds on resize/rotation (a render-time
 *  window.innerWidth read goes stale — learned the hard way on the overlay). */
function useCompact(breakpoint: number): boolean {
  const [compact, setCompact] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return compact;
}

export function CorrelationMatrix({ list, from, themeMode }: {
  list: Series[];
  from: string;
  themeMode: string;
}) {
  const compact = useCompact(480);
  const { names, cells, details } = useMemo(() => {
    const names = list.map((s) => s.name);
    const details = new Map<string, { n: number; asOf: string; basis: string }>();
    const cells: [number, number, number][] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j <= i; j++) {
        const stats = observedCorrelation(list[i], list[j], from);
        const c = stats?.rho;
        if (c != null) {
          details.set(`${j},${i}`, stats!);
          details.set(`${i},${j}`, stats!);
          cells.push([j, i, Math.round(c * 100) / 100]);
          if (i !== j) cells.push([i, j, Math.round(c * 100) / 100]);
        }
      }
    }
    return { names, cells, details };
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
        textStyle: { color: t["--text-primary"], fontSize: 14 },
        formatter: (p) => {
          const v = (p as unknown as { value: [number, number, number] }).value;
          const stats = details.get(`${v[0]},${v[1]}`)!;
          return `${tr(names[v[1]])} × ${tr(names[v[0]])}<br/>ρ = <b>${number(v[2],2,2)}</b><br/>n = ${stats.n}; ${tr("through")} ${stats.asOf}<br/>${tr(stats.basis)}`;
        },
      },
      xAxis: {
        type: "category", data: names, position: "top",
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: t["--text-muted"], fontSize: 12, rotate: 32, width: 90, overflow: "truncate" },
      },
      yAxis: {
        type: "category", data: names, inverse: true,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: t["--text-muted"], fontSize: 12, width: 110, overflow: "truncate" },
      },
      visualMap: {
        min: -1, max: 1, calculable: false, orient: "horizontal",
        left: "center", bottom: 0, itemHeight: 130,
        text: ["+1  positively linked", "inversely linked  −1"],
        textStyle: { color: t["--text-muted"], fontSize: 12 },
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
          // below 480px the numbers overlap the cells — color + tap tooltip carry the value
          show: !compact, fontSize: 12,
          color: t["--text-primary"],
          formatter: (p) => number((p.value as [number, number, number])[2],2,2),
        },
        itemStyle: { borderColor: t["--surface-1"], borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t["--baseline"] } },
      }],
    };
  }, [names, cells, details, themeMode, compact]);

  if (list.length < 2) return <p className="sub">{tr("Select at least two series to correlate.")}</p>;
  return <><EChart option={option} height={Math.max(260, 66 * list.length + 130)} /><p className="sub">{tr("Blank cells: incompatible frequencies or fewer than 20 paired changes. Hover or tap a cell for sample size and observation date. Correlation is association, not causation.")}</p></>;
}
