import { createContext, useContext } from 'react';
import { usePreferences, number } from './preferences';
import { t } from './i18n';
import { displayAmount, type FxFile } from './fx';
export const FxContext = createContext<{ fx: FxFile | null; now: number }>({fx:null,now:Date.now()});
export function useMoney() {
  const p = usePreferences(), {fx,now} = useContext(FxContext);
  return (value: number, unit = 'USD', digits = 2) => {
    const amount = displayAmount(value, unit, p.currency, fx, now);
    return { ...amount, text: `${number(amount.value, digits)} ${t(amount.unit)}`, original: `${number(value, digits)} ${t(unit)}` };
  };
}
