import { afterEach, describe, expect, it } from 'vitest';
import { readPreferences, setPreferences, preferences, number } from '../preferences';
import { t } from '../i18n';
import { displayDate, displayInstant } from '../research-ui';
import { displayAmount, validFx, type FxFile } from '../fx';
import { parseNorgesBank, refreshFx } from '../../../scripts/lib/fx.mjs';
import { localizeChart } from '../chart-locale';
import { explainMove } from '../nexsi-explanation';
import { matchesResearchQuery, RESEARCH_QUESTIONS } from '../research-questions';
import type { Attribution } from '../nexsi-model';
import { buildDailyBrief, checkpointFor } from '../nexsum';
import type { Snapshot } from '../snapshot';
import { readFileSync } from 'node:fs';

const now = Date.parse('2026-11-22T12:00:00Z');
const fx:FxFile={schemaVersion:1,base:'USD',quote:'NOK',source:'Norges Bank',sourceUrl:'https://www.norges-bank.no/en/topics/statistics/exchange_rates/?id=USD',generated:'2026-11-22T11:00:00Z',retrievedAt:'2026-11-22T11:00:00Z',observedAt:'2026-11-20',nokPerUsd:9.7525,status:'available'};
function payload(){return {data:{
  dataSets:[{series:{'0:0:0:0':{attributes:[0],observations:{'0':['9.6866'],'1':['9.7525']}}}}],
  structure:{dimensions:{series:[['FREQ','B'],['BASE_CUR','USD'],['QUOTE_CUR','NOK'],['TENOR','SP']].map(([id,value])=>({id,values:[{id:value}]})),observation:[{id:'TIME_PERIOD',values:[{id:'2026-11-19'},{id:'2026-11-20'}]}]},attributes:{series:[{id:'UNIT_MULT',values:[{id:'0'}]}]}}
}};}
afterEach(()=>setPreferences({language:'en-US',currency:'USD'}));

