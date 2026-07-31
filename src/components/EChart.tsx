import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/** Thin ECharts wrapper: init once, setOption on change, resize with container. */
export function EChart({ option, height }: { option: echarts.EChartsOption; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current!;
    const chart = echarts.init(el);
    chartRef.current = chart;
    const onResize = () => chart.resize();
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, { notMerge: true });
    // Recover from zero-size init (e.g. mounted in a hidden/background tab).
    if (ref.current && ref.current.clientWidth > 0 && chart.getWidth() !== ref.current.clientWidth) {
      chart.resize();
    }
  }, [option]);

  return <div className="chart" ref={ref} style={{ height }} />;
}
