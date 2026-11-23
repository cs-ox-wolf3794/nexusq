import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { verifyTicket } from './ticket.mjs';

// Run real Workers fetch/crypto APIs, with outbound requests intercepted locally.
// No production credential or network dispatch is used by this test entry point.
const now=Date.parse('2026-11-23T17:00:00Z'),secret='local-edge-test-key-'.repeat(4);
let ageMinutes=5,redirectApi=false,dispatches=0;
const hash=text=>createHash('sha256').update(text).digest('hex');
const root=fileURLToPath(new URL('.',import.meta.url));
const mf=new Miniflare(convertV4MiniflareOptions({
  compatibilityDate:'2026-11-23',modulesRoot:root,
  modules:[{type:'ESModule',path:`${root}test-entry.mjs`,contents:`
    import {checkAndRecover} from './worker.mjs';
    export default {async fetch(request,env) {
      try {return Response.json(await checkAndRecover({cron:'*/5 * * * *',scheduledTime:${now}},env,fetch,${now}));}
      catch(error){return Response.json({error:error.message},{status:500});}
    }};`},...['worker.mjs','core.mjs','ticket.mjs'].map(file=>({type:'ESModule',path:`${root}${file}`}))],
  bindings:{ENABLED:'true',WATCHDOG_SIGNING_KEY:secret,GITHUB_ACTIONS_TOKEN:'local-test-only'},
  outboundService:async request=>{
    const url=new URL(request.url);
    const texts={'quotes.json':JSON.stringify({generated:new Date(now-ageMinutes*60000).toISOString(),quotes:{NVDA:{price:100}},failures:[]}),
      'refresh-status.json':JSON.stringify({outcome:'success',attemptedAt:'2026-11-23T16:25:00Z'})};
    const files=Object.fromEntries(Object.entries(texts).map(([name,text])=>[name,hash(text)]));
    if(url.hostname==='nexus.gygante.com') {
      const name=url.pathname.split('/').at(-1);
      return name==='manifest.json'?Response.json({schemaVersion:1,files,revision:hash(JSON.stringify(files))}):new Response(texts[name]);
    }
    assert.equal(url.hostname,'api.github.com');
    assert.equal(request.headers.get('Authorization'),'Bearer local-test-only');
    if(redirectApi)return new Response(null,{status:302,headers:{Location:'https://example.com/forbidden'}});
    if(url.pathname.endsWith('/actions/runs'))return Response.json({total_count:0,workflow_runs:[]});
    assert.equal(request.method,'POST');
    const body=await request.json();
    assert.equal(body.ref,'main');
    assert.equal((await verifyTicket(secret,JSON.parse(body.inputs.ticket),now)).source,'cloudflare');
    dispatches++;
    return new Response(null,{status:204});
  },
}));
try {
  let response=await mf.dispatchFetch('http://localhost/test');
  let result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(result.action,'dispatched');
  assert.equal(result.publicationIssue,undefined);
  assert.equal(dispatches,1);
  ageMinutes=2;
  response=await mf.dispatchFetch('http://localhost/test');
  assert.equal((await response.json()).action,'no_refresh');
  assert.equal(dispatches,1);
  ageMinutes=5;redirectApi=true;
  response=await mf.dispatchFetch('http://localhost/test');
  result=await response.json();
  assert.match(result.error,/HTTP 302/);
  assert.equal(dispatches,1);
  console.log('Workers runtime: verified publication, signed recovery, fresh-data no-op and redirect rejection passed.');
}finally{await mf.dispose();}
