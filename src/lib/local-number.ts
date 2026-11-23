import type { Language } from './preferences';
export function parseLocalNumber(value:string,language:Language) {
  const text=value.trim().replace(/[\u00a0\u202f ]/g,'').replace('−','-');
  // Norwegian accepts its decimal comma or an unambiguous decimal point.
  // Mixed punctuation is rejected rather than guessing a monetary magnitude.
  const pattern=language==='nb-NO'?/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  return pattern.test(text)?Number(text.replace(',','.')):NaN;
}
