import { createContext, useContext } from 'react';
import { usePreferences, number } from './preferences';
import { t } from './i18n';
import { displayAmount, type FxFile } from './fx';
export const FxContext = createContext<{ fx: FxFile | null; now: number; loading?:boolean }>({fx:null,now:Date.now()});
export const moneyText=(value:number,unit:string,digits=2)=>`${number(value,digits,digits)}\u00a0${t(unit)}`;
export function useMoney() {
  const p = usePreferences(), {fx,now} = useContext(FxContext);
  return (value: number, unit = 'USD', digits = 2) => {
    const amount = displayAmount(value, unit, p.currency, fx, now);
    return { ...amount, text: moneyText(amount.value,amount.unit,digits), original: moneyText(value,unit,digits) };
  };
}
