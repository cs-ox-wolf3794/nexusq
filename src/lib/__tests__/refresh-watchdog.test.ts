import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { dueWork, runningWork, readPublication } from '../../../ops/refresh-watchdog/core.mjs';
import { signTicket, verifyTicket, verifyBackupDispatch } from '../../../ops/refresh-watchdog/ticket.mjs';
import worker, { checkAndRecover } from '../../../ops/refresh-watchdog/worker.mjs';
import { refreshProvenance } from '../../../scripts/lib/refresh-provenance.mjs';

const now=Date.parse('2026-11-23T17:00:00Z');
const secret='test-only-signing-key-'.repeat(4);
const nonce='bb44a6c7-28fe-4ba6-adb0-6bf088a61be1';
const at=(minutes: number)=>new Date(now+minutes*60000).toISOString();
const fields={mode:'quotes',issuedAt:at(0),scheduledAt:at(0),nonce};
const event={cron:'*/5 * * * *',scheduledTime:now};
const env={ENABLED:'true',WATCHDOG_SIGNING_KEY:secret,GITHUB_ACTIONS_TOKEN:'test-only-token'};
const status={outcome:'success',attemptedAt:'2026-11-23T16:25:00Z'};
const quote=(minutes=-5)=>({generated:at(minutes),quotes:{NVDA:{price:100}},failures:[]});
const hash=(value: string)=>createHash('sha256').update(value).digest('hex');
function fixture(minutes=-5, runs: object[]=[]) {
  const texts={'quotes.json':JSON.stringify(quote(minutes)),'refresh-status.json':JSON.stringify(status)};
  const files=Object.fromEntries(Object.entries(texts).map(([key,value])=>[key,hash(value)]));
  const manifest={schemaVersion:1,files,revision:hash(JSON.stringify(files))};
  const fetcher=vi.fn(async (input: RequestInfo | URL, options?: RequestInit)=>{
    // Workers supports manual redirects, not Node's redirect:error mode.
    if(options?.redirect!=='manual')throw Error('Edge fetch requires manual redirect handling');
    const url=new URL(String(input));
    if(url.pathname.endsWith('/manifest.json'))return Response.json(manifest);
    const name=url.pathname.split('/').at(-1)!;
    if(name in texts)return new Response(texts[name as keyof typeof texts]);
    if(url.pathname.endsWith('/actions/runs'))return Response.json({total_count:runs.length,workflow_runs:runs});
    if(url.pathname.endsWith('/dispatches')&&options?.method==='POST')return new Response(null,{status:204});
    throw Error(`Unexpected request: ${url.pathname}`);
  });
  return {fetcher,texts,manifest};
}

describe('Independent scheduler decisions',()=>{
  it('refreshes quotes before the price-age budget is exhausted, but skips fresh publication',()=>{
    expect(dueWork(now,quote(-4),status).mode).toBe('quotes');
    expect(dueWork(now,quote(-3),status).mode).toBeNull();
  });
  it('does not treat future, invalid or missing timestamps as healthy',()=>{
    for(const generated of [at(2),'invalid',undefined])expect(dueWork(now,{generated},status).mode).toBe('quotes');
  });
  it('catches up the full source refresh and backs off recent failed attempts',()=>{
    expect(dueWork(now,quote(0),{outcome:'success',attemptedAt:at(-120)}).mode).toBe('full');
    expect(dueWork(now,quote(-5),{outcome:'failure',attemptedAt:at(-5)}).mode).toBe('quotes');
    expect(dueWork(now,quote(0),{outcome:'failure',attemptedAt:at(-11)}).mode).toBe('full');
  });
  it('handles weekends, overnight and the bounded full-refresh catch-up window',()=>{
    expect(dueWork(Date.parse('2026-11-22T17:00Z')).mode).toBeNull();
    expect(dueWork(Date.parse('2026-11-24T02:00Z')).mode).toBeNull();
    expect(dueWork(Date.parse('2026-11-21T06:20Z')).mode).toBe('full');
    expect(dueWork(Date.parse('2026-11-21T09:00Z')).mode).toBeNull();
  });
  it('handles a one-time full recovery only after its date, until success or expiry',()=>{
    expect(dueWork(now,quote(0),status,at(-1))).toMatchObject({mode:'full',reason:'One-time full recovery requested'});
    expect(dueWork(now,quote(0),{outcome:'success',attemptedAt:at(0)},at(-1)).mode).toBeNull();
    expect(dueWork(now,quote(0),status,at(1)).mode).toBeNull();
    expect(dueWork(now,quote(0),status,at(-121)).mode).toBeNull();
    expect(dueWork(now,quote(0),status,'invalid').mode).toBeNull();
  });
  it('suppresses competing refreshes and active publication, and exposes stalled work',()=>{
    const run={id:1,head_branch:'main',status:'queued',created_at:at(-3),path:'.github/workflows/backup-refresh.yml'};
    expect(runningWork([run],now)).toMatchObject({blocked:true,stalled:false,runId:1});
    expect(runningWork([{...run,created_at:at(-23)}],now)).toMatchObject({blocked:true,stalled:true});
    expect(runningWork([{...run,path:'.github/workflows/deploy.yml'}],now).blocked).toBe(true);
    expect(runningWork([{...run,head_branch:'feature'}],now).blocked).toBe(false);
    expect(runningWork([{...run,status:'completed'}],now).blocked).toBe(false);
  });
});

