import { easternTime, scheduledEquityClose } from './nexsi-explanation';
import type { QuoteFile } from './snapshot';
import { isEnergyQuote } from './energy-quotes';

export function scheduledUsMarketOpen(now:number) {
  if(!Number.isFinite(now))return false;
  const local=easternTime(new Date(now).toISOString());
  if(!local||Number(local.date.slice(0,4))<2026||Number(local.date.slice(0,4))>2028)return false;
  const close=scheduledEquityClose(local.date);
  return close!==null&&local.minute>=570&&local.minute<close;
}
/** Price age is measured at observation, never reset by a successful retrieval. */
export function quoteHealth(file:QuoteFile|null,now:number,expected:string[]=[]) {
  const open=scheduledUsMarketOpen(now);
  const ids=[...new Set([...expected,...Object.keys(file?.quotes??{})])].filter(id=>!isEnergyQuote(id));
  const missing=ids.filter(id=>!file?.quotes[id]);
  const delayed=open?ids.filter(id=>{
    const q=file?.quotes[id];if(!q)return false;
    const age=now-Date.parse(q.observedAt),checked=now-Date.parse(q.checkedAt);
    return q.status!=='available'||![age,checked].every(Number.isFinite)||age< -60000||checked< -60000||age>15*60000||checked>15*60000;
  }):[];
  return {open,expected:ids.length,missing,delayed,withinTarget:open?ids.length-missing.length-delayed.length:null};
}
