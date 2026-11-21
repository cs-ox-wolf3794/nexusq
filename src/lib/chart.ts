import type { SeriesOption } from "echarts";
import type { FanPoint } from "./data";

/** Stack the interval width onto its lower bound, including negative bounds. */
export function forecastBand(points: FanPoint[], name: string, color: string): SeriesOption[] {
  return [
    { name: `__lo ${name}`, type: "line", silent: true, stack: `fan-${name}`, stackStrategy: "all",
      data: points.map((p) => [p[0], p[1]]), lineStyle: { opacity: 0 }, showSymbol: false },
    { name: `__band ${name}`, type: "line", silent: true, stack: `fan-${name}`, stackStrategy: "all",
      data: points.map((p) => [p[0], p[5] - p[1]]), lineStyle: { opacity: 0 }, showSymbol: false,
      areaStyle: { color, opacity: 0.14 } },
  ];
}
