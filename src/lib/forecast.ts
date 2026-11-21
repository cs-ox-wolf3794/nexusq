import type { Forecast } from "./data";
import { validDate, recentTimestamp } from "./quality";

export function externalForecastCurrent(forecast: Forecast, now = Date.now()) {
  if (forecast.kind !== "external") return false;
  if (forecast.source.includes("World Bank Data360") && !forecast.sourceVintage) return false;
  if (forecast.source === "EIA STEO" && !recentTimestamp(forecast.contentUpdatedAt, 45 * 86400000, now)) return false;
  const retrieved = Date.parse(forecast.retrievedAt ?? "");
  if (!Number.isFinite(retrieved) || retrieved > now + 5 * 60000 || now - retrieved > 45 * 86400000) return false;
  if (forecast.sourceVintage) {
    const vintage = Date.parse(forecast.sourceVintage);
    if (!validDate(forecast.sourceVintage) || vintage > now || now - vintage > 225 * 86400000) return false;
  }
  return true;
}

export function forecastHorizons(forecast: Forecast, today: string) {
  const result: Record<string, object> = {};
  for (const horizon of [7, 30, 90]) {
    const future = forecast.points.filter(([date]) => date > today);
    const days = (date: string) => (Date.parse(date) - Date.parse(today)) / 86400000;
    const point = [...future].sort((a, b) => Math.abs(days(a[0]) - horizon) - Math.abs(days(b[0]) - horizon))[0];
    if (!point || Math.abs(days(point[0]) - horizon) > Math.max(3, horizon * 0.3)) continue;
    result[String(horizon)] = {
      date: point[0], actualHorizonDays: days(point[0]),
      ...(point.length === 6 ? { p10: point[1], p50: point[3], p90: point[5] } : { value: point[1] }),
    };
  }
  return result;
}
