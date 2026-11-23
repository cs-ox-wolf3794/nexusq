import { companyPrice } from '../lib/company-price';
import type { Quote } from '../lib/snapshot';
import { t } from '../lib/i18n';
import { displayDate, displayInstant } from '../lib/research-ui';
import { Money } from './Preferences';

export function CompanyPrice({company,quote,now,compact=false}:{company:{symbol:string;price:number|null;asOf:string|null};quote?:Quote;now:number;compact?:boolean}) {
  const price=companyPrice(company,quote,now);
  return <span className={`company-price${compact?' compact':''}`}>
    <span className="company-price-label">{t(price.quote?'Latest reported price':'Completed close')}</span>
    <strong>{price.amount==null?t('Unavailable'):<Money value={price.amount} unit={price.unit}/>}</strong>
    <span className="company-price-time">{price.quote?displayInstant(price.quote.observedAt):displayDate(company.asOf)}</span>
    <span className={`company-price-status${price.status.current?' current':''}`}>{t(price.status.label)}</span>
    {price.quote && !compact && <span className="company-price-close">{t('Completed close')}: {company.price==null?t('Unavailable'):<Money value={company.price}/>} · {displayDate(company.asOf)}</span>}
  </span>;
}
