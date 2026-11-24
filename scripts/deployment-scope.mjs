import { appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dataOnlyChanges } from './lib/deployment-scope.mjs';

let dataOnly=false,reason='Application code must pass all tests';
if(process.env.DATA_ONLY_REQUESTED==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch') {
  try {
    const repository=process.env.GITHUB_REPOSITORY;
    if(!/^[\w.-]+\/[\w.-]+$/.test(repository??''))throw Error('Invalid repository');
    const response=await fetch(`https://api.github.com/repos/${repository}/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1`,{
      headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'NexusQ-publication-scope'},
      redirect:'error',signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)throw Error(`Deployment history HTTP ${response.status}`);
    const prior=(await response.json()).workflow_runs?.[0];
    if(!/^[a-f0-9]{40}$/.test(prior?.head_sha??'')||prior.head_branch!=='main'||prior.conclusion!=='success')throw Error('No verified deployment baseline');
    const changed=execFileSync('git',['diff','--name-only','-z',prior.head_sha,'HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean);
    dataOnly=dataOnlyChanges(changed);
    reason=dataOnly?`Only generated data changed since successful deployment ${prior.id}; application checks are inherited from identical code.`:'Application or workflow changes require all tests.';
  }catch(error){reason=`Cannot verify unchanged code; all tests required (${error.message}).`;}
}
if(!process.env.GITHUB_OUTPUT)throw Error('GitHub output channel unavailable');
await appendFile(process.env.GITHUB_OUTPUT,`data_only=${dataOnly}\n`);
console.log(reason);
