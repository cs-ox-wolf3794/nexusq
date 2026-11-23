import type { Quote } from './snapshot';

// Separate identifiers prevent rolling futures quotes from entering FRED spot histories.
export const ENERGY_INSTRUMENTS = [
  { id: 'BRENT_FUTURES', seriesId: 'BRENT', symbol: 'BZ=F', name: 'Brent', unit: 'USD/bbl', digits: 2,
    contract: 'Brent Crude Oil Last Day Financial Futures',
    contractUrl: 'https://www.cmegroup.com/rulebook/NYMEX/6/698.pdf', fredId: 'DCOILBRENTEU' },
  { id: 'WTI_FUTURES', seriesId: 'WTI', symbol: 'CL=F', name: 'WTI', unit: 'USD/bbl', digits: 2,
    contract: 'WTI Light Sweet Crude Oil Futures',
    contractUrl: 'https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.contractSpecs.html', fredId: 'DCOILWTICO' },
  { id: 'HENRYHUB_FUTURES', seriesId: 'HENRYHUB', symbol: 'NG=F', name: 'Henry Hub', unit: 'USD/MMBtu', digits: 3,
    contract: 'Henry Hub Natural Gas Futures',
    contractUrl: 'https://www.cmegroup.com/markets/energy/natural-gas/natural-gas.contractSpecs.html', fredId: 'DHHNGSP' },
] as const;
export type EnergyInstrument = typeof ENERGY_INSTRUMENTS[number];
export const isEnergyQuote = (id: string) => ENERGY_INSTRUMENTS.some(item => item.id === id);

/** Never infer futures exchange hours from the US equity calendar. No stale quote is called live. */
export function energyQuoteState(quote: Quote | undefined, instrument: EnergyInstrument, now: number) {
  if (!quote) return { usable: false, state: 'missing', label: 'Futures quote unavailable' } as const;
  const observed = Date.parse(quote.observedAt), checked = Date.parse(quote.checkedAt);
  const start = Date.parse(quote.sessionStart), end = Date.parse(quote.sessionEnd);
  if (quote.id !== instrument.id || quote.symbol !== instrument.symbol || quote.instrumentType !== 'future'
    || quote.currency !== 'USD' || quote.unit !== instrument.unit || quote.exchange !== 'NYMEX'
    || ![now, observed, checked, start, end, quote.price].every(Number.isFinite) || end <= start
    || observed > checked + 60000 || observed > now + 60000 || checked > now + 60000) {
    return { usable: false, state: 'invalid', label: 'Futures quote failed validation' } as const;
  }
  if (quote.status === 'retained') return { usable: true, state: 'retained', label: 'Update failed · last quote retained' } as const;
  if (quote.status !== 'available') return { usable: false, state: 'invalid', label: 'Futures quote failed validation' } as const;
  if (now - observed > 15 * 60000 || now - checked > 15 * 60000) {
    return { usable: true, state: 'delayed', label: 'Older quote · review observation time' } as const;
  }
  return { usable: true, state: 'recent', label: 'Observed within 15 min · delayed feed' } as const;
}
