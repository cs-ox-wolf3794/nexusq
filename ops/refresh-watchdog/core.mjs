export const REPOSITORY='cs-ox-wolf3794/nexusq';
export const ORIGIN='https://nexus.gygante.com';
export const REFRESH_PATHS=new Set(['.github/workflows/refresh-data.yml','.github/workflows/scheduled-refresh.yml','.github/workflows/backup-refresh.yml']);
const MINUTE=60000;
const liveAge=(value,now)=>{const age=now-Date.parse(value??'');return Number.isFinite(age)&&age>=-MINUTE?age:Infinity;};

/** UTC operating window includes both US DST regimes. Full refreshes catch up for two hours. */
export function dueWork(now, quotes, fullStatus, fullRequestedAt) {
  const date=new Date(now),day=date.getUTCDay(),hour=date.getUTCHours();
  const quoteWindow=day>=1&&day<=5&&hour>=12;
  const hours=day>=1&&day<=5?[6,16,18,22]:day===6?[6]:[];
  const slots=hours.map(hour=>Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hour,19));
  // Optional operator request: the next real cron handles one full recovery.
  // It expires after two hours and is satisfied by a successful publication.
  const requested=Date.parse(fullRequestedAt??'');
  if(Number.isFinite(requested))slots.push(requested);
  slots.sort((a,b)=>a-b);
  const due=slots.filter(slot=>slot<=now&&now-slot<=2*60*MINUTE).at(-1);
  const completed=fullStatus?.outcome==='success'?Date.parse(fullStatus.attemptedAt):NaN;
  const retryDue=liveAge(fullStatus?.attemptedAt,now)>=10*MINUTE;
  if(due!==undefined&&!(completed>=due&&completed<=now+MINUTE)&&retryDue)return {mode:'full',reason:due===requested?'One-time full recovery requested':'Full source refresh is overdue'};
  if(quoteWindow&&liveAge(quotes?.generated,now)>=4*MINUTE)return {mode:'quotes',reason:'Quote publication is due'};
  return {mode:null,reason:quoteWindow?'Recent quote publication':'Outside refresh window'};
}

export function runningWork(runs, now) {
  const active=runs.filter(run=>run.head_branch==='main'&&['queued','in_progress','pending','waiting','requested'].includes(run.status));
  const refresh=active.find(run=>REFRESH_PATHS.has(run.path));
  if(refresh)return {blocked:true,reason:'Refresh already queued or running',runId:refresh.id,stalled:liveAge(refresh.created_at,now)>22*MINUTE};
  const deployment=active.find(run=>run.path==='.github/workflows/deploy.yml'&&liveAge(run.created_at,now)<8*MINUTE);
  return deployment?{blocked:true,reason:'Publication already in progress',runId:deployment.id,stalled:false}:{blocked:false};
}

export async function readPublication(fetcher, now) {
  const get=async path=>{
    const response=await fetcher(`${ORIGIN}/data/${path}`,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error(`Publication HTTP ${response.status}`);
    return response.text();
  };
  const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  const manifest=JSON.parse(await get(`manifest.json?watchdog=${now}`));
  if(manifest.schemaVersion!==1||!manifest.files||await digest(JSON.stringify(manifest.files))!==manifest.revision)throw Error('Publication manifest integrity failed');
  const read=async name=>{
    const hash=manifest.files[name];
    if(!/^[a-f0-9]{64}$/.test(hash??''))throw Error(`Missing manifest file: ${name}`);
    const text=await get(`${name}?v=${hash}`);
    if(await digest(text)!==hash)throw Error(`Publication checksum failed: ${name}`);
    return JSON.parse(text);
  };
  const [quotes,fullStatus]=await Promise.all([read('quotes.json'),read('refresh-status.json')]);
  if(!quotes?.quotes||!Array.isArray(quotes.failures)||!Number.isFinite(Date.parse(quotes.generated))||Date.parse(quotes.generated)>now+MINUTE)throw Error('Invalid quote publication');
  return {quotes,fullStatus,revision:manifest.revision};
}
