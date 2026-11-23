const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
const message = ticket => JSON.stringify([1,'cloudflare',ticket.mode,ticket.issuedAt,ticket.scheduledAt,ticket.nonce]);

export async function signTicket(secret, fields) {
  if(typeof secret!=='string'||secret.length<40)throw Error('Watchdog signing secret is missing or too short');
  const ticket={version:1,source:'cloudflare',...fields};
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return {...ticket,signature:hex(await crypto.subtle.sign('HMAC',key,encoder.encode(message(ticket))))};
}

export async function verifyTicket(secret, ticket, now, usedNonces=[]) {
  if(!ticket||ticket.version!==1||ticket.source!=='cloudflare'||!['quotes','full'].includes(ticket.mode)
    ||!/^[-a-f0-9]{36}$/.test(ticket.nonce??'')||!/^[a-f0-9]{64}$/.test(ticket.signature??''))throw Error('Invalid backup ticket');
  const issued=Date.parse(ticket.issuedAt),scheduled=Date.parse(ticket.scheduledAt);
  if(![now,issued,scheduled].every(Number.isFinite)||issued>now+60000||now-issued>10*60000
    ||scheduled>issued+60000||issued-scheduled>10*60000)throw Error('Backup ticket expired or future-dated');
  if(usedNonces.includes(ticket.nonce))throw Error('Backup ticket was already used');
  if(typeof secret!=='string'||secret.length<40)throw Error('Backup signing secret is not configured');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(ticket.signature.match(/../g),pair=>parseInt(pair,16));
  if(!await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(message(ticket))))throw Error('Backup ticket signature rejected');
  return {source:'cloudflare',mode:ticket.mode,nonce:ticket.nonce,scheduledAt:ticket.scheduledAt};
}
