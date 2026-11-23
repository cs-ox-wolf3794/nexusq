// Extract only concrete disclosure language. Never infer a catalyst from a form
// heading, a hypothetical risk or a headline's sentiment.
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const rules = [
  ['leadership', /(?:accepted the resignation|resigned|appointed|terminated the employment).{0,160}(?:chief|president|officer|director)|(?:chief|president|officer|director).{0,120}(?:resigned|resignation|stepped down)/i, 'Leadership or governance change disclosed'],
  ['transaction', /(?:completed|completion of|closed|closing of).{0,90}(?:acquisition|merger)|(?:agreed to (?:sell|acquire|purchase)|entered into.{0,100}(?:merger|purchase) agreement)/i, 'Business transaction disclosed'],
  ['investment', /(?:announced|completed|elected|agreed).{0,100}(?:minority investment|investment of|consideration payable)|(?:consideration|investment).{0,100}(?:settled entirely in cash|paid in cash)/i, 'Investment or transaction terms updated'],
  ['capital', /(?:approved|declared|announced|announces|authorized).{0,110}(?:stock split|share repurchase|cash dividend|quarterly dividend|interim dividend)|(?:stock|share) split.{0,100}(?:effective|approved)|(?:confirms|announced).{0,130}purchased a total of/i, 'Capital or shareholder action disclosed'],
  ['financing', /(?:entered into|issued|completed|executed|pricing of|sale of).{0,180}(?:credit agreement|credit facility|senior notes|debt offering|notes due)|(?:senior notes|credit facility).{0,100}(?:issued|completed)/i, 'Financing transaction disclosed'],
  ['operations', /(?:announce|announced|reported).{0,160}(?:retail sales|units (?:sold|shipped)).{0,40}(?:reached|exceeded|grew|increased)/i, 'Product sales update disclosed'],
  ['operations', /(?:announced|launched|began shipping|entered into).{0,100}(?:product|partnership|data center|power purchase|supply agreement)/i, 'Operating development disclosed'],
  ['risk', /(?:received|initiated|discovered|identified|determined).{0,100}(?:subpoena|investigation|cybersecurity incident|material impairment)|(?:board|committee).{0,100}(?:investigation|review of allegations)/i, 'Risk or investigation disclosure'],
];
export function extractCompanyNews(blocks, sourceUrl, isRelease = false) {
  let active = isRelease;
  for (const block of blocks) {
    if (/^item\s+[1-8]\.\d{2}\b/i.test(block)) active = true;
    if (/^item\s+9\.01\b|^signatures?\b|^(?:forward-looking statements|safe harbor|about the company)\b/i.test(block)) active = false;
    if (!active || /^item\s+\d/i.test(block) || block.includes('|')) continue;
    for (const {segment} of segmenter.segment(block)) {
      const text = segment.trim();
      if (text.length < 25 || /\b(?:may|could|would|might|if|risk factors|not completed|not entered|not announced)\b|forward[- ]looking|shall not be deemed/i.test(text)) continue;
      const rule = rules.find(([,pattern])=>pattern.test(text));
      if (!rule) continue;
      // Retain the source's tense, parties and qualifiers in a bounded excerpt.
      const hit=text.match(rule[1]);
      // Begin close to the actual disclosed action, not a long legal preamble.
      const start=Math.max(0,(hit?.index??0)-35);
      const words = (start?text.slice(start).replace(/^\S*\s/,''):text).split(/\s+/);
      return [{category:'company-news',topic:rule[0],text:rule[2],period:null,sourceUrl,method:'rule-extracted',excerpt:(start?'…':'')+words.slice(0,24).join(' ')+(words.length>24?'…':'')}];
    }
  }
  return [];
}
