import { useCallback, useEffect, useState } from 'react';
import { readActivity, type ActivityRecord, type NoticeTone } from '../lib/research-ui';

export type ToastMessage={id:string;title:string;detail:string;tone:NoticeTone};
export function useResearchActivity() {
  const [activity,setActivity]=useState<ActivityRecord[]>(()=>{try{return readActivity(localStorage.getItem('nexusq-activity'));}catch{return [];}});
  const [toast,setToast]=useState<ToastMessage|null>(null);
  useEffect(()=>{try{localStorage.setItem('nexusq-activity',JSON.stringify(activity));}catch{/* Keep session history available when persistence is blocked. */}},[activity]);
  const record=useCallback((entry:Omit<ActivityRecord,'at'>)=>{
    setActivity(previous=>{
      if(previous.some(x=>x.id===entry.id))return previous;
      const next=[{...entry,at:new Date().toISOString()},...previous].slice(0,40);
      return next;
    });
  },[]);
  const notify=useCallback((title:string,detail:string,tone:NoticeTone='info')=>{
    const entry={id:crypto.randomUUID(),title,detail,tone};record(entry);setToast(entry);
  },[record]);
  const dismiss=useCallback(()=>setToast(null),[]);
  return {activity,record,notify,toast,dismiss};
}
