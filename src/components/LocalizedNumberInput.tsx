import { useState } from 'react';
import { locale,number } from '../lib/preferences';
import { parseLocalNumber } from '../lib/local-number';

/** Keep the editing buffer intact; invalid input withholds the scenario result. */
export function LocalizedNumberInput({value,onChange,disabled=false}:{value:number;onChange:(value:number)=>void;disabled?:boolean}) {
  const [draft,setDraft]=useState<string|null>(null);
  return <input type="text" inputMode="decimal" lang={locale()} disabled={disabled} value={draft??(Number.isFinite(value)?number(value,4):'')} aria-invalid={!Number.isFinite(value)||undefined}
    onChange={e=>{setDraft(e.target.value);onChange(parseLocalNumber(e.target.value,locale()));}} onBlur={()=>setDraft(null)}/>;
}