describe('Language preferences and financial wording',()=>{
  it('validates stored settings independently and fails safely on malformed storage',()=>{
    expect(readPreferences('{"language":"nb-NO","currency":"USD"}')).toEqual({language:'nb-NO',currency:'USD'});
    expect(readPreferences('{"language":"xx","currency":"NOK"}')).toEqual({language:'en-US',currency:'NOK'});
    expect(readPreferences('null')).toEqual({language:'en-US',currency:'USD'});
    expect(readPreferences('invalid')).toEqual({language:'en-US',currency:'USD'});
  });
  it('changes dates and decimal notation without changing explicit time zones',()=>{
    setPreferences({language:'nb-NO',currency:'USD'});
    expect(preferences().currency).toBe('USD');
    expect(number(1234.5,2)).toBe('1\u00a0234,5');
    expect(displayDate('2026-11-20')).toBe('20. nov. 2026');
    expect(displayInstant('2026-11-21T00:30:00Z','ET')).toBe('20. nov. 2026 · 19:30 ET');
    expect(displayInstant('2026-11-20')).not.toContain('00:00');
    expect(t('01')).toBe('01');
  });
  it('translates all curated questions and supports Norwegian stock/energy queries',()=>{
    for(const question of RESEARCH_QUESTIONS) expect(t(question.title,'nb-NO')).not.toBe(question.title);
    for(const [query,words] of [['aksjer','stocks shares'],['strømkostnader','power costs'],['resultater og guiding','earnings guidance'],['renter og inflasjon','rates inflation']]) expect(matchesResearchQuery(query,words)).toBe(true);
    expect(matchesResearchQuery('NVDA','NVDA NVIDIA')).toBe(true);
  });
  it('preserves numeric reconciliation, sign and uncertainty in Norwegian explanations',()=>{
    const move={actual:-5,energy:-1,energyCI:[-2,0.2],extrapolation:false,components:{market:-2,technology:-0.5,rates:-0.2,baseline:-0.3,oil:-0.7,gas:-0.3,unexplained:-1}} as Attribution;
    const before=JSON.stringify(move), reading=explainMove(move);
    setPreferences({language:'nb-NO',currency:'NOK'});
    const text=t(reading.energyText);
    expect(text).toContain('negativt bidrag på 1,00 prosentpoeng');
    expect(text).toContain('inkluderer null');
    expect(t(reading.residualText)).toContain('Ytterligere 1,00 prosentpoeng');
    expect(t(reading.otherText)).toContain('negativt bidrag på 3,00 prosentpoeng');
    expect(reading.energyShare).toBeNull();
    expect(JSON.stringify(move)).toBe(before);
    expect(t('Unfamiliar issuer quotation: $10.50 million')).toBe('Unfamiliar issuer quotation: $10.50 million');
  });
  it('does not mark a brief changed solely because language/currency changed',()=>{
    const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../../public/data/${name}.json`,import.meta.url),'utf8'));
    const catalog=read('catalog');
    const snapshot:Snapshot={revision:'test',catalog,quality:read('quality'),nexsi:read('nexsi'),seriesMap:new Map(catalog.series.map((s:{id:string})=>[s.id,read(s.id)])),forecasts:null,impact:null,cot:null,quotes:null,backtest:null,health:null,refreshStatus:null};
    const time=Date.parse(snapshot.nexsi!.generated), first=checkpointFor(buildDailyBrief(snapshot,[],[],time).insights,time);
    setPreferences({language:'nb-NO',currency:'NOK'});
    expect(checkpointFor(buildDailyBrief(snapshot,[],[],time).insights,time)).toEqual(first);
  });
});

describe('Verified indicative NOK display conversion',()=>{
  it('uses NOK per USD, supports negative costs, and never converts rates or indices',()=>{
    expect(displayAmount(81.31,'USD','NOK',fx,now).value).toBeCloseTo(792.975775);
    expect(displayAmount(-10,'USD/MWh','NOK',fx,now)).toMatchObject({unit:'NOK/MWh',converted:true});
    expect(displayAmount(-10,'USD/MWh','NOK',fx,now).value).toBeCloseTo(-97.525,8);
    for(const unit of ['%','pp','index','EUR','MW','Bcf','USD/EUR']) expect(displayAmount(10,unit,'NOK',fx,now)).toMatchObject({value:10,unit,converted:false,fallback:false});
    expect(displayAmount(81.31,'USD','USD',fx,now).value).toBe(81.31);
  });
  it('retains explicit USD for absent, stale, future or invalid rates; allows dated retained rates within tolerance',()=>{
    for(const bad of [null,{...fx,nokPerUsd:0},{...fx,nokPerUsd:Infinity},{...fx,observedAt:'2026-11-23'},{...fx,observedAt:'2026-11-01'},{...fx,retrievedAt:'2026-11-24T00:00:00Z'},{...fx,observedAt:'2026-02-30'},{...fx,base:'NOK'}]) expect(displayAmount(100,'USD','NOK',bad as FxFile,now)).toMatchObject({value:100,unit:'USD',fallback:true});
    expect(validFx({...fx,status:'retained'},now)).toBe(true);
    expect(validFx(fx,now+8*86400000)).toBe(false);
  });
  it('validates official source identity, currency direction, unit multiplier and observation date',()=>{
    expect(parseNorgesBank(payload(),now)).toEqual({observedAt:'2026-11-20',nokPerUsd:9.7525});
    const reverse=payload();reverse.data.structure.dimensions.series[1].values[0].id='NOK';
    expect(()=>parseNorgesBank(reverse,now)).toThrow(/direction/);
    const units=payload();units.data.structure.attributes.series[0].values[0].id='2';
    expect(()=>parseNorgesBank(units,now)).toThrow(/multiplier/);
    expect(()=>parseNorgesBank(payload(),Date.parse('2026-11-19T00:00:00Z'))).toThrow(/date/);
    expect(()=>parseNorgesBank(payload(),now+8*86400000)).toThrow(/overdue/);
  });
  it('automatically refreshes and retains source dates on failed refreshes without sinking core publication',async()=>{
    const generated=new Date(now).toISOString();
    const next=await refreshFx(fx,generated,async()=>payload());
    expect(next).toMatchObject({status:'available',observedAt:'2026-11-20',retrievedAt:generated,nokPerUsd:9.7525});
    const failed=await refreshFx(fx,generated,async()=>{throw new Error('timeout');});
    expect(failed).toMatchObject({status:'retained',observedAt:fx.observedAt,retrievedAt:fx.retrievedAt,error:'timeout'});
    const absent=await refreshFx(null,generated,async()=>{throw new Error('timeout');});
    expect(absent.status).toBe('unavailable'); expect(validFx(absent as FxFile,now)).toBe(false);
  });
  it('localizes chart labels without modifying IDs, dates, numeric data or source options',()=>{
    const option={series:[{id:'market',name:'Broad market',data:[['2026-11-20',123.45]]}],yAxis:{type:'value',name:'percentage points'}};
    const translated=localizeChart(option,'nb-NO');
    expect(translated.series[0]).toEqual({id:'market',name:'Bredt marked',data:[['2026-11-20',123.45]]});
    expect(translated.yAxis.name).toBe('prosentpoeng');
    expect(option.series[0].name).toBe('Broad market');
  });
});
