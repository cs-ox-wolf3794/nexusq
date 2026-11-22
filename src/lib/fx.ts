import type { Currency } from './preferences';

export interface FxFile {
  schemaVersion: 1; base: 'USD'; quote: 'NOK'; source: 'Norges Bank'; sourceUrl: string;
  generated: string; retrievedAt: string | null; observedAt: string | null; nokPerUsd: number | null;
  status: 'available' | 'retained' | 'unavailable'; error?: string;
}
export function validFx(file: FxFile | null | undefined, now = Date.now()): file is FxFile & { nokPerUsd: number; observedAt: string } {
  if (!file || file.schemaVersion !== 1 || file.base !== 'USD' || file.quote !== 'NOK' || file.source !== 'Norges Bank' || !file.sourceUrl?.startsWith('https://www.norges-bank.no/') || !file.observedAt || !file.retrievedAt || file.nokPerUsd == null || !Number.isFinite(file.nokPerUsd) || file.nokPerUsd <= 0 || !['available','retained'].includes(file.status)) return false;
  const day = Date.parse(file.observedAt + 'T00:00:00Z'), retrieved = Date.parse(file.retrievedAt);
  return /^\d{4}-\d{2}-\d{2}$/.test(file.observedAt) && Number.isFinite(day) && new Date(day).toISOString().slice(0,10) === file.observedAt && day <= now && now - day <= 7 * 86400000 && Number.isFinite(retrieved) && retrieved >= day && retrieved <= now + 60000 && now - retrieved <= 7 * 86400000;
}
/** Fixed dated display conversion. It must never feed analytical returns/models. */
export function displayAmount(value: number, unit: string, currency: Currency, fx: FxFile | null | undefined, now = Date.now()) {
  // A currency pair is itself an instrument, not a monetary price display unit.
  const convertible = /^USD(?:\/|$)/.test(unit) && !/^USD\/[A-Z]{3}$/.test(unit);
  const converted = currency === 'NOK' && convertible && validFx(fx, now);
  return { value: converted ? value * fx.nokPerUsd : value, unit: converted ? unit.replace(/^USD/, 'NOK') : unit, converted, fallback: currency === 'NOK' && convertible && !converted };
}
