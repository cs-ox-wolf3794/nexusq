import { REPOSITORY, dueWork, runningWork, readPublication } from './core.mjs';
import { signTicket } from './ticket.mjs';

export async function checkAndRecover(event, env, fetcher=fetch, now=Date.now()) {
  if(env.ENABLED!=='true')return {action:'disabled'};
  // Only the platform's scheduled handler calls this function in production.
  if(event.cron!=='*/5 * * * *'||!Number.isFinite(event.scheduledTime)||Math.abs(now-event.scheduledTime)>10*60000)throw Error('Invalid or expired scheduled invocation');
  if(!env.GITHUB_ACTIONS_TOKEN||!env.WATCHDOG_SIGNING_KEY)throw Error('Watchdog secrets are not configured');
  let publication,publicationIssue;
  try {publication=await readPublication(fetcher,now);} catch(error){publicationIssue=error.message;}
  const due=dueWork(now,publication?.quotes,publication?.fullStatus,env.FULL_REFRESH_REQUESTED_AT);
  if(!due.mode)return {action:'no_refresh',reason:due.reason,revision:publication?.revision,publicationIssue};
  const api=async (path,options={})=>{
    const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/${path}`,{
      ...options,redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${env.GITHUB_ACTIONS_TOKEN}`,'User-Agent':'NexusQ-refresh-watchdog','Content-Type':'application/json'},
    });
    if(!response.ok)throw Error(`GitHub ${options.method??'GET'} HTTP ${response.status}`);
    return response;
  };
  // Fail closed if run state cannot be inspected. Never flood an unavailable API.
  const groups=await Promise.all(['in_progress','queued','waiting','pending'].map(async status=>{
    const data=await (await api(`actions/runs?branch=main&status=${status}&per_page=100`)).json();
    if(!Array.isArray(data.workflow_runs)||data.total_count>100)throw Error('Cannot establish bounded workflow concurrency');
    return data.workflow_runs;
  }));
  const running=runningWork(groups.flat(),now);
  if(running.blocked){
    if(running.stalled)throw Error(`Refresh stalled beyond expected duration: ${running.runId}`);
    return {action:'in_progress',reason:running.reason,runId:running.runId,publicationIssue};
  }
  const ticket=await signTicket(env.WATCHDOG_SIGNING_KEY,{mode:due.mode,issuedAt:new Date(now).toISOString(),scheduledAt:new Date(event.scheduledTime).toISOString(),nonce:crypto.randomUUID()});
  await api('actions/workflows/backup-refresh.yml/dispatches',{method:'POST',body:JSON.stringify({ref:'main',inputs:{ticket:JSON.stringify(ticket)}})});
  // Accepted dispatch is not a successful refresh. Production verification checks the publication.
  return {action:'dispatched',mode:due.mode,nonce:ticket.nonce,scheduledAt:ticket.scheduledAt,reason:due.reason,publicationIssue,priorRevision:publication?.revision};
}

export default {
  async scheduled(event,env) {
    try {console.log(JSON.stringify(await checkAndRecover(event,env)));}
    catch(error){console.error(JSON.stringify({action:'failed',message:error.message}));throw error;}
  },
  async fetch() {return new Response('No public control endpoint',{status:404});},
};
