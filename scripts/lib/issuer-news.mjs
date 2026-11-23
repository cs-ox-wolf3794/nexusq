import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { get } from './http.mjs';

export const ISSUER_NEWS = {
  AAPL:{url:'https://www.apple.com/newsroom/rss-feed.rss',prefix:'https://www.apple.com/newsroom/',name:'Apple Newsroom'},
  MSFT:{url:'https://news.microsoft.com/source/feed/',prefix:'https://news.microsoft.com/source/',name:'Microsoft Source'},
  GOOG:{url:'https://blog.google/rss/',prefix:'https://blog.google/',name:'Google'},
  GOOGL:{url:'https://blog.google/rss/',prefix:'https://blog.google/',name:'Google'},
};
export function parseIssuerNews(xml, source, now=Date.now()) {
  const parsed=spawnSync(process.env.NEXSI_PYTHON??'python',[fileURLToPath(new URL('./news-feed.py',import.meta.url))],{input:xml,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'},timeout:10000,maxBuffer:2e6});
  if(parsed.status!==0)throw Error('Issuer news feed could not be parsed');
  const rows=JSON.parse(parsed.stdout);
  if(!rows.length)throw Error('Issuer news feed contains no verifiable records');
  const items=rows.flatMap(row=>{
    const at=Date.parse(row.at);
    if(!row.title||row.title.length>500||!row.url.startsWith(source.prefix)||!Number.isFinite(at)||at>now||now-at>100*86400000)return [];
    const url=new URL(row.url);if(!url.href.startsWith(source.prefix)||url.username||url.password||url.hash)return [];
    return [{title:row.title.replace(/\s+/g,' ').trim(),url:url.href,at:new Date(at).toISOString(),dateKind:row.dateKind}];
  }).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,40);
  if(!items.length)throw Error('Issuer news feed contains no recent validated records');
  return items;
}
export function createIssuerNewsLoader(now=Date.now(),fetcher=get) {
  const cache=new Map();
  return async(symbol,previous)=>{
    const source=ISSUER_NEWS[symbol];if(!source)return undefined;
    if(previous?.status==='available'&&previous.sourceUrl===source.url&&now-Date.parse(previous.checkedAt)>=0&&now-Date.parse(previous.checkedAt)<3600000)return previous;
    if(!cache.has(source.url))cache.set(source.url,(async()=>{
      const checkedAt=new Date(now).toISOString();
      try {
        const xml=await fetcher(source.url,false,{retries:1,timeout:15000});
        return {source:source.name,sourceUrl:source.url,checkedAt,successfulAt:checkedAt,status:'available',sha256:createHash('sha256').update(xml).digest('hex'),items:parseIssuerNews(xml,source,now),issue:null};
      } catch(error) {return {...previous,source:source.name,sourceUrl:source.url,checkedAt,successfulAt:previous?.successfulAt??null,status:'failed',items:previous?.items??[],issue:error.message};}
    })());
    return cache.get(source.url);
  };
}
