import { describe, expect, it } from 'vitest';
import { readWorkspace, workspaceHash, readSavedViews, selectionColors, SECTION_ROUTES, WORKSPACES } from './workspace';

describe('research navigation contracts',()=>{
  it('opens the research desk by default, while old market links still open the comparison',()=>{
    expect(readWorkspace('')).toEqual({page:'home',view:''});
    expect(readWorkspace('#s=BRENT,XLE&t=index&w=3&p=1')).toEqual({page:'dashboard',view:'compare'});
    expect(readWorkspace('#page=nexsi&company=AAPL')).toEqual({page:'nexsi',view:'explain'});
  });
  it('routes every legacy section to an existing workspace and pane',()=>{
    for(const [anchor,route] of Object.entries(SECTION_ROUTES)){
      expect(readWorkspace('#'+anchor)).toEqual(route);
      const views=WORKSPACES[route.page].views;
      if(views.length)expect(views.some(v=>v.id===route.view)).toBe(true);
      else expect(route.view).toBe(''); // NexSum has sections without a tab bar.
    }
  });
  it('ignores unknown and inherited object keys rather than accepting invalid destinations',()=>{
    for(const hash of ['#constructor','#toString','#page=__proto__&view=explain','#page=nexsi&view=constructor']){
      const route=readWorkspace(hash);expect(Object.hasOwn(WORKSPACES,route.page)).toBe(true);
      expect(route.view===''||WORKSPACES[route.page].views.some(v=>v.id===route.view)).toBe(true);
    }
  });
  it('keeps the investigation context when opening evidence or another workspace',()=>{
    const hash='#s=BRENT,XLE&t=zscore&w=5&p=0&page=nexsi&view=explain&company=AAPL&horizon=20&event=2026-11-12';
    const next=new URLSearchParams(workspaceHash(hash,{page:'nexsi',view:'evidence'}).slice(1));
    for(const key of ['s','t','w','p','company','horizon','event'])expect(next.get(key)).toBe(new URLSearchParams(hash.slice(1)).get(key));
    expect(next.get('view')).toBe('evidence');
    const changed=new URLSearchParams(workspaceHash('#unexpected=value&'+next.toString(),{page:'nexsi',view:'explain'},{company:'MSFT',event:null}).slice(1));
    expect(changed.get('company')).toBe('MSFT');expect(changed.has('event')).toBe(false);expect(changed.has('unexpected')).toBe(false);
  });
  it('rejects damaged or unrelated saved-view data and bounds browser storage',()=>{
    expect(readSavedViews('invalid')).toEqual([]);expect(readSavedViews('{}')).toEqual([]);
    const valid={hash:'#page=nexsi&company=AAPL',title:'Apple investigation',savedAt:'2026-11-22'};
    expect(readSavedViews(JSON.stringify([null,{...valid,hash:'https://example.com'},valid]))).toEqual([valid]);
    expect(readSavedViews(JSON.stringify(Array(15).fill(valid)))).toHaveLength(12);
  });
  it('preserves entity colors with sparse slots and reordering, and reuses only free slots',()=>{
    const previous=new Map([['BRENT','blue'],['XLE','green']]);
    const next=selectionColors(previous,['XLE','BRENT','CPI'],['blue','orange','green']);
    expect(next.get('XLE')).toBe('green');expect(next.get('BRENT')).toBe('blue');expect(next.get('CPI')).toBe('orange');
    expect([...previous.keys()]).toEqual(['BRENT','XLE']);
  });
});
