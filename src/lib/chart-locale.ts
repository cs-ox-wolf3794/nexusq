import { t } from './i18n';
import { locale, type Language } from './preferences';

/** Presentation only: translate labels, never series IDs or numeric chart data. */
export function localizeChart<T>(option: T, language: Language = locale()): T {
  const labels = new Set(['name','text','subtext','data','formatter']);
  function visit(value: unknown, key = ''): unknown {
    if (typeof value === 'string') return labels.has(key) && !value.startsWith('__') ? value.split(' · ').map(x=>t(x,language)).join(' · ') : value;
    if (Array.isArray(value)) return value.map(item=>visit(item,key));
    if (!value || typeof value !== 'object') return value;
    const object = Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
    if (object.type === 'value' && (key === 'xAxis' || key === 'yAxis')) {
      const axisLabel = (object.axisLabel ?? {}) as Record<string,unknown>;
      if (!axisLabel.formatter) object.axisLabel = {...axisLabel,formatter:(value:number)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(value)};
    }
    if (object.type === 'time' && key === 'xAxis') {
      const axisLabel = (object.axisLabel ?? {}) as Record<string,unknown>;
      if (!axisLabel.formatter) object.axisLabel = {...axisLabel,formatter:(value:number)=>new Intl.DateTimeFormat(language,{month:'short',year:'2-digit',timeZone:'UTC'}).format(value)};
    }
    return object;
  }
  return visit(option) as T;
}
