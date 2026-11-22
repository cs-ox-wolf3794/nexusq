import { describe, it, expect } from 'vitest';
import { disclosurePeriods, extractOutlook } from '../../../scripts/lib/nexsi-outlook.mjs';
const run=(blocks:string[])=>extractOutlook(blocks,'https://example.test/release.htm');
describe('Issuer outlook extraction',()=>{
  it('selects current forecasts and fails closed on a missing comparison-table cell',()=>{
    const table=['Full Year 2026 Guidance','Metric | Previous | Current'];
    expect(run([...table,'Adjusted EPS | $4.10 to $4.50 | $4.20 to $4.30'])[0].text).toContain('$4.20 to $4.30');
    expect(run([...table,'Adjusted EPS | $4.10 to $4.50'])).toEqual([]);
    expect(run([...table,'Adjusted EPS | $4.10 to $4.50 | Unchanged'])).toEqual([]);
  });
  it('selects the latest dated outlook without substituting historical bases or unchanged cells',()=>{
    const facts=run(['Guidance','Fiscal year 2027','Consolidated metric | Original from 2.19.2026 | As of 8.20.2026 | As of 11.19.26','Net sales (cc) | Increase 3.5% to 4.5% | Increase 4.0% to 5.0% | Increase 4.9% to 5.2%','Adj. EPS | $2.75 to $2.85 | $2.80 to $2.87 | $2.84 to $2.89','Capital expenditures | $5 billion | $6 billion | Unchanged']);
    expect(facts.map((f:{text:string})=>f.text)).toEqual(['Management net-sales growth (constant currency) outlook: 4.9% to 5.2%.','Management non-GAAP EPS outlook: $2.84 to $2.89.']);
  });
  it('retains approximation, full percentage ranges and the metric accounting basis',()=>{
    const facts=run(['2026 Outlook','Non-GAAP gross margin on net product sales | Approximately 86%','Revenue growth | 5% to 6%','Pro forma standalone adjusted earnings per share | $7.85 to $8.00']);
    expect(facts.map((f:{text:string})=>f.text)).toEqual(['Management non-GAAP gross margin on net product sales outlook: approximately 86%.','Management revenue growth outlook: 5% to 6%.','Management pro forma standalone adjusted EPS (non-GAAP) outlook: $7.85 to $8.00.']);
  });
  it('handles numbered metrics but does not relabel an FX contribution as total growth',()=>{
    const facts=run(['2026 Growth and Financial Performance Outlook','Updated | Prior','Revenue1 | $4,741 to $4,767 million | $4,689 to $4,766 million','Revenue growth rate impact from FX | 2% | 1%']);
    expect(facts).toHaveLength(1);expect(facts[0].text).toContain('$4,741 to $4,767 million');
  });
  it('uses the explicitly first forecast column when trailing reconciliation cells are empty',()=>{
    const facts=run(['Outlook for Fiscal Year 2027','Fiscal Year Ending March 31, 2027','$ in millions except for per share amounts | | Outlook (b) | | Change in deferred net revenue and related cost of revenue | | Stock-based compensation | | Other','Total net revenue | | $7,980 to $8,180 | | $20']);
    expect(facts[0]).toMatchObject({period:'Full fiscal year ending March 31, 2027',text:'Management revenue outlook: $7,980 to $8,180 million.'});
  });
  it('does not treat an earnings headline mentioning guidance as a guidance section',()=>{
    expect(run(['Company reports results and updates guidance','Q3 2026 results','Revenue was $1.5 billion.'])).toEqual([]);
  });
  it('keeps full ranges and separate quarter/year columns',()=>{
    const facts=run(['Financial Outlook','Q3 FY27 Guidance | Full Year FY27 Guidance','Total revenue | $1,523.2 - $1,529.2 million | $5,991.1 - $6,011.1 million']);
    expect(facts.map((f:{period:string})=>f.period)).toEqual(['Q3 fiscal 2027','Full fiscal year 2027']);
    expect(facts[1].text).toContain('$5,991.1 - $6,011.1 million');
  });
  it('preserves both endpoints of percentage ranges',()=>{
    expect(run(['Guidance','For the fourth quarter of 2026, we expect:','Non-GAAP gross margin in the range of 78.0% to 80.0%'])[0].text).toContain('78.0% to 80.0%');
  });
  it('uses table units for a dollar tolerance and excludes segment revenue',()=>{
    const facts=run(['Business Outlook','Q1 FY2027','(In millions, except per share amounts)','Total revenue | $ | 11,100 | +/- | $ | 500','Cloud revenue | $9 billion']);
    expect(facts).toHaveLength(1);expect(facts[0].text).toContain('$ 11,100 million (+/- $ 500 million)');
  });
  it('handles fiscal year preceding the quarter without calling it annual',()=>{
    expect(disclosurePeriods('fiscal 2027 third quarter')).toEqual(['Q3 fiscal 2027']);
    expect(run(['Financial Outlook','Workday guidance for fiscal 2027 third quarter','Subscription revenues of $2.515 billion'])[0]).toMatchObject({period:'Q3 fiscal 2027',text:'Management subscription revenue outlook: $2.515 billion.'});
  });
  it('does not confuse prior results, ambiguous columns, or boilerplate with forecasts',()=>{
    expect(run(['Financial Outlook','Q1 2027','Revenue | $3 billion | $4 billion','Forward-Looking Statements','Revenue is expected to be $900 billion.'])).toEqual([]);
  });
  it('does not drop the upper endpoint in between-and revenue ranges',()=>{
    expect(run(['Fourth Quarter 2026 Outlook:','Revenue between $1.19 billion and $1.20 billion.'])[0].text).toContain('$1.19 billion and $1.20 billion');
  });
  it('does not interpret the reconciliation dash between identical GAAP and non-GAAP forecasts as a range',()=>{
    const f=run(['Outlook','For the quarter ending December 27, 2026, guidance:','Revenue | $8.60 Billion | +/- | $400 Million | — | $8.60 Billion | +/- | $400 Million']);
    expect(f[0].text).toBe('Management revenue outlook: $8.60 Billion (+/- $400 Million).');
  });
  it('maps separate quarter/year low-high columns without borrowing a period or scale',()=>{
    const facts=run(['Fourth Quarter and Full Fiscal Year 2026 Financial Targets','(in millions, except per share amounts)','Range for Three Months Ending October 31, 2026 | Range for Fiscal Year Ending October 31, 2026','Low | High | Low | High','Revenue | $ | 2,530 | $ | 2,580 | $ | 9,690 | $ | 9,740']);
    expect(facts.map((f:{text:string,period:string})=>[f.period,f.text])).toEqual([
      ['Quarter ending October 31, 2026','Management revenue outlook: $ 2,530 million–$ 2,580 million.'],
      ['Full fiscal year ending October 31, 2026','Management revenue outlook: $ 9,690 million–$ 9,740 million.'],
    ]);
  });
  it('selects the new guidance column and excludes actuals and old forecasts',()=>{
    const facts=run(['Guidance and Results','Quarterly Guidance & Results | Q2 FYE27 Guidance | Q2 FYE27 Results | Q3 FYE27 Guidance','Revenue | $1.38bn +/- $50m | $1.443bn | $1.54bn +/- $50m']);
    expect(facts).toHaveLength(1);expect(facts[0]).toMatchObject({period:'Q3 fiscal 2027',text:'Management revenue outlook: $1.54 billion (+/- $50 million).'});
  });
  it('withholds a low-end qualifier instead of repeating the entire old range',()=>{
    expect(run(['Outlook','Full year 2026','Revenue expected at the low end of $3.0-$3.4 billion.'])).toEqual([]);
  });
  it('ends the forecast section before historical segment tables',()=>{
    expect(run(['Business Outlook','Q1 FY2027','Total revenue | $11.1 billion +/- $0.5 billion','Fourth Quarter and Fiscal Year Reportable Segment Information','Q4 FY2026 | Q4 FY2025','Revenue | $7.996 billion | $4.879 billion'])).toHaveLength(1);
  });
  it('preserves an EBITDA loss and never strips parentheses from a negative amount',()=>{
    const facts=run(['Financial Outlook','Q4 2026','Adjusted EBITDA loss of between $14 million and $20 million.','GAAP EPS | ($1.20)']);
    expect(facts).toHaveLength(1);expect(facts[0].text).toContain('EBITDA loss (non-GAAP)');
  });
});
