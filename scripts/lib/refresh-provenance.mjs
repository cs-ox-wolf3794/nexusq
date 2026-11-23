export function refreshProvenance(previous, env, finishedAt) {
  const trigger=env.GITHUB_EVENT_NAME??'local';
  const runUrl=env.GITHUB_REPOSITORY&&env.GITHUB_RUN_ID?`https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`:null;
  const backup=trigger==='workflow_dispatch'&&env.REFRESH_AUTOMATION_SOURCE==='cloudflare'
    &&/^[-a-f0-9]{36}$/.test(env.REFRESH_BACKUP_NONCE??'')&&Number.isFinite(Date.parse(env.REFRESH_BACKUP_SCHEDULED_AT??''));
  const source=trigger==='schedule'?'github':backup?'cloudflare':null;
  return {
    trigger,startedAt:env.REFRESH_STARTED_AT??null,runUrl,
    lastScheduledAt:trigger==='schedule'?finishedAt:previous?.lastScheduledAt??null,
    lastScheduledRunUrl:trigger==='schedule'?runUrl:previous?.lastScheduledRunUrl??null,
    lastAutomaticAt:source?finishedAt:previous?.lastAutomaticAt??previous?.lastScheduledAt??null,
    lastAutomaticSource:source??previous?.lastAutomaticSource??(previous?.lastScheduledAt?'github':null),
    lastAutomaticRunUrl:source?runUrl:previous?.lastAutomaticRunUrl??previous?.lastScheduledRunUrl??null,
    backupScheduledAt:backup?env.REFRESH_BACKUP_SCHEDULED_AT:previous?.backupScheduledAt??null,
    usedBackupNonces:backup?[env.REFRESH_BACKUP_NONCE,...(previous?.usedBackupNonces??[])].slice(0,24):previous?.usedBackupNonces??[],
  };
}
