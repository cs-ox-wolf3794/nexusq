import type { ReactNode } from 'react';
import { locale, number } from './preferences';
import { nb } from './locales/nb';
const lowerCaseMessages = new Map(Object.entries(nb).map(([key,value])=>[key.toLowerCase(),value]));

// Source-language message keys keep copy reviewable. Unknown source material is
// preserved verbatim. No DOM rewriting, network translation or model-input changes.
const templates = Object.entries(nb).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const parts = key.split(/(\{\d+\})/g);
  const keys: string[] = [];
  const source = parts.map(part => /^\{\d+\}$/.test(part) ? (keys.push(part), '(.*?)') : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return { pattern: new RegExp('^' + source + '$', 's'), keys, value, weight: key.replace(/\{\d+\}/g, '').length };
}).sort((a,b) => b.weight - a.weight);
export function translate(text: string | undefined, language = locale(), depth = 0): string {
  if (text === undefined) return "";
  if (language === 'en-US' || !text.trim()) return text;
  const key = text.trim().replace(/\s+/g, ' ');
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2}, \d{4}$/.test(key)) {
    return new Intl.DateTimeFormat(language,{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(key+' 12:00:00 UTC'));
  }
  const numeric = key.match(/^([+−-]?)(\d+(?:\.\d+)?)(%| pp|σ)?$/);
  if (numeric && !/^0\d/.test(numeric[2])) {
    const decimals = numeric[2].split('.')[1]?.length ?? 0;
    return numeric[1] + new Intl.NumberFormat(language,{minimumFractionDigits:decimals,maximumFractionDigits:decimals,useGrouping:false}).format(Number(numeric[2])) + (numeric[3]??'');
  }
  let result = nb[key] ?? lowerCaseMessages.get(key.toLowerCase());
  if (!result && depth < 5) for (const item of templates) {
    const match = key.match(item.pattern);
    if (match) { result = item.value.replace(/\{\d+\}/g, token => translate(match[item.keys.indexOf(token) + 1] ?? token,language,depth+1)); break; }
  }
  if (!result && depth < 5) {
    const sentences = key.split(/(?<=[.!?]) (?=[A-Z“])/);
    if (sentences.length > 1) result = sentences.map(sentence=>translate(sentence,language,depth+1)).join(' ');
  }
  return result ? text.slice(0, text.indexOf(text.trimStart())) + result + text.slice(text.trimEnd().length) : text;
}
export const t = translate;
/** Render boundary for labels returned by shared analytical helpers. */
export function l(node: ReactNode): ReactNode {
  if (typeof node === 'string') return t(node);
  if (typeof node === 'number') return number(node, 8);
  if (Array.isArray(node)) return node.map(l);
  return node;
}
