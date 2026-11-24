import { describe, expect, it, vi } from 'vitest';
import type { NexsiEvent } from '../nexsi-types';

const fixture = vi.hoisted(() => ({
  url: 'https://www.sec.gov/Archives/edgar/data/9999/000000999926000001/report.htm',
  text: 'Example issuer expects revenue of USD 10 billion for fiscal 2027.',
  fact: { category: 'guidance', topic: 'revenue', period: 'Fiscal 2027', text: 'The issuer forecast revenue of USD 10 billion.' },
}));

vi.mock('../../../scripts/lib/nexsi-reviewed-disclosures.mjs', async importOriginal => {
  const original = await importOriginal<typeof import('../../../scripts/lib/nexsi-reviewed-disclosures.mjs')>();
  const { createHash } = await import('node:crypto');
  const review = { url: fixture.url, reviewedAt: '2026-11-24', facts: [fixture.fact] };
  return {
    ...original,
    REVIEWED_DISCLOSURES: { ...original.REVIEWED_DISCLOSURES, ['a'.repeat(64)]: review },
    REVIEWED_TEXT_DISCLOSURES: { ...original.REVIEWED_TEXT_DISCLOSURES, [createHash('sha256').update(fixture.text).digest('hex')]: review },
  };
});

import { createDisclosureLoader } from '../../../scripts/lib/nexsi-disclosures.mjs';
import { REVIEWED_DISCLOSURES, REVIEWED_TEXT_DISCLOSURES } from '../../../scripts/lib/nexsi-reviewed-disclosures.mjs';

const now = Date.parse('2026-11-24T20:00:00Z');
const event: NexsiEvent = { kind: 'filing', title: '8-K', form: '8-K', items: '1.01', issuerCik: 9999, source: 'SEC EDGAR', publishedAt: '2026-11-19T20:00:00Z', url: fixture.url };
const html = (nonce: number, text = fixture.text) => `<html><head><script>nonce=${nonce}</script></head><body><p>${text}</p></body></html>`;
const response = (body: string) => ({ ok: true, text: async () => body });

describe('Reviewed disclosures through repeated source refreshes', () => {
  it('requires an exact visible-text review for every registered source URL', () => {
    const visible = Object.entries(REVIEWED_TEXT_DISCLOSURES);
    for (const review of Object.values(REVIEWED_DISCLOSURES)) {
      const matches = visible.filter(([, candidate]) => candidate.url === review.url);
      expect(matches.length, `Missing text review for ${review.url}`).toBeGreaterThan(0);
      for (const [hash, candidate] of matches) {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(candidate.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('re-fetches a healthy reviewed source, tolerates wrapper changes, and rejects a corrected figure immediately', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(html(1)))
      .mockResolvedValueOnce(response(html(2)))
      .mockResolvedValueOnce(response(html(3, fixture.text.replace('10 billion', '12 billion'))));
    const first = await createDisclosureLoader({ now, fetchImpl, sleep: async () => {} })(event);
    const nextLoader = createDisclosureLoader({ now: now + 60000, fetchImpl, sleep: async () => {} });
    const second = await nextLoader({ ...event, summary: first });
    expect(second.issue).toBeNull();
    expect(second.facts).toEqual(first.facts);
    expect(second.documents[0].sha256).not.toBe(first.documents[0].sha256);
    expect(second.documents[0].textSha256).toBe(first.documents[0].textSha256);
    expect(second.documents[0].retrievedAt).toBe(new Date(now + 60000).toISOString());
    // Reuse within one full-refresh invocation must not fetch a source twice.
    expect(await nextLoader({ ...event, summary: first })).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const third = await createDisclosureLoader({ now: now + 120000, fetchImpl, sleep: async () => {} })({ ...event, summary: second });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(third.issue).toContain('Reviewed disclosure content changed');
    expect(third.facts.filter((fact: { method: string }) => fact.method === 'reviewed')).toEqual([]);
  });

  it('rechecks a newly repaired review without waiting for the previous error cache', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(html(4)));
    const old = { version: 5, checkedAt: new Date(now - 60000).toISOString(), issue: 'Reviewed disclosure content changed; its reviewed summary requires source verification', documents: [], facts: [] };
    const result = await createDisclosureLoader({ now, fetchImpl, sleep: async () => {} })({ ...event, summary: old });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.issue).toBeNull();
    expect(result.facts[0]).toMatchObject({ ...fixture.fact, method: 'reviewed', reviewedAt: '2026-11-24' });
  });

  it('preserves original source dates and a visible failure when a reviewed source cannot be rechecked', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(html(5))).mockResolvedValueOnce({ ok: false, status: 503 });
    const first = await createDisclosureLoader({ now, fetchImpl, sleep: async () => {} })(event);
    const next = await createDisclosureLoader({ now: now + 60000, fetchImpl, sleep: async () => {} })({ ...event, summary: first });
    expect(next.issue).toContain('503');
    expect(next.facts).toEqual(first.facts);
    expect(next.documents).toEqual(first.documents);
    expect(next.checkedAt).toBe(new Date(now + 60000).toISOString());
  });
});
