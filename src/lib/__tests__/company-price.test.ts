import { describe, expect, it } from 'vitest';
import { companyPrice } from '../company-price';
import type { Quote } from '../snapshot';

const now=Date.parse('2026-11-23T16:00:00Z');
const company={symbol:'NVDA',price:100,asOf:'2026-11-20'};
const quote:Quote={id:'NVDA',symbol:'NVDA',name:'NVIDIA',price:110,currency:'USD',observedAt:'2026-11-23T15:59:00Z',checkedAt:'2026-11-23T16:00:00Z',sessionStart:'2026-11-23T14:30:00Z',sessionEnd:'2026-11-23T21:00:00Z',source:'Yahoo Finance',delayMinutes:0,status:'available'};

describe('company price presentation',()=>{
  it('shows the newer quote without changing the completed-close basis',()=>{
    const result=companyPrice(company,quote,now);
    expect(result.amount).toBe(110);expect(result.quote?.observedAt).toBe(quote.observedAt);
    expect(result.change).toBeCloseTo(10);expect(result.status.current).toBe(true);
    expect(company.price).toBe(100);expect(company.asOf).toBe('2026-11-20');
  });
  it('keeps delayed or retained prices dated and withholds a current-move claim',()=>{
    for(const candidate of [{...quote,status:'retained' as const},{...quote,observedAt:'2026-11-23T15:00:00Z'},{...quote,checkedAt:'2026-11-23T15:00:00Z'}]){
      const result=companyPrice(company,candidate,now);
      expect(result.amount).toBe(110);expect(result.status.current).toBe(false);expect(result.change).toBeNull();
    }
  });
  it('does not overwrite a newer completed close with older, invalid or wrong-instrument quotes',()=>{
    for(const candidate of [undefined,{...quote,symbol:'MSFT'},{...quote,currency:'NOK'},{...quote,price:NaN},{...quote,observedAt:'invalid'},{...quote,observedAt:'2026-11-24T16:00:00Z'},{...quote,observedAt:'2026-11-19T20:59:00Z'},{...quote,observedAt:'2026-11-20T20:59:00Z'}]){
      const result=companyPrice(company,candidate,now);
      expect(result.amount).toBe(100);expect(result.quote).toBeNull();expect(result.change).toBeNull();
    }
  });
  it('treats post-close quotes on the same ET session separately without claiming a next-session move',()=>{
    const result=companyPrice(company,{...quote,observedAt:'2026-11-20T21:00:00Z',checkedAt:'2026-11-20T21:01:00Z'},Date.parse('2026-11-20T21:01:00Z'));
    expect(result.quote).not.toBeNull();expect(result.change).toBeNull();
  });
  it('can show a validated quote even when daily history is missing',()=>{
    const result=companyPrice({...company,price:null,asOf:null},quote,now);
    expect(result.amount).toBe(110);expect(result.change).toBeNull();
  });
});
