import { expect, it } from "vitest";
import * as echarts from "echarts";
import { forecastBand } from "../chart";
import type { FanPoint } from "../data";

it("renders upper quantile boundaries correctly below, across and above zero", () => {
  const points: FanPoint[] = [["2026-12-01", -3, -2.5, -2, -1.5, -1], ["2027-01-01", -2, -1, 0, 2, 4], ["2027-02-01", 5, 6, 6.5, 7, 8]];
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 600, height: 400 });
  try {
    chart.setOption({ animation: false, xAxis: { type: "time" }, yAxis: { type: "value" }, series: forecastBand(points, "test", "blue") });
    // Inspect the actual ECharts stacking result, rather than merely checking an option flag.
    const model = (chart as unknown as { getModel(): { getSeriesByIndex(index: number): { getData(): { getCalculationInfo(key: string): string; get(dimension: string, index: number): number } } } }).getModel();
    const band = model.getSeriesByIndex(1).getData();
    const dimension = band.getCalculationInfo("stackResultDimension");
    expect(points.map((_, i) => band.get(dimension, i))).toEqual([-1, 4, 8]);
    expect(chart.renderToSVGString()).not.toContain("NaN");
  } finally { chart.dispose(); }
});
