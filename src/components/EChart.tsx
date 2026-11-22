import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import { usePreferences } from '../lib/preferences';
import { localizeChart } from '../lib/chart-locale';

/** Thin ECharts wrapper: init once, setOption on change, resize with container. */
export function EChart({ option, height }: { option: echarts.EChartsOption; height: number }) {
  const {language} = usePreferences();
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const styledOption = useMemo(() => localizeChart({ ...option, textStyle: { fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, ...option.textStyle } },language), [option, language]);
  const optionRef = useRef(styledOption);

  useEffect(() => {
    const el = ref.current!;
    // Hidden research views retain their state. Wait for a real layout before
    // initializing, including charts inside unopened native disclosures.
    const onResize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      if (!chartRef.current) {
        chartRef.current = echarts.init(el);
        chartRef.current.setOption(optionRef.current, { notMerge: true });
      } else chartRef.current.resize();
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    optionRef.current = styledOption;
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(styledOption, { notMerge: true });
    // Recover from zero-size init (e.g. mounted in a hidden/background tab).
    if (ref.current && ref.current.clientWidth > 0 && chart.getWidth() !== ref.current.clientWidth) {
      chart.resize();
    }
  }, [styledOption]);

  return <div className="chart" ref={ref} style={{ height }} />;
}
