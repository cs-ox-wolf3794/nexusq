import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dataOnlyChanges } from '../../../scripts/lib/deployment-scope.mjs';
import { dueWork } from '../../../ops/refresh-watchdog/core.mjs';

describe('Independent data recovery',()=>{
  it('allows only generated JSON to inherit identical application-code validation',()=>{
    expect(dataOnlyChanges(['public/data/quotes.json','public/data/manifest.json','public/data/ledger/2026-11-24.json'])).toBe(true);
    for(const path of ['src/App.tsx','scripts/refresh-data.mjs','src/lib/__tests__/nexsum.test.ts','package-lock.json','.github/workflows/deploy.yml','public/index.html','public/data/run.js','public/data/../index.json']) {
      expect(dataOnlyChanges(['public/data/quotes.json',path]),path).toBe(false);
    }
    expect(dataOnlyChanges(null)).toBe(false);
  });
  it('records preflight failures, preserves the full-refresh error and continues independent quotes',()=>{
    const workflow=readFileSync(new URL('../../../.github/workflows/refresh-data.yml',import.meta.url),'utf8');
    const steps=workflow.split(/\n      - name: /);
    const verify=steps.find(step=>step.startsWith('Verify analytical code'))!;
    expect(verify).toContain('id: verify');expect(verify).toContain('continue-on-error: true');
    const prepare=steps.find(step=>step.startsWith('Install public membership'))!;
    expect(prepare).toContain('continue-on-error: true');
    expect(steps.find(step=>step.startsWith('Refresh timestamped quotes'))).not.toMatch(/\n        if:/);
    const record=steps.find(step=>step.startsWith('Record analytical refresh outcome'))!;
    expect(record).toContain("if: steps.scope.outputs.mode == 'full'");
    expect(record).toContain('steps.verify.outcome');expect(record).toContain('steps.prepare.outcome');
    expect(record).toContain('REFRESH_FAILURE_STAGE');
    const surface=steps.find(step=>step.startsWith('Surface refresh failure'))!;
    expect(surface).toContain("steps.verify.outcome == 'failure'");expect(surface).toContain('exit 1');
    const deployment=readFileSync(new URL('../../../.github/workflows/deploy.yml',import.meta.url),'utf8');
    expect(deployment).toContain('node scripts/deployment-scope.mjs');
    expect(deployment).toContain("if: steps.scope.outputs.data_only != 'true'");
    // Data integrity, type-check/build and live verification remain mandatory.
    expect(deployment).toContain('- run: npm run data:validate');expect(deployment).toContain('- run: npm run build');
    expect(deployment).toContain('node --import tsx scripts/verify-production.mjs');
  });
  it('uses a dated analytical failure to back off full retries while quotes recover',()=>{
    const now=Date.parse('2026-11-24T18:30Z');
    const status={outcome:'failure',attemptedAt:'2026-11-24T18:26Z',failureStage:'analytical-verification'};
    expect(dueWork(now,{generated:'2026-11-24T18:25Z'},status).mode).toBe('quotes');
    expect(dueWork(now+10*60000,{generated:'2026-11-24T18:35Z'},status).mode).toBe('full');
  });
});
