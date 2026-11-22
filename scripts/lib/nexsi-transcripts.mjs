import { disclosurePeriods } from './nexsi-outlook.mjs';

/** Two issuer-owned, free transcript routes. The source period must match the
 * earnings release; all facts retain an explicitly unverified publication time. */
export function transcriptSource(event, blocks) {
  if (!event.items?.split(',').map(s=>s.trim()).includes('2.02')) return null;
  const period = blocks.slice(0,35).flatMap(disclosurePeriods).find(p=>/^Q[1-4](?: fiscal)? 20\d{2}$/.test(p));
  if (!period) return null;
  const [,quarter,year]=period.match(/^Q([1-4])(?: fiscal)? (20\d{2})$/);
  if (event.issuerCik === 789019) return { url: `https://www.microsoft.com/en-us/investor/events/fy-${year}/earnings-fy-${year}-q${quarter}`, quarter: Number(quarter), year: Number(year), kind: 'html' };
  if (event.issuerCik === 1652044) {
    const d=new Date(event.publishedAt), month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
    return { url: `https://s206.q4cdn.com/479360582/files/doc_events/${d.getUTCFullYear()}/${month}/${d.getUTCDate()}/${year}_Q${quarter}_Earnings_Transcript.pdf`, quarter:Number(quarter), year:Number(year), kind:'pdf' };
  }
  return null;
}
export function extractTranscriptFacts(text, event, source) {
  const clean=text.replace(/[\u2010-\u2014\u2212]/g,'-').replace(/\s+/g,' ');
  const facts=[];
  const add=(text,period,topic='revenue')=>facts.push({ category:'guidance',topic,text,period,sourceUrl:source.url,method:'rule-extracted',sourceTiming:'unverified' });
  const quarters=['first','second','third','fourth'];
  if(event.issuerCik===789019){
    const identity = new RegExp(`Microsoft Fiscal Year ${source.year} ${quarters[source.quarter-1]} Quarter Earnings Conference Call`, 'i');
    if (!identity.test(clean)) throw Error('Microsoft transcript reporting period mismatch');
    const next=source.quarter===4?1:source.quarter+1, year=source.year+(next===1?1:0);
    const start=clean.search(new RegExp(`moving to the outlook for our ${quarters[next-1]} quarter`,'i'));
    if(start<0)return [];
    const outlook=clean.slice(start).split(/let.s go to Q&A|move over to Q&A/i)[0];
    const total=outlook.match(/at the total company level, revenue should be between \$([\d.]+) and \$([\d.]+) billion/i);
    if(total)add(`Management total-company revenue outlook: USD ${total[1]}–${total[2]} billion.`,`Q${next} fiscal ${year}`);
    const capex=outlook.match(new RegExp(`In Q${next}, we expect CapEx spend will be over \\$([\\d.]+) billion`,'i'));
    if(capex)add(`Management expects capital spending above USD ${capex[1]} billion.`,`Q${next} fiscal ${year}`,'capex');
  } else if(event.issuerCik===1652044){
    if(!new RegExp(`Alphabet.*${quarters[source.quarter-1]} Quarter ${source.year} Earnings Conference Call`,'i').test(clean.slice(0,2500)))throw Error('Alphabet transcript reporting period mismatch');
    const capex=clean.match(/full[- ]year (20\d{2}) CapEx guidance range of \$([\d.]+)\s*-\s*\$([\d.]+) billion/i);
    if(capex)add(`Management capital-expenditure outlook: USD ${capex[2]}–${capex[3]} billion.`,`Full year ${capex[1]}`,'capex');
  }
  return facts;
}