describe('Publication checks before recovery',()=>{
  it('checks both the manifest revision and every consumed file checksum',async()=>{
    const f=fixture();
    expect((await readPublication(f.fetcher,now)).quotes.generated).toBe(at(-5));
    f.manifest.revision='0'.repeat(64);
    await expect(readPublication(f.fetcher,now)).rejects.toThrow('integrity');
  });
  it('rejects corrupt published files and future quote timestamps',async()=>{
    const f=fixture(); f.texts['quotes.json']='{}';
    await expect(readPublication(f.fetcher,now)).rejects.toThrow('checksum');
    await expect(readPublication(fixture(2).fetcher,now)).rejects.toThrow('Invalid quote');
  });
  it('rejects redirects without forwarding credentials or trusting a different publication',async()=>{
    await expect(readPublication(async()=>new Response(null,{status:302,headers:{Location:'https://example.com'}}),now)).rejects.toThrow('HTTP 302');
    const f=fixture();
    const redirected=vi.fn((url: RequestInfo | URL,options?: RequestInit)=>String(url).includes('api.github.com')?Promise.resolve(new Response(null,{status:302})):f.fetcher(url,options));
    await expect(checkAndRecover(event,env,redirected,now)).rejects.toThrow('HTTP 302');
    expect(redirected.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
  });
});

describe('Authenticated automatic origin',()=>{
  it('accepts a current signed scheduled request',async()=>{
    const ticket=await signTicket(secret,fields);
    expect(await verifyTicket(secret,ticket,now)).toEqual({source:'cloudflare',mode:'quotes',nonce,scheduledAt:at(0)});
  });
  it('rejects unsigned, altered and wrong-key requests',async()=>{
    const ticket=await signTicket(secret,fields);
    await expect(verifyTicket(secret,{...ticket,mode:'full'},now)).rejects.toThrow('signature');
    await expect(verifyTicket('different-key'.repeat(5),ticket,now)).rejects.toThrow('signature');
    await expect(verifyTicket(secret,{...ticket,signature:''},now)).rejects.toThrow('Invalid');
  });
  it('rejects expired, future-dated and replayed tickets',async()=>{
    const ticket=await signTicket(secret,fields);
    await expect(verifyTicket(secret,ticket,now+11*60000)).rejects.toThrow('expired');
    await expect(verifyTicket(secret,ticket,now-2*60000)).rejects.toThrow('future');
    await expect(verifyTicket(secret,ticket,now,[nonce])).rejects.toThrow('already used');
  });
  it('does not credit a manual rerun of a failed backup as a new automatic check',async()=>{
    const ticket=await signTicket(secret,fields);
    const context={eventName:'workflow_dispatch',runAttempt:'1',now,usedNonces:[]};
    expect((await verifyBackupDispatch(secret,ticket,context)).source).toBe('cloudflare');
    await expect(verifyBackupDispatch(secret,ticket,{...context,runAttempt:'2'})).rejects.toThrow('manual rerun');
    await expect(verifyBackupDispatch(secret,ticket,{...context,eventName:'push'})).rejects.toThrow('new signed dispatch');
  });
  it('never gives manual refreshes automatic credit and preserves the last actual origin',()=>{
    const manual={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'cs-ox-wolf3794/nexusq',GITHUB_RUN_ID:'123'};
    expect(refreshProvenance(null,manual,at(0)).lastAutomaticAt).toBeNull();
    const previous={lastScheduledAt:at(-100),lastAutomaticAt:at(-10),lastAutomaticSource:'cloudflare'};
    expect(refreshProvenance(previous,manual,at(0))).toMatchObject(previous);
    const backup={...manual,REFRESH_AUTOMATION_SOURCE:'cloudflare',REFRESH_BACKUP_NONCE:nonce,REFRESH_BACKUP_SCHEDULED_AT:at(0)};
    expect(refreshProvenance(previous,backup,at(0))).toMatchObject({lastAutomaticAt:at(0),lastAutomaticSource:'cloudflare',lastScheduledAt:at(-100),usedBackupNonces:[nonce]});
    expect(refreshProvenance(previous,{...manual,GITHUB_EVENT_NAME:'schedule'},at(0))).toMatchObject({lastAutomaticAt:at(0),lastAutomaticSource:'github',lastScheduledAt:at(0)});
  });
});

describe('Cloudflare recovery transport',()=>{
  it('has no public control route and makes no requests when disabled',async()=>{
    const f=fixture();
    expect((await worker.fetch()).status).toBe(404);
    expect(await checkAndRecover(event,{...env,ENABLED:'false'},f.fetcher,now)).toEqual({action:'disabled'});
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('does no GitHub work when a recent publication is verified',async()=>{
    const f=fixture(-2);
    expect((await checkAndRecover(event,env,f.fetcher,now)).action).toBe('no_refresh');
    expect(f.fetcher.mock.calls.some(([url])=>String(url).includes('api.github.com'))).toBe(false);
  });
  it('dispatches a signed request and reports acceptance, not successful recovery',async()=>{
    const f=fixture();
    const result=await checkAndRecover(event,env,f.fetcher,now);
    expect(result).toMatchObject({action:'dispatched',mode:'quotes'});
    const [,options]=f.fetcher.mock.calls.find(([,options])=>options?.method==='POST')!;
    const body=JSON.parse(String(options!.body));
    expect(body.ref).toBe('main');
    expect((await verifyTicket(secret,JSON.parse(body.inputs.ticket),now)).source).toBe('cloudflare');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(env.GITHUB_ACTIONS_TOKEN);
  });
  it('recovers from an unavailable publication but fails closed when GitHub cannot be checked',async()=>{
    const f=fixture();
    const outage=vi.fn((url: RequestInfo | URL,options?: RequestInit)=>String(url).startsWith('https://nexus.')?Promise.resolve(new Response(null,{status:503})):f.fetcher(url,options));
    expect(await checkAndRecover(event,env,outage,now)).toMatchObject({action:'dispatched',publicationIssue:'Publication HTTP 503'});
    for(const status of [401,429,503]) {
      const denied=vi.fn((url: RequestInfo | URL,options?: RequestInit)=>String(url).includes('api.github.com')?Promise.resolve(new Response(null,{status})):f.fetcher(url,options));
      await expect(checkAndRecover(event,env,denied,now)).rejects.toThrow(`HTTP ${status}`);
      expect(denied.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
    }
  });
  it('avoids duplicate dispatch and explicitly reports stalled runs',async()=>{
    const run={id:99,head_branch:'main',status:'in_progress',created_at:at(-3),path:'.github/workflows/refresh-data.yml'};
    const f=fixture(-5,[run]);
    expect(await checkAndRecover(event,env,f.fetcher,now)).toMatchObject({action:'in_progress',runId:99});
    expect(f.fetcher.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
    await expect(checkAndRecover(event,env,fixture(-5,[{...run,created_at:at(-23)}]).fetcher,now)).rejects.toThrow('stalled');
  });
});
