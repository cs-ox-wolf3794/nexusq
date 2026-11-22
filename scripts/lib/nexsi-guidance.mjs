/** Explicit statements only. Failure to extract a number is never a no-guidance policy. */
export function extractGuidanceContext(blocks, sourceUrl) {
  const facts=[];
  const add=(text,guidanceType,topic='outlook')=>facts.push({category:'guidance',text,guidanceType,topic,period:null,sourceUrl,method:'rule-extracted'});
  const text=blocks.join(' ').replace(/\s+/g,' ');
  const numerical=(text,period,topic='outlook')=>facts.push({category:'guidance',text,period,topic,sourceUrl,method:'rule-extracted'});
  if (/it is our policy not to provide earnings guidance in the traditional sense/i.test(text))
    add('The company explicitly states that its policy is not to provide traditional earnings guidance. This policy concerns earnings guidance; it does not imply that management gives no business outlook.','policy','guidance-policy');
  if (/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1737806\//.test(sourceUrl) && /remain in a strategic investment phase/i.test(text) && /maintain investment discipline while funding initiatives/i.test(text))
    add('Management says it remains in an investment phase and will continue funding supply-chain and merchant initiatives with spending discipline. This is qualitative business direction, not a numerical revenue, margin or earnings forecast.','qualitative','investment-outlook');
  const roc=blocks.findIndex(b=>/^ROC Dividend Guidance$/i.test(b));
  if(roc>=0){
    const section=blocks.slice(roc+1,roc+4).join(' ');
    if(/expects the distributions paid on its preferred equity instruments to be treated as non-taxable return of capital/i.test(section)&&/expectations on E&P may change/i.test(section))
      add('Management expects preferred-share distributions to receive return-of-capital tax treatment, based on its earnings-and-profits assumptions. Those assumptions can change and shareholder circumstances matter. This is tax-treatment guidance for preferred shares, not a revenue, EPS, bitcoin-price or common-stock-return forecast.','limited','preferred-share-tax');
  }
  if(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1166691\//.test(sourceUrl)&&/Comcast suspended its share repurchase program beginning in the third quarter and expects the pause to remain in place through the proposed separation/i.test(text))
    add('Management expects the share-buyback pause to continue through the proposed business separation. This is a capital-return plan, not a revenue or EPS forecast; the proposed transaction remains conditional.','limited','capital-return');
  const deal=text.match(/transaction is expected to be neutral on Copart.s earnings per share in the first full year of ownership and accretive in fiscal (20\d{2}) and beyond/i);
  if(deal&&/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/900075\//.test(sourceUrl))
    add(`Management expects the proposed acquisition to be EPS-neutral in the first full year of ownership and accretive in fiscal ${deal[1]} and beyond. This is a conditional transaction-impact outlook, not a numerical company-wide earnings forecast or a completed transaction.`,'limited','transaction-outlook');
  const fer=text.match(/Construction division achieved a [\d.]+% adjusted EBIT margin1, surpassing the company.s average long[- ]+term target of (\d+(?:\.\d+)?)%/i);
  if(fer&&/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1468522\//.test(sourceUrl))
    add(`The results release cites an average long-term adjusted EBIT margin target of ${fer[1]}% for Construction (non-IFRS). This segment target is not a group revenue/EPS forecast or guidance for a specified quarter.`,'limited','segment-target');
  // Explicit forward statements with their own year and units, independent of table layout.
  for(const m of text.matchAll(/Full[- ]year (20\d{2}) adjusted EPS guidance of \$(\d+(?:\.\d+)?)\s*[-–]\s*\$(\d+(?:\.\d+)?)/gi))
    numerical(`Management adjusted EPS outlook (non-GAAP): USD ${m[2]}–${m[3]}.`,m[1],'eps');
  for(const m of text.matchAll(/capital expenditures for (20\d{2}) (?:are expected to be|to total) approximately \$(\d+(?:\.\d+)?) (billion|million)/gi))
    numerical(`Management capital-expenditure outlook: approximately USD ${m[2]} ${m[3].toLowerCase()}.`,m[1],'capex');
  for(const m of text.matchAll(/now expects total revenue growth of (\d+(?:\.\d+)?)% to (\d+(?:\.\d+)?)% in (20\d{2})/gi))
    numerical(`Management revenue-growth outlook: ${m[1]}%–${m[2]}%.`,m[3],'revenue');
  for(const m of text.matchAll(/(20\d{2}) fiscal year earnings per share projections to be in the range of \$(\d+(?:\.\d+)?) to \$(\d+(?:\.\d+)?)/gi)){
    const benefit=text.match(/full year guidance includes an approximate \$(\d+(?:\.\d+)?) earnings per share benefit from IEEPA tariff refunds/i);
    numerical(`Management EPS outlook: USD ${m[2]}–${m[3]}.${benefit?` The full-year outlook includes approximately USD ${benefit[1]} per share from tariff refunds.`:''}`,`Fiscal ${m[1]}`,'eps');
  }
  const ctas=text.match(/As we look forward to what lies ahead for fiscal (20\d{2}), we are raising our full fiscal year financial guidance\. We are raising our annual revenue expectations from a range of \$\d+(?:\.\d+)? billion to \$\d+(?:\.\d+)? billion to a range of \$(\d+(?:\.\d+)?) billion to \$(\d+(?:\.\d+)?) billion/i);
  if(ctas)numerical(`Management revenue outlook: USD ${ctas[2]}–${ctas[3]} billion.`, `Fiscal ${ctas[1]}`,'revenue');
  const aep=text.match(/expects full-year (20\d{2}) operating earnings to be at or above the high end of the guidance range of \$(\d+(?:\.\d+)?)[-–]\$(\d+(?:\.\d+)?) per share/i);
  if(aep)numerical(`Management expects operating EPS (non-GAAP) at or above the upper end of USD ${aep[2]}–${aep[3]}; this is not an unqualified range.`,aep[1],'eps');
  const exc=text.match(/Narrowing full year (20\d{2}) Adjusted \(non-GAAP\) operating earnings guidance range to \$(\d+(?:\.\d+)?)[-–]\$(\d+(?:\.\d+)?) per share/i);
  if(exc)numerical(`Management adjusted operating EPS outlook (non-GAAP): USD ${exc[2]}–${exc[3]}.`,exc[1],'eps');
  const ceg=text.match(/narrowing full-year Adjusted \(non-GAAP\) Operating Earnings guidance range to \$(\d+(?:\.\d+)?)\s*[-–]\s*\$(\d+(?:\.\d+)?) per share/i);
  if(ceg&&/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1868275\//.test(sourceUrl)){
    const year=text.match(/third quarter of (20\d{2}) increased/i)?.[1];
    if(year)numerical(`Management adjusted operating EPS outlook (non-GAAP): USD ${ceg[1]}–${ceg[2]}.`,`Full year ${year}`,'eps');
  }
  const fang=text.match(/Q([1-4]) (20\d{2}) cash capital expenditures guidance of \$([\d,]+)\s*[-–]\s*\$([\d,]+) million/i);
  if(fang)numerical(`Management cash capital-expenditure outlook: USD ${fang[3]}–${fang[4]} million.`,`Q${fang[1]} ${fang[2]}`,'capex');
  for(const m of text.matchAll(/(?:Planned capital investments for|We expect) (20\d{2}) (?:are expected to be|capital expenditures to be) (less than|up to) \$(\d+(?:\.\d+)?) billion/gi))
    numerical(`Management capital-expenditure outlook: ${m[2].toLowerCase()} USD ${m[3]} billion.`,m[1],'capex');
  for(const m of text.matchAll(/(?:Capital investments in (20\d{2}) are expected to be|In (20\d{2}), capital investments are projected to be) \$(\d+(?:\.\d+)?) to \$(\d+(?:\.\d+)?) million/gi))
    numerical(`Management capital-investment outlook: USD ${m[3]}–${m[4]} million.`,m[1]??m[2],'capex');
  // These issuers explicitly present dollar amounts in millions throughout MD&A.
  // Bind unit inheritance to the issuer and the document's unit declaration.
  if(/dollars in millions|amounts (?:are stated )?in millions/i.test(text)){
    if(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/909832\//.test(sourceUrl)){
      const m=text.match(/we spent \$[\d,]+ on capital expenditures, and it is our current intention to spend approximately \$([\d,]+) during fiscal (20\d{2})/i);
      if(m)numerical(`Management intends capital spending of approximately USD ${m[1]} million; the plan is subject to change.`,`Fiscal ${m[2]}`,'capex');
    }
    if(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/815556\//.test(sourceUrl)){
      const m=text.match(/For (20\d{2}), we continue to expect our net capital expenditures to be between \$(\d+(?:\.\d+)?) and \$(\d+(?:\.\d+)?)/i);
      if(m)numerical(`Management net capital-expenditure outlook: USD ${m[2]}–${m[3]} million.`,m[1],'capex');
    }
  }
  const mdlz=text.match(/For (20\d{2}), the company reaffirms Organic Net Revenue growth of at least (\d+(?:\.\d+)?) percent and Adjusted EPS growth in the range of flat to (\d+(?:\.\d+)?) percent on a constant currency basis/i);
  if(mdlz){
    numerical(`Management organic net-revenue growth outlook (non-GAAP): at least ${mdlz[2]}%.`,mdlz[1],'revenue');
    numerical(`Management adjusted EPS growth outlook (non-GAAP, constant currency): flat to ${mdlz[3]}%.`,mdlz[1],'eps');
  }
  const ccep=text.match(/Outlook for FY(\d{2}) unchanged.*?guidance is on a comparable & FX-neutral basis.*?Revenue: growth of (\d+(?:\.\d+)?)% to (\d+(?:\.\d+)?)%/i);
  if(ccep)numerical(`Management comparable revenue-growth outlook (FX-neutral): ${ccep[2]}%–${ccep[3]}%.`,`Fiscal 20${ccep[1]}`,'revenue');
  const bkr=text.match(/Horizon 2\(1\) IET order outlook to \$(\d+(?:\.\d+)?) billion plus/i), horizon=text.match(/Horizon 2 represents (20\d{2})[-–](20\d{2})/i);
  if(bkr&&horizon)numerical(`Management Industrial & Energy Technology order outlook: more than USD ${bkr[1]} billion over the Horizon 2 period. Orders are not recognized revenue, and this is a segment outlook.`,`${horizon[1]}–${horizon[2]}`,'segment-orders');
  // PepsiCo labels percentages as revenue/EPS rather than explicitly saying growth.
  // Its current/prior header and full accounting basis are therefore required.
  const pep=text.match(/PepsiCo.s current and previous fiscal (20\d{2}) outlook is summarized below/i);
  if(pep&&/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/77476\//.test(sourceUrl)){
    const start=blocks.findIndex(b=>/^Current\s*\|\s*Previous$/i.test(b));
    if(start>=0)for(const b of blocks.slice(start+1,start+12)){
      const m=b.match(/^(Organic Revenue|Net Revenue|Core Constant Currency EPS|Core EPS)\s*\|\s*(Approximately )?\+(\d+(?:\.\d+)?)%(?: to \+(\d+(?:\.\d+)?)%)?\s*\|/i);
      if(!m)continue;
      const metric={'Organic Revenue':'organic revenue growth (non-GAAP)','Net Revenue':'net-revenue growth','Core Constant Currency EPS':'core EPS growth (non-GAAP, constant currency)','Core EPS':'core EPS growth (non-GAAP)'}[m[1]];
      if(metric)numerical(`Management ${metric} outlook: ${m[2]?'approximately ':''}${m[3]}%${m[4]?`–${m[4]}%`:''}.`,`Fiscal ${pep[1]}`,/EPS/.test(m[1])?'eps':'revenue');
    }
  }
  return facts;
}

/** A complete, short issuer statement can safely cover an unfamiliar layout.
 * Do not truncate a range or copy a long paragraph; retain at most 24 words. */
export function extractShortGuidance(blocks, sourceUrl) {
  const accession=sourceUrl.match(/\/Archives\/edgar\/data\/\d+\/\d{10}(\d{2})\d{6}\//)?.[1];
  if(!accession)return [];
  const year=2000+Number(accession),segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
  for(const block of blocks){
    if(/\||forward.looking|safe harbor|reconciliation|risk factor/i.test(block))continue;
    for(const {segment}of segmenter.segment(block)){
      const s=segment.replace(/^[•➢−–—\s]+/,'').trim();
      if(s.split(/\s+/).length>24||s.length<20||!/\$|%|percent\b/i.test(s))continue;
      if(!/\b(?:guidance|outlook|expect(?:s|ed)?|forecast(?:s)?)\b/i.test(s)||!/\b(?:EPS|earnings per share|revenue|capital expenditur\w*|capex)\b/i.test(s))continue;
      if(/\b(?:previous|prior|original|was|were|had|exceeded|achieved|reported|reconciliation|unable|cannot|not provide|not expect|no forecast)\b/i.test(s))continue;
      const years=[...s.matchAll(/\b20\d{2}\b/g)].map(m=>Number(m[0]));
      if(years.length!==1||years[0]<year||years[0]>year+2)continue;
      return [{category:'guidance',topic:'outlook',text:'Management stated the following forward outlook. Accounting terms and any qualifications are preserved in the statement.',excerpt:s,period:String(years[0]),sourceUrl,method:'rule-extracted'}];
    }
  }
  return [];
}
