import { number } from '../lib/preferences';
import { l as localize, t as tr } from '../lib/i18n';
import { useMemo } from "react";
import type { EChartsOption, SeriesOption } from "echarts";
import { EChart } from "./EChart";
import { readTokens } from "./useTheme";
import type { Series } from "../lib/data";
import { seriesCadence, type Points, type Transform } from "../lib/transform";
import { GlossaryTip } from "./Guidance";
import { forecastBand } from "../lib/chart";

export interface OverlaySeries {
  series: Series;
  points: Points;
  color: string; // css var name, e.g. --series-1
}

/** A projection attached to one selected series, already transform-scaled. */
export interface Projection {
  name: string; // owning series name
  color: string; // css var name
  fan?: [string, number, number, number, number, number][]; // [date,p10,p25,p50,p75,p90]
  external?: [string, number][];
  sourceLabel: string; // "model P50" | "IMF WEO" | "EIA STEO"
  note?: string;
}

const CAPTION_TEXT: Record<Transform, string> = {
  index: "indexed to 100 at each series’ first visible observation",
  zscore: "z-scores over the visible window",
  yoy: "year-over-year % change",
  raw: "raw values",
};

const fmtNum = (v: unknown) =>
  typeof v === "number" ? number(v) : "—";

export function OverlayChart({ items, projections, transform, themeMode }: {
  items: OverlaySeries[];
  projections: Projection[];
  transform: Transform;
  themeMode: string; // only used to invalidate the memo when tokens change
}) {
  const option = useMemo<EChartsOption>(() => {
    const tokens = readTokens([
      "--surface-1", "--text-primary", "--text-secondary", "--text-muted",
      "--gridline", "--baseline", "--border",
      ...items.map((i) => i.color),
    ]);
    const today = new Date().toISOString().slice(0, 10);

    const series: SeriesOption[] = items.map((it) => ({
      name: it.series.name,
      type: "line",
      showSymbol: false,
      data: it.points,
      lineStyle: { width: 2, color: tokens[it.color] },
      itemStyle: { color: tokens[it.color] },
      emphasis: { lineStyle: { width: 2.5 } },
    }));

    projections.forEach((p, idx) => {
      const color = tokens[p.color];
      // vertical "today" divider, attached once
      const markLine = idx === 0 ? {
        silent: true, symbol: "none" as const,
        lineStyle: { color: tokens["--baseline"], type: "dashed" as const, width: 1 },
        label: { formatter: "Today", color: tokens["--text-muted"], fontSize: 12 },
        data: [{ xAxis: today }],
      } : undefined;

      if (p.fan) {
        series.push(...forecastBand(p.fan, p.name, color));
        series.push({
          name: `${p.name} · ${p.sourceLabel}`, type: "line",
          data: p.fan.map((f) => [f[0], f[3]]),
          lineStyle: { width: 2, type: "dashed", color },
          itemStyle: { color }, showSymbol: false,
          markLine,
        });
      } else if (p.external) {
        series.push({
          name: `${p.name} · ${p.sourceLabel}`, type: "line",
          data: p.external,
          lineStyle: { width: 2, type: "dashed", color },
          itemStyle: { color },
          symbol: "circle", symbolSize: 7,
          markLine,
        });
      }
    });

    return {
      backgroundColor: "transparent",
      useUTC: true,
      animation: false,
      grid: { left: 56, right: 16, top: items.length > 1 ? 48 : 20, bottom: 66 },
      // Slider only — an "inside" zoom hijacks page scrolling (mousewheel and touch-pan).
      dataZoom: [
        {
          type: "slider", height: 16, bottom: 8,
          borderColor: tokens["--gridline"],
          backgroundColor: "transparent",
          fillerColor: tokens["--border"],
          dataBackground: { lineStyle: { color: tokens["--baseline"] }, areaStyle: { color: tokens["--gridline"], opacity: 0.6 } },
          selectedDataBackground: { lineStyle: { color: tokens["--text-muted"] }, areaStyle: { color: tokens["--gridline"] } },
          handleStyle: { color: tokens["--surface-1"], borderColor: tokens["--baseline"] },
          moveHandleSize: 0,
          textStyle: { color: tokens["--text-muted"], fontSize: 12 },
          brushSelect: false,
        },
      ],
      legend: items.length > 1 ? {
        selectedMode: false, // Selection is controlled by the picker, including its forecast/fan.
        top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4,
        data: items.map((i) => i.series.name), // helpers & projections stay out of the legend
        textStyle: { color: tokens["--text-secondary"], fontSize: 12 },
      } : undefined,
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "cross", label: { backgroundColor: tokens["--baseline"], color: tokens["--text-primary"] } },
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--border"],
        textStyle: { color: tokens["--text-primary"], fontSize: 14 },
        formatter: (params) => {
          const list = (Array.isArray(params) ? params : [params]) as {
            seriesName?: string; marker?: string; value?: [string | number, number]; axisValueLabel?: string;
          }[];
          // units are only meaningful on the raw scale — transforms are unitless
          const unitOf = new Map(items.map((i) => [tr(i.series.name), tr(i.series.unit)]));
          const rows = list
            .filter((p) => p.seriesName && !p.seriesName.startsWith("__"))
            .map((p) => {
              const base = p.seriesName!.split(" · ")[0]; // projections inherit their series' unit
              const unit = transform === "raw" ? unitOf.get(base) : undefined;
              return `${p.marker ?? ""} ${p.seriesName}&nbsp;&nbsp;<b>${fmtNum(p.value?.[1])}</b>${unit ? ` <span style="font-size:14px">${unit}</span>` : ""}`;
            });
          if (!rows.length) return "";
          const date = list[0]?.axisValueLabel ?? "";
          return `<div style="font-size:14px">${date}</div>${rows.join("<br/>")}`;
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
        axisLabel: { color: tokens["--text-muted"], fontSize: 12 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: tokens["--text-muted"], fontSize: 12 },
        splitLine: { lineStyle: { color: tokens["--gridline"], width: 1 } },
      },
      series,
    };
  // Theme mode invalidates CSS-derived colors even though it is not an option value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, projections, transform, themeMode]);

  return (
    <div>
      <EChart option={option} height={380} />
      <p className="sub" style={{ marginTop: 4 }}>
        {localize(items.length > 1
          ? `Overlaid on a single axis, ${CAPTION_TEXT[transform]} — mixed units are never dual-axed.`
          : items.length === 1
            ? `${items[0].series.name}: ${CAPTION_TEXT[transform]}${transform === "raw" ? `, ${items[0].series.unit}` : ""} (${items[0].series.source})`
            : "Select at least one series.")}
        {transform === "raw" && items.length > 1 && <span> · {tr(items[0].series.unit)}</span>}
        {localize(projections.length > 0 && (
          <>
            {localize(" ")}{tr("· Shaded model fan = ")}<GlossaryTip term="P10-P90" definition="Projected 10th-to-90th percentile range under the model assumptions; real-world coverage is uncalibrated." />{tr(". External forecast markers are period estimates; connecting lines are visual guides, not intervening observations. Model output, not investment advice.")}</>
        ))}
      </p>
      {localize(transform === "index" && <p className="sub">{tr("Index bases: ")}{localize(items.filter((i) => i.points.length).map((i) => `${i.series.name}: ${i.points[0][0]}`).join("; "))}{tr(". These compare price levels, not total investment returns.")}</p>)}
      {localize(items.some((i) => seriesCadence(i.series) === "monthly") && <p className="sub">{tr("Monthly observations are plotted at period end; the date labels identify the month, not a daily closing price.")}</p>)}
      {localize(items.some((i) => i.series.id === "GDP_IND") && <p className="sub">{tr("India GDP history uses April–March fiscal years labeled by the starting year. It is not directly aligned with calendar-year GDP for the other countries.")}</p>)}
      {localize(items.some((i) => !i.points.length) && <p className="sub">{tr("◔ Not plotted: ")}{localize(items.filter((i) => !i.points.length).map((i) => i.series.name).join(", "))}{tr(" — insufficient valid observations for this scale/window.")}</p>)}
      {localize(projections.filter((p) => p.note).map((p) => <p className="sub" key={p.name}>{localize(p.note)}</p>))}
    </div>
  );
}
