import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { parseQuote } from '../../../scripts/lib/yahoo.mjs';
import { ENERGY_INSTRUMENTS, energyQuoteState } from '../energy-quotes';
import { quoteHealth } from '../quote-health';
import { quoteStatus, type Quote, type Snapshot } from '../snapshot';
import { EnergyQuotes } from '../../components/EnergyQuotes';
import { translate } from '../i18n';

const now=Date.parse('2026-11-23T19:00:00Z'), instrument=ENERGY_INSTRUMENTS[0];
const result={meta:{symbol:'BZ=F',currency:'USD',instrumentType:'FUTURE',exchangeName:'NYM',regularMarketPrice:86.9,regularMarketTime:now/1000-600,
  shortName:'Original contract Jan 27',currentTradingPeriod:{regular:{start:now/1000-3600,end:now/1000+3600}}}};
const quote=()=>parseQuote(result,instrument.id,instrument.symbol,now,instrument) as Quote;

describe('separate energy quote layer',()=>{
  it('uses distinct IDs and validates futures identity, units and exchange',()=>{
    expect(ENERGY_INSTRUMENTS.every(item=>String(item.id)!==item.seriesId)).toBe(true);
    expect(quote()).toMatchObject({instrumentType:'future',exchange:'NYMEX',unit:'USD/bbl',delayMinutes:null});
    for(const bad of [{instrumentType:'EQUITY'},{exchangeName:'ICE'},{currency:'NOK'},{symbol:'CL=F'}]) {
      expect(()=>parseQuote({meta:{...result.meta,...bad}},instrument.id,instrument.symbol,now,instrument)).toThrow();
    }
    expect(()=>parseQuote(result,'BRENT',instrument.symbol,now,instrument)).toThrow();
  });
  it('allows genuine nonpositive futures but rejects nonpositive equity quotes',()=>{
    for(const price of [0,-37.63]) {
      const input={meta:{...result.meta,regularMarketPrice:price}};
      expect(parseQuote(input,instrument.id,instrument.symbol,now,instrument).price).toBe(price);
      expect(()=>parseQuote(input,instrument.id,instrument.symbol,now)).toThrow();
    }
  });
  it('never resets observation age on retrieval, or claims a retained quote is fresh',()=>{
    expect(energyQuoteState(quote(),instrument,now).state).toBe('recent');
    expect(energyQuoteState({...quote(),checkedAt:new Date(now+6*60000).toISOString()},instrument,now+6*60000).state).toBe('delayed');
    expect(energyQuoteState({...quote(),status:'retained'},instrument,now).state).toBe('retained');
    expect(energyQuoteState(undefined,instrument,now).state).toBe('missing');
    expect(energyQuoteState({...quote(),unit:'USD'},instrument,now).usable).toBe(false);
    expect(energyQuoteState({...quote(),observedAt:new Date(now+120000).toISOString()},instrument,now).usable).toBe(false);
    expect(energyQuoteState({...quote(),checkedAt:'invalid'},instrument,now).usable).toBe(false);
  });
  it('does not apply the US cash-market calendar or equity counts to futures',()=>{
    const early=Date.parse('2026-11-23T08:00Z');
    const q={...quote(),observedAt:new Date(early-60000).toISOString(),checkedAt:new Date(early).toISOString()};
    expect(quoteStatus(q,early).label).toBe('Observed within 15 min · delayed feed');
    expect(quoteHealth({generated:q.checkedAt,targetMinutes:15,failures:[],quotes:{[q.id]:q}},now,[q.id,'AAPL'])).toMatchObject({expected:1,missing:['AAPL'],delayed:[]});
  });
  it('renders separate quote and official dates without substituting FRED values for missing futures',()=>{
    const snapshot={quotes:{quotes:{[instrument.id]:quote()}},seriesMap:new Map([['BRENT',{points:[['2026-11-17',92.94]],retrievedAt:'2026-11-23T18:41:18Z'}]])} as unknown as Snapshot;
    const html=renderToStaticMarkup(createElement(EnergyQuotes,{snapshot,now}));
    expect(html).toContain('86.90');expect(html).toContain('92.94');
    expect(html).toContain('2026-11-17');expect(html).toContain('2026-11-23T18:50:00.000Z');
    expect(html).toContain('Futures quote unavailable');expect(html).not.toContain('NaN');
    expect(html).toContain('Original contract Jan 27');expect(html).toContain('not disclosed');
  });
  it('translates status and keeps original provider contract wording intact',()=>{
    expect(translate('Observed within 15 min · delayed feed','nb-NO')).toBe('Observert siste 15 min · forsinket datakilde');
    expect(translate(result.meta.shortName,'nb-NO')).toBe(result.meta.shortName);
  });
});
