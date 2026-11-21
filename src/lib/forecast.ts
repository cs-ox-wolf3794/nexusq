import type { Forecast } from "./data";
import { validDate } from "./quality";

export function externalForecastCurrent(forecast: Forecast, now = Date.now()) {
  if (forecast.kind !== "external") return false;
  if (forecast.source.includes("World Bank Data360") && !forecast.sourceVintage) return false;
  const retrieved = Date.parse(forecast.retrievedAt ?? "");
  if (!Number.isFinite(retrieved) || retrieved > now + 5 * 60000 || now - retrieved > 45 * 86400000) return false;
  if (forecast.sourceVintage) {
    const vintage = Date.parse(forecast.sourceVintage);
    if (!validDate(forecast.sourceVintage) || vintage > now || now - vintage > 225 * 86400000) return false;
  }
  return true;
}
