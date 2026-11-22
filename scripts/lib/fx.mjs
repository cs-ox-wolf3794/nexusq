import { get } from './http.mjs';
export const FX_URL = 'https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP?format=sdmx-json&lastNObservations=10&locale=en';
export const FX_SOURCE = 'https://www.norges-bank.no/en/topics/statistics/exchange_rates/?id=USD';
export function parseNorgesBank(payload, now = Date.now()) {
  const data = payload?.data, structure = data?.structure;
  const dimensions = structure?.dimensions?.series;
  const rows = data?.dataSets?.[0]?.series;
  if (!Array.isArray(dimensions) || !rows || Object.keys(rows).length !== 1) throw new Error('Exchange-rate series unavailable or ambiguous');
  const [key,row] = Object.entries(rows)[0];
  const indices = key.split(':').map(Number);
  const identity = Object.fromEntries(dimensions.map((d,i) => [d.id,d.values?.[indices[i]]?.id]));
  if (identity.FREQ !== 'B' || identity.BASE_CUR !== 'USD' || identity.QUOTE_CUR !== 'NOK' || identity.TENOR !== 'SP') throw new Error('Exchange-rate currency/direction mismatch');
  const attrs = structure.attributes?.series ?? [];
  const multiplierIndex = attrs.findIndex(a => a.id === 'UNIT_MULT');
  if (multiplierIndex < 0 || attrs[multiplierIndex].values?.[row.attributes?.[multiplierIndex]]?.id !== '0') throw new Error('Exchange-rate unit multiplier unsupported');
  const dates = structure.dimensions.observation?.find(d => d.id === 'TIME_PERIOD')?.values;
  const points = Object.entries(row.observations ?? {}).map(([i,value]) => {
    const date = dates?.[Number(i)]?.id, rate = value?.[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || rate === '' || rate == null || !Number.isFinite(Number(rate)) || Number(rate) <= 0) throw new Error('Invalid exchange-rate observation');
    const ms = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== date || ms > now) throw new Error('Invalid exchange-rate date');
    return [date,Number(rate)];
  }).sort((a,b) => a[0].localeCompare(b[0]));
  const last = points.at(-1);
  if (!last || now - Date.parse(last[0] + 'T00:00:00Z') > 7 * 86400000) throw new Error('Exchange-rate observation is overdue');
  return { observedAt:last[0], nokPerUsd:last[1] };
}
export async function refreshFx(previous, generated = new Date().toISOString(), fetcher = get) {
  try {
    const latest = parseNorgesBank(await fetcher(FX_URL,true,{retries:2,timeout:15000}),Date.parse(generated));
    if (previous?.observedAt > latest.observedAt) throw new Error('Exchange-rate feed regressed');
    return {schemaVersion:1,base:'USD',quote:'NOK',source:'Norges Bank',sourceUrl:FX_SOURCE,generated,retrievedAt:generated,...latest,status:'available'};
  } catch (error) {
    const base = {schemaVersion:1,base:'USD',quote:'NOK',source:'Norges Bank',sourceUrl:FX_SOURCE,generated};
    return {...base,retrievedAt:previous?.retrievedAt??null,observedAt:previous?.observedAt??null,nokPerUsd:previous?.nokPerUsd??null,status:previous?.nokPerUsd?'retained':'unavailable',error:error.message};
  }
}
