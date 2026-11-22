// Deliberately limited financial vocabulary: retain the issuer's metric, basis,
// currency, range and period. Never infer a beat/miss, a guidance cut, or causation.
export function disclosurePeriods(text) {
  text = text.replace(/fiscal (20\d{2}) (first|second|third|fourth) quarter/gi, '$2 quarter fiscal $1');
  const found = [];
  const patterns = [
    /(?:fiscal\s+)?(first|second|third|fourth)[- ]quarter(?:\s+of)?(?:\s+(?:the\s+)?fiscal(?:\s+year)?(?:\s+ending)?)?\s+(?:FY\s*)?(20\d{2})/gi,
    /(?:fiscal\s+)?Q([1-4])\s*(?:FY\s*)?(20\d{2})\b/gi,
    /(?:F?Q([1-4]))(?:\s*FYE?\s*|[- ])(\d{2})\b/gi,
    /(?:fiscal\s+(?:year\s+)?|full[- ]year(?:\s+of)?(?:\s+fiscal)?\s+|FY\s*)(20\d{2})\b/gi,
    /full[- ]year\s+FY\s*(\d{2})\b/gi,
    /fiscal (20\d{2}) (first|second|third|fourth) quarter/gi,
    /quarter (?:ending|ended) ([A-Z][a-z]+ \d{1,2},? 20\d{2})/gi,
    /(?:three months|fiscal year) ending ([A-Z][a-z]+ \d{1,2},? 20\d{2})/gi,
  ];
  patterns.forEach((re, i) => { for (const m of text.matchAll(re)) {
    const n = { first: 1, second: 2, third: 3, fourth: 4 };
    let period = i === 0 ? `Q${n[m[1].toLowerCase()]} ${m[2]}` : i === 1 ? `Q${m[1]} ${m[2]}` : i === 2 ? `Q${m[1]} 20${m[2]}`
      : i === 5 ? `Q${n[m[2].toLowerCase()]} ${m[1]}` : i === 6 || i === 7 ? `${/fiscal year/i.test(m[0]) ? 'Full year' : 'Quarter'} ending ${m[1]}` : `Full year ${i === 4 ? '20' : ''}${m[1]}`;
    if (/fiscal|FY|^FQ/i.test(m[0])) period = period.replace(/^(Q[1-4]) /, '$1 fiscal ').replace(/^Full year/, 'Full fiscal year');
    // A fiscal-year token inside a quarter phrase is not a second annual period.
    if (!found.some(x => m.index >= x.start && m.index < x.end)) found.push({ period, start: m.index, end: m.index + m[0].length });
  } });
  return [...new Set(found.sort((a,b) => a.start-b.start).map(x=>x.period))];
}
const sectionEnd = /^(?:forward[- ]looking|safe harbor|about |conference call|earnings (?:call|webcast)|webcast|condensed consolidated|consolidated (?:statements|balance)|reconciliation|non-gaap (?:financial )?measures|segment results|product highlights|financial highlights|editor.s notes)/i;
const metricRules = [
  ['net-sales growth (constant currency)', /^net sales \(cc\)/i],
  ['adjusted operating-income growth (non-GAAP, constant currency)', /^adj\. operating income \(cc\)/i],
  ['pro forma standalone adjusted EPS (non-GAAP)', /^pro forma standalone adjusted earnings per share\b/i],
  ['net product revenue', /^(?:total )?net product revenues?\d*\b/i],
  ['product sales', /^product sales\b(?! excluding)/i],
  ['revenue growth', /^(?:total )?revenue growth\b(?! rate impact)/i],
  ['sales', /^sales\b/i],
  ['net sales', /^(?:total )?net sales\b/i],
  ['subscription revenue', /^(?:subscription revenues?)\b/i],
  ['revenue', /^(?:total net |total |net |consolidated )?revenues?\b/i],
  ['capital expenditure', /^(?:capital expenditures?|capex)\b/i],
  ['adjusted EBITDA loss (non-GAAP)', /^adjusted EBITDA loss\b/i],
  ['adjusted EBITDA (non-GAAP)', /^adjusted EBITDA\b/i],
  ['adjusted operating income (non-GAAP)', /^adjusted (?:operating income|income from operations)\b/i],
  ['non-GAAP EPS', /^(?:diluted non-GAAP (?:net income|earnings) per share|non-GAAP (?:diluted )?(?:EPS|earnings per share)|adjusted (?:diluted )?(?:EPS|earnings per share)|adjusted DEPS|Adj\. EPS)\b/i],
  ['GAAP EPS', /^GAAP (?:diluted )?(?:EPS|earnings per share)\b/i],
  ['non-GAAP operating margin', /^non-GAAP operating margin\b/i],
  ['non-GAAP gross margin on net product sales', /^non-GAAP gross margin on net product sales\b/i],
  ['non-GAAP gross margin', /^non-GAAP gross (?:profit )?margin\b/i],
];
const amount = /(?:US\$|\$|€|USD\s*|EUR\s*|RMB\s*)?\s*-?\d[\d,]*(?:\.\d+)?\s*(?:billion|million|[BM]\b|%)/i;
const range = /((?:US\$|\$|€|USD\s*|EUR\s*|RMB\s*)\s*[\d,]+(?:\.\d+)?\s*(?:billion|million|[BM]\b)?)\s*(?:to|and|[-–])\s*((?:US\$|\$|€)?\s*[\d,]+(?:\.\d+)?\s*(?:billion|million|[BM]\b)?)/i;
function values(text, metric, context) {
  text = text.replace(/(\d)bn\b/gi, '$1 billion').replace(/(\d)m\b/gi, '$1 million').replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const r = text.match(range) ?? (/margin|growth/.test(metric) ? text.match(/\d+(?:\.\d+)?%?\s*(?:to|and|[-–—])\s*\d+(?:\.\d+)?%/) : null);
  let tolerance = text.match(/(?:±|\+\/-|plus or minus)\s*(?:\$|€)?\s*[\d,.]+\s*(?:billion|million|[BM]\b|%)?/i)?.[0]?.trim();
  let value = r?.[0] ?? text.match(amount)?.[0]?.trim();
  if (!value && (/EPS/.test(metric) || /in millions|\$\s*millions|dollars are in millions|\(\$B\)/i.test(context))) value = text.match(/(?:\$|€)\s*-?[\d,]+(?:\.\d+)?/)?.[0];
  if (!value) return null;
  if (/low end|high end|at least|at most|up to|more than|less than|greater than/i.test(text.slice(0, text.search(/(?:\$|€|USD|EUR|RMB)\s*[\d.,]/)))) return null;
  if (/\(\s*(?:\$|€)\s*\d/.test(text)) return null;
  // Do not silently truncate an unrecognised range to its lower bound.
  if (!r && /\bbetween\b|\d\s*(?:to|and|[-–])\s*\$?\d/i.test(text)) return null;
  // Require currency for monetary amounts; a percentage is permitted only for a named margin/growth metric.
  if (/%/.test(value) && !/margin|growth/.test(metric)) return null;
  if (!/%/.test(value) && !/\$|€|USD|EUR|RMB/.test(value)) return null;
  if (!/%/.test(value) && !/EPS/.test(metric) && !/billion|million|[BM]\b/i.test(value)) {
    if (/\(\$B\)|\(billions\)/i.test(context)) value += ' billion';
    else if (/in millions|\$\s*millions|dollars are in millions/i.test(context)) value += ' million';
    else return null;
  }
  if (tolerance && !/EPS/.test(metric) && /in millions|dollars are in millions/i.test(context) && /\$|€/.test(tolerance) && !/million|billion|%/.test(tolerance)) tolerance += ' million';
  const prefix=text.slice(0,text.indexOf(r?.[0]??text.match(amount)?.[0]??value));
  if(/approximately|about|~\s*$/i.test(prefix))value=`approximately ${value}`;
  if (tolerance) value += ` (${tolerance})`;
  return value.replace(/\s+/g, ' ').replace(/(\d)B\b/g, '$1 billion').replace(/(\d)M\b/g, '$1 million').trim();
}
export function extractOutlook(blocks, sourceUrl) {
  const facts = []; let active = false, periods = [], sectionStart = 0, guidanceColumn = null;
  const add = (metric, value, period) => {
    const text = `Management ${metric} outlook: ${value}.`;
    if (!facts.some(f => f.text === text && f.period === period)) facts.push({ category: 'guidance', topic: metric.includes('revenue') ? 'revenue' : metric.includes('capital') ? 'capex' : 'outlook', text, period, sourceUrl, method: 'rule-extracted' });
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i].trim().replace(/:$/, '');
    if (sectionEnd.test(b) || /^a reconciliation of/i.test(b) || b.length < 180 && /reportable segment information|segment (?:results|information)|business segment results|quarterly financial results/i.test(b)
      || /at midpoint of revenue and expense guidance|do not represent official guidance/i.test(b)) { active = false; periods = []; guidanceColumn = null; continue; }
    const header = /^(?:(?:business|financial|CFO) )?(?:outlook|guidance|financial targets)(?: commentary)?$/i.test(b)
      || (b.length < 100 && /^(?:fiscal |full[- ]year|first quarter|second quarter|third quarter|fourth quarter|Q[1-4] |.*quarter.*fiscal)/i.test(b) && /(?:guidance|outlook|targets)(?: summary)?\d*$/i.test(b))
      || (b.length < 120 && /^(?:outlook|guidance) for /i.test(b))
      || /^20\d{2} (?:(?:annual|financial|growth and financial performance) )?(?:outlook|guidance)\*?$/i.test(b) || /^guidance and (?:results|outlook)$/i.test(b)
      || /^company outlook$/i.test(b) || /^(?:Table \d+: |Updated )?(?:Full.Year|Fiscal) 20\d{2} Guidance\d*$/i.test(b)
      || (b.length < 100 && /^business outlook for /i.test(b));
    if (header) { active = true; sectionStart = i; guidanceColumn=null; periods = /^20\d{2}\b/.test(b) ? [b.slice(0,4)] : []; }
    const standalone = b.match(/^(?:For (20\d{2}), we expect |We (?:expect|anticipate) (20\d{2}) )/i);
    if (standalone) { active = true; sectionStart = i; periods = [`Full year ${standalone[1] ?? standalone[2]}`]; }
    if (!active || i - sectionStart > 60) continue;
    const here = disclosurePeriods(b);
    if (here.length && (b.length < 200 || /^(?:for |we |the following)/i.test(b))) periods = here;
    if (/guidance.*\|.*results.*\|.*guidance/i.test(b)) {
      const columns = b.split('|').map(s=>s.trim()).filter(Boolean).slice(1);
      const index = columns.findLastIndex(c=>/guidance$/i.test(c) && disclosurePeriods(c).length === 1);
      if (index >= 0) guidanceColumn = { index, period: disclosurePeriods(columns[index])[0], count: columns.length };
    }
    if (/\|/.test(b) && /\b(?:previous|prior)\b/i.test(b) && /\b(?:updated|current|revised)\b/i.test(b) && !/\$|€|%/.test(b)) {
      let columns=b.split('|').map(s=>s.trim()).filter(Boolean);
      if (!/previous|prior|updated|current|revised|^20\d{2}[AE]$/i.test(columns[0]))columns=columns.slice(1);
      const index=columns.findIndex(c=>/\b(?:updated|current|revised)\b/i.test(c));
      if(index>=0&&periods.length===1)guidanceColumn={index,period:periods[0],count:columns.length};
    }
    if(/in millions except for per share amounts.*\|.*Outlook \(b\)/i.test(b)&&periods.length===1){
      const columns=b.split('|').map(s=>s.trim()).filter(Boolean).slice(1);
      guidanceColumn={index:columns.findIndex(s=>/^Outlook \(b\)$/i.test(s)),period:periods[0],count:columns.length,firstColumn:true};
    }
    if(/^Consolidated metric\s*\|\s*Original from .+\|\s*As of /i.test(b)&&periods.length===1){
      const columns=b.split('|').slice(1).map(s=>s.trim());
      const dates=columns.map(s=>Date.parse(s.replace(/^(?:Original from|As of) /i,'')));
      if(dates.every(Number.isFinite)&&dates.every((d,j)=>j===0||d>dates[j-1]))guidanceColumn={index:columns.length-1,period:periods[0],count:columns.length};
    }
    if (!periods.length) continue;
    // Resolve a table with two explicitly labelled periods, never select a column by its numeric size.
    if (!b.match(/\d/) && !/revenue|EPS|margin|expenditure/i.test(b)) continue;
    let text = b.replace(/\*/g,'').replace(/([a-z)])(?:[1-9](?:,[1-9])*)\s*(?=\|)/gi,'$1 ').replace(/^(?:we (?:are raising|now expect|expect|anticipate|continue to expect) (?:our )?|our )/i, '');
    if (standalone) text = b.slice(standalone[0].length);
    text = text.replace(/^for .{0,70}, we are forecasting /i, '');
    text = text.replace(/^(?:(?:full year|fiscal(?: year)?|fourth quarter|third quarter|second quarter|first quarter) (?:of )?(?:fiscal )?20\d{2}\s+)/i, '');
    text = text.replace(/^(?:first|second|third|fourth) quarter /i, '');
    const metric = metricRules.find(([, re]) => re.test(text));
    if (!metric) continue;
    const qualitative = text.match(/^Revenue to grow at a ((?:low|mid|high)[- ](?:teens|twenties|thirties|forties|fifties)) percentage rate on a year-over-year basis/i);
    if (qualitative && periods.length === 1) { add('year-over-year revenue growth', `${qualitative[1]} percent (qualitative range)`, periods[0]); continue; }
    // Segment forecasts retain their label; only these explicitly recognised metrics are summarized.
    const tail = text.replace(metric[1], '').replace(/^\s*\([a-z0-9,]+\)\s*(?=\|)/i,'');
    if (/\bloss\b/i.test(tail) && !metric[0].includes('loss')) continue;
    if (/^\s+(?:in |for |from |by )/.test(tail) && !/^\s+in the range/i.test(tail)) continue;
    let cells = tail.split('|').map(s=>s.trim()).filter(Boolean);
    if (!cells.length || !cells.some(s=>/\d/.test(s))) cells = (blocks[i+1] ?? '').split('|').map(s=>s.trim()).filter(Boolean);
    // Financial tables frequently place currency symbols in their own cells.
    cells = cells.flatMap((c,j)=>/^(?:\$|€)$/.test(c) ? [] : /^(?:\$|€)$/.test(cells[j-1]??'') ? [cells[j-1]+' '+c] : [c]);
    const context = blocks.slice(Math.max(sectionStart,i-4),i+2).join(' ');
    if(/Low End\s*\|.*High End\s*\|.*Comparison to/i.test(context))cells=cells.slice(0,2);
    const joined = cells.join(' ');
    const val = values(joined, metric[0], context);
    // Repeated GAAP/non-GAAP revenue columns must agree; do not turn distinct columns into a range.
    const cellValues = cells.map(c=>values(c,metric[0],context)).filter(Boolean);
    if (guidanceColumn) {
      // A selected column must never fall back to a different, historical column.
      // In reconciliation tables the explicitly first Outlook column is stable
      // even when empty trailing adjustment cells were omitted by the source.
      if(cells.length===guidanceColumn.count || guidanceColumn.firstColumn&&guidanceColumn.index===0&&cells.length<=guidanceColumn.count){
        const v=values(cells[guidanceColumn.index],metric[0],context); if(v)add(metric[0],v,guidanceColumn.period);
      }
      continue;
    }
    const lowHigh = /\bLow(?: End)?\s*(?:\|\s*)+High(?: End)?\b/i.test(context);
    if (lowHigh && cellValues.length === 2 * periods.length && cellValues.every(v=>!/ to | - |±|\+\/-/.test(v))) {
      periods.forEach((p,j)=>add(metric[0], `${cellValues[2*j]}–${cellValues[2*j+1]}`, p)); continue;
    }
    if (periods.length === 1 && metric[0] === 'revenue' && /Low\s*(?:\|\s*)+Mid\s*(?:\|\s*)+High/i.test(context)
      && cellValues.length === 6 && cellValues.slice(0,3).every((v,j)=>v===cellValues[j+3])) {
      add(metric[0], `${cellValues[0]}–${cellValues[2]}`, periods[0]); continue;
    }
    if (periods.length === 1) {
      if (/±|\+\/-/.test(joined) && cellValues.length === 4 && (cellValues[0] !== cellValues[2] || cellValues[1] !== cellValues[3])) continue;
      if (cellValues.length > 1 && new Set(cellValues).size > 1 && !/±|\+\/-|plus or minus/.test(joined)) continue;
      if (val) add(metric[0], cellValues.length > 1 && !/±|\+\/-|plus or minus/.test(joined) ? cellValues[0] : val, periods[0]);
    } else if (cellValues.length === periods.length) cellValues.forEach((v,j)=>add(metric[0],v,periods[j]));
  }
  return facts.slice(0, 10);
}
