import { appendFile, readFile } from 'node:fs/promises';
import { verifyBackupDispatch } from '../ops/refresh-watchdog/ticket.mjs';

const previous=JSON.parse(await readFile('public/data/quotes.json','utf8'));
const ticket=JSON.parse(process.env.WATCHDOG_TICKET??'null');
const verified=await verifyBackupDispatch(process.env.WATCHDOG_SIGNING_KEY,ticket,{eventName:process.env.GITHUB_EVENT_NAME,runAttempt:process.env.GITHUB_RUN_ATTEMPT,now:Date.now(),usedNonces:previous.refresh?.usedBackupNonces??[]});
if(!process.env.GITHUB_OUTPUT)throw Error('GitHub output channel unavailable');
const fullStatus=JSON.parse(await readFile('public/data/refresh-status.json','utf8'));
const quoteAge=Date.now()-Date.parse(previous.generated);
const alreadyFresh=verified.mode==='quotes'?quoteAge>=-60000&&quoteAge<4*60000
  :fullStatus.outcome==='success'&&Date.parse(fullStatus.attemptedAt)>=Date.parse(ticket.issuedAt)-60000&&Date.parse(fullStatus.attemptedAt)<=Date.now()+60000;
await appendFile(process.env.GITHUB_OUTPUT,`should_run=${!alreadyFresh}\nmode=${verified.mode}\nsource=${verified.source}\nnonce=${verified.nonce}\nscheduled_at=${verified.scheduledAt}\n`);
if(alreadyFresh)console.log('A newer completed refresh already covers this request; duplicate work suppressed.');
console.log(`Authenticated Cloudflare scheduled dispatch: ${verified.mode}; scheduled ${verified.scheduledAt}. Publication is not yet verified.`);
