import type { Quote } from './snapshot';
import { quoteStatus } from './snapshot';
import { easternTime, scheduledEquityClose } from './nexsi-explanation';

/** Keep the latest quote separate from the completed prices used by daily models. */
export function companyPrice(company: {symbol:string;price:number|null;asOf:string|null}, candidate: Quote | undefined, now:number) {
  const time=candidate ? easternTime(candidate.observedAt) : null;
  const status=candidate ? quoteStatus(candidate,now) : null;
  const closeMinute=company.asOf ? scheduledEquityClose(company.asOf) : null;
  const newer=time && (!company.asOf || time.date>company.asOf || time.date===company.asOf && closeMinute!==null && time.minute>=closeMinute);
  const validTimes=candidate && [candidate.observedAt,candidate.checkedAt].every(value=>Number.isFinite(Date.parse(value)) && Date.parse(value)<=now+60000);
  const quote=candidate && candidate.id===company.symbol && candidate.symbol===company.symbol && candidate.currency==='USD' && validTimes
    && Number.isFinite(candidate.price) && candidate.price>0 && status?.label!=='Invalid timestamp' && newer ? candidate : null;
  return {
    quote, amount:quote?.price??company.price, unit:quote?.currency??'USD',
    status:quote ? status! : {label:'Latest quote unavailable · showing completed close',current:false},
    // A delayed/retained observation must not read as today's market move.
    change:quote && status?.current && company.asOf!=null && time!.date>company.asOf && company.price!=null && company.price>0
      ? (quote.price/company.price-1)*100 : null,
  };
}
