import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { quoteHealth } from '../src/lib/quote-health.ts';
import { validateNexsi,nexsiStatus } from '../src/lib/nexsi-quality.ts';
import { companyNewsCoverage } from '../src/lib/company-news.ts';
import { mapLimit } from './lib/http.mjs';

const origin='https://nexus.gygante.com';
const digest=text=>createHash('sha256').update(text).digest('hex');
const get=async name=>{
  const response=await fetch(`${origin}/data/${name}${name.includes('?')?'&':'?'}verify=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`Live publication HTTP ${response.status}: ${name.split('?')[0]}`);
  return response.text();
};
let publication,lastError;
for(let attempt=0;attempt<4;attempt++){
  try{
    const manifest=JSON.parse(await get('manifest.json'));
    if(manifest.schemaVersion!==1||digest(JSON.stringify(manifest.files))!==manifest.revision)throw Error('Live manifest integrity failed');
    const files={};
    await mapLimit(Object.entries(manifest.files),6,async([name,hash])=>{
      if(!/^[\w-]+\.json$/.test(name)||!/^[a-f\d]{64}$/.test(hash))throw Error('Invalid manifest entry');
      const text=await get(`${name}?v=${hash}`);
      if(digest(text)!==hash)throw Error(`Live checksum mismatch: ${name}`);
      files[name]=JSON.parse(text);
    });
    validateNexsi(files['nexsi.json']);publication={manifest,files};break;
  }catch(error){lastError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,10000));}
}
if(!publication)throw lastError;
const {manifest,files}=publication,now=Date.now(),nexsi=files['nexsi.json'],quotes=files['quotes.json'];
const expected=[...files['catalog.json'].series.filter(s=>s.source==='Yahoo Finance').map(s=>s.id),...files['impact.json'].companies.map(c=>c.id),...nexsi.universe.members.map(c=>c.symbol)];
const health=quoteHealth(quotes,now,expected);
const coverage={};for(const company of nexsi.companies){const status=companyNewsCoverage(company,company.moves[1]??{start:company.asOf,end:company.asOf},now).status;coverage[status]=(coverage[status]??0)+1;}
const lines=[`Live publication verified: ${manifest.revision}`,`${Object.keys(files).length} data files matched their published checksums.`,
  `Quotes: ${Object.keys(quotes.quotes).length}/${health.expected}; checked ${quotes.generated}; ${quotes.failures.length} retrieval failures; ${health.missing.length} missing.`,
  `Quote refresh trigger: ${quotes.refresh?.trigger??'not recorded'}${quotes.refresh?.runUrl?`; ${quotes.refresh.runUrl}`:''}.`,
  health.open?`US market scheduled open: ${health.withinTarget}/${health.expected} quotes within 15 minutes; ${health.delayed.length} delayed or invalid.`:'US market scheduled closed: intraday 15-minute target not evaluated. This run does not certify sustained market-hours delivery.',
  `NexSI: ${nexsi.generated}; ${nexsi.status}; ${nexsi.companies.filter(c=>c.moves[1]).length} daily models; ${nexsiStatus(nexsi,now)??'current analytical snapshot'}.`,
  `Company-news coverage: ${JSON.stringify(coverage)}. Empty source windows do not prove no relevant news.`,
  `Latest core refresh: ${files['refresh-status.json']?.outcome??'not recorded'}; ${files['refresh-status.json']?.attemptedAt??'not recorded'}.`,
  `QC: ${files['health.json']?.coreFailures?.length??0} core source failures; ${files['health.json']?.enrichmentIssues?.length??0} supplementary exceptions.`];
console.log(lines.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Live production verification\n\n${lines.join('\n\n')}\n`);
if(health.delayed.length||health.missing.length||quotes.failures.length||nexsi.status!=='ok'||nexsiStatus(nexsi,now))console.warn('::warning::Live data has freshness or source exceptions. Review the published status; successful deployment is not evidence of 15-minute compliance.');
// Verification runs after publication: keep healthy data live, but never give a
// green verification result to a market-hours price-age or quote-coverage breach.
if(health.missing.length||(health.open&&(health.delayed.length||quotes.failures.length)))throw Error('Production quote coverage or the 15-minute market-hours target failed verification.');
