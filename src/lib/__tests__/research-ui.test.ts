import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Snapshot } from '../snapshot';
import { dataExceptions, displayDate, displayInstant, elapsedLabel, quoteCheckOverdue, quoteScheduleActive, readActivity, usCashSession } from '../research-ui';

function snapshot(): Snapshot {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../public/data/${name}.json`, import.meta.url), 'utf8'));
  const catalog = read('catalog');
  return { revision: 'fixture', catalog, seriesMap: new Map(catalog.series.map((s: {id: string}) => [s.id, read(s.id)])),
    quality: read('quality'), forecasts: read('forecasts'), impact: null, cot: null, backtest: null,
    quotes: read('quotes'), health: read('health'), nexsi: read('nexsi'), refreshStatus: read('refresh-status') };
}

describe('Research timestamps and scheduled sessions', () => {
  it('keeps date-only observations free of invented midnight times', () => {
    expect(displayInstant('2026-11-20', 'ET')).toBe('Nov 20, 2026');
    expect(displayDate('2026-02-30')).toBe('Not recorded');
    expect(displayInstant(null)).toBe('Not recorded');
    expect(elapsedLabel('2026-11-20', Date.parse('2026-11-21T12:00Z'))).toBe('Time not recorded');
  });
  it('renders real instants in explicit time zones, including DST and date boundaries', () => {
    expect(displayInstant('2026-11-21T00:30:00Z', 'ET')).toBe('Nov 20, 2026 · 19:30 ET');
    expect(displayInstant('2026-07-15T20:00:00Z', 'ET')).toBe('Jul 15, 2026 · 16:00 ET');
    expect(displayInstant('2026-11-21T00:30:00Z')).toBe('Nov 21, 2026 · 00:30 UTC');
  });
  it('does not label invalid or future check times as recent', () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    expect(elapsedLabel('invalidT', now)).toBe('Check timestamp');
    expect(elapsedLabel('2026-11-22T12:02:00Z', now)).toBe('Check timestamp');
    expect(elapsedLabel('2026-11-22T10:35:00Z', now)).toBe('1h 25m ago');
  });
  it('uses scheduled opening, closing, holidays and early closing without claiming live exchange status', () => {
    const phase = (date: string) => usCashSession(Date.parse(date)).phase;
    expect(phase('2026-11-23T14:29:00Z')).toBe('closed');
    expect(phase('2026-11-23T14:30:00Z')).toBe('open');
    expect(phase('2026-11-23T21:00:00Z')).toBe('closed');
    expect(phase('2026-11-26T16:00:00Z')).toBe('closed');
    expect(phase('2026-11-27T17:59:00Z')).toBe('open');
    expect(phase('2026-11-27T18:00:00Z')).toBe('closed');
    expect(phase('2026-11-22T16:00:00Z')).toBe('closed');
    expect(phase('2029-11-23T16:00:00Z')).toBe('unknown');
    expect(usCashSession(NaN).phase).toBe('unknown');
  });
  it('distinguishes the existing UTC refresh schedule from the cash-market session', () => {
    expect(quoteScheduleActive(Date.parse('2026-11-23T11:59:00Z'))).toBe(false);
    expect(quoteScheduleActive(Date.parse('2026-11-23T12:00:00Z'))).toBe(true);
    expect(quoteScheduleActive(Date.parse('2026-11-23T23:59:00Z'))).toBe(true);
    expect(quoteScheduleActive(Date.parse('2026-11-22T16:00:00Z'))).toBe(false);
    expect(quoteScheduleActive(NaN)).toBe(false);
  });
});

describe('Operational exceptions and local activity', () => {
  it('keeps a closed-weekend quote schedule neutral but reports an overdue scheduled check', () => {
    const s = snapshot(); s.quotes!.generated = '2026-11-20T23:30:00Z';
    expect(dataExceptions(s, Date.parse('2026-11-22T20:00:00Z'), null).some(e => e.id === 'quote-schedule')).toBe(false);
    expect(dataExceptions(s, Date.parse('2026-11-23T16:00:00Z'), null).some(e => e.id === 'quote-schedule')).toBe(true);
  });
  it('allows the first scheduled weekday check its grace period after an overnight pause', () => {
    expect(quoteCheckOverdue('2026-11-20T23:52:00Z', Date.parse('2026-11-23T12:00:00Z'))).toBe(false);
    expect(quoteCheckOverdue('2026-11-20T23:52:00Z', Date.parse('2026-11-23T12:37:00Z'))).toBe(false);
    expect(quoteCheckOverdue('2026-11-20T23:52:00Z', Date.parse('2026-11-23T12:38:00Z'))).toBe(true);
    expect(quoteCheckOverdue('2026-11-23T12:22:00Z', Date.parse('2026-11-23T12:38:00Z'))).toBe(false);
  });
  it('still reports failed source updates outside market hours and separates withholding from partial coverage', () => {
    const s = snapshot(); s.quotes!.failures = ['NVDA']; s.nexsi!.status = 'degraded';
    const now = Date.parse(s.nexsi!.generated);
    const errors = dataExceptions(s, now, null);
    expect(errors.find(e => e.id === 'quotes-failed')?.tone).toBe('warning');
    expect(errors.find(e => e.id === 'nexsi-sources')?.tone).toBe('warning');
    s.nexsi!.status = 'retained';
    expect(dataExceptions(s, now, null).find(e => e.id === 'nexsi')?.tone).toBe('critical');
  });
  it('reports unavailable and unverifiable publications explicitly', () => {
    expect(dataExceptions(null, Date.now(), 'Checksum failed')[0]).toMatchObject({ id:'publication', tone:'critical' });
    const s = snapshot(); s.quotes = null; s.nexsi = null;
    const errors = dataExceptions(s, Date.parse(s.catalog.generated), null);
    expect(errors.some(e => e.id === 'quotes-missing')).toBe(true);
    expect(errors.some(e => e.id === 'nexsi')).toBe(true);
  });
  it('rejects malformed local history and caps it without turning it into market evidence', () => {
    const record = { id: 'saved', at: '2026-11-22T12:00:00Z', title:'View saved', detail:'Saved in this browser.', tone:'info' };
    expect(readActivity('{broken')).toEqual([]);
    expect(readActivity(JSON.stringify([null, {}, { ...record, at: 'invalid' }, record]))).toEqual([record]);
    expect(readActivity(JSON.stringify(Array.from({length:50}, (_,i) => ({...record,id:String(i)}))))).toHaveLength(40);
  });
});
