import { l as localize, t as tr } from '../lib/i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { displayInstant, elapsedLabel, usCashSession, type ActivityRecord, type DataException, type NoticeTone } from '../lib/research-ui';
import type { ToastMessage } from './useResearchActivity';
import { CALENDAR_SOURCE } from '../lib/nexsi-explanation';

export function StatusMark({tone='info'}:{tone?:NoticeTone}) {
  return <svg className={`status-mark ${tone}`} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d={tone==='critical'?'M4 1.5h8l2.5 2.5v8L12 14.5H4L1.5 12V4Z':tone==='warning'?'M8 1.5 15 14H1Z':'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z'} stroke="currentColor"/><path d="M8 5v4m0 2v.5" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
export function ResearchAlert({tone='warning',title,children,action,onAction}:{tone?:NoticeTone;title:string;children:ReactNode;action?:string;onAction?:()=>void}) {
  return <div className={`research-alert ${tone}`} role={tone==='critical'?'alert':'note'}><StatusMark tone={tone}/><div><strong>{localize(title)}</strong><div className="alert-detail">{localize(children)}</div></div>{localize(action&&onAction&&<button className="text-action" onClick={onAction}>{localize(action)}{tr(" →")}</button>)}</div>;
}
export function TimeStamp({label,value,zone='UTC',now}:{label:string;value:string|null|undefined;zone?:'UTC'|'ET';now?:number}) {
  return <span className="timestamp"><span className="timestamp-label">{localize(label)}</span><time dateTime={value??undefined} title={tr(value??'No timestamp supplied')}>{localize(displayInstant(value,zone))}</time>{localize(now!=null&&value&&<small>{localize(elapsedLabel(value,now))}</small>)}</span>;
}
export function SessionClock({now}:{now:number}) {
  const session=usCashSession(now);
  return <div className="session-clock"><span className={`session-state ${session.phase}`}><span className="session-dot"/>{localize(session.label)}</span><time dateTime={new Date(now).toISOString()}>{localize(new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now))}{tr(" UTC")}</time><a href={CALENDAR_SOURCE} target="_blank" rel="noreferrer" aria-label={tr("Inspect the published exchange calendar")} title={tr("Published schedule, not live exchange verification; unexpected closures are not modeled")}>{tr("Schedule ↗")}</a></div>;
}
export function ResearchToast({message,onDismiss}:{message:ToastMessage|null;onDismiss:()=>void}) {
  const [pausedId,setPausedId]=useState('');
  const paused=pausedId===message?.id;
  useEffect(()=>{if(!message||paused||message.tone!=='info')return;const timer=setTimeout(onDismiss,6000);return()=>clearTimeout(timer);},[message,paused,onDismiss]);
  return <div className="toast-region" aria-live="polite" aria-atomic="true">{localize(message&&<div className={`research-toast ${message.tone}`} onMouseEnter={()=>setPausedId(message.id)} onMouseLeave={()=>setPausedId('')} onFocusCapture={()=>setPausedId(message.id)} onBlurCapture={()=>setPausedId('')}><StatusMark tone={message.tone}/><div><strong>{localize(message.title)}</strong><p>{localize(message.detail)}</p></div><button onClick={onDismiss} aria-label={tr("Dismiss notification")}>{tr("×")}</button></div>)}</div>;
}
export function ActivityCenter({open,onClose,exceptions,activity,onInspect,now,pending}:{pending:boolean;open:boolean;onClose:()=>void;exceptions:DataException[];activity:ActivityRecord[];onInspect:(nexsi:boolean)=>void;now:number}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  return <dialog ref={dialog} className="activity-center" aria-labelledby="activity-title" onClose={onClose} onCancel={onClose}><header><div><span className="eyebrow">{tr("System / Operational record")}</span><h2 id="activity-title">{tr("Data status & activity")}</h2></div><button className="icon-button" onClick={onClose} aria-label={tr("Close activity")}>{tr("×")}</button></header>
    <div className="activity-content"><section><div className="section-label"><span>{tr("Current data exceptions")}</span><b>{localize(exceptions.length.toString().padStart(2,'0'))}</b></div>{localize(exceptions.length?exceptions.map(item=><ResearchAlert key={item.id} tone={item.tone} title={tr(item.title)} action="Inspect" onAction={()=>{onInspect(!!item.nexsi);onClose();}}>{localize(item.detail)}</ResearchAlert>):<p className="quiet-status">{localize(pending?"Checking the publication. Data status is not yet available.":"No active operational exceptions. This does not certify provider accuracy or complete company-news coverage.")}</p>)}</section>
    <section><div className="section-label"><span>{tr("Activity history")}</span><small>{tr("This browser · latest 40")}</small></div><p className="workspace-note">{tr("Application actions and publication checks, separate from market-event time. History is saved locally where browser storage is available.")}</p><ol className="activity-list">{localize(activity.map(item=><li key={item.id}><StatusMark tone={item.tone}/><div><strong>{localize(item.title)}</strong><p>{localize(item.detail)}</p><time dateTime={item.at} title={tr(displayInstant(item.at))}>{localize(displayInstant(item.at))}{tr(" · ")}{localize(elapsedLabel(item.at,now))}</time></div></li>))}</ol>{localize(!activity.length&&<p>{tr("No activity recorded yet.")}</p>)}</section></div>
  </dialog>;
}
