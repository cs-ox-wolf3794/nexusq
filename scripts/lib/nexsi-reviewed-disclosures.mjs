// Concise document-reviewed notes. Exact document hashes prevent reuse after a source correction.
// Facts describe issuer disclosures, not independent verification of allegations or price causation.
export const REVIEWED_DISCLOSURES = {
  'cb778cd14593ce93d1bc4073523d740b1ee4235c94676aa8107012c75c7ba5c9': {
    url: 'https://www.sec.gov/Archives/edgar/data/2023554/000162828026068243/sndkq1-27ex991xpressrelease.htm',
    replaceCategories: ['earnings', 'guidance'],
    facts: [
      { category: 'earnings', topic: 'revenue', period: 'Q1 fiscal 2027', text: 'Sandisk reported revenue of $11.0 billion, 23% above the preceding quarter. Diluted EPS was $52.60 GAAP and $49.51 non-GAAP. These EPS figures are the original pre-split amounts, before the 8-for-1 split.' },
      { category: 'guidance', topic: 'revenue', period: 'Q2 fiscal 2027', text: 'Management forecast revenue of $12.2–$12.6 billion and non-GAAP diluted EPS of $55.00–$57.00. The EPS outlook was explicitly on a pre-split basis; it is not directly comparable with today’s split-adjusted share price.' },
    ],
  },
  '457a167356eddf446e208610ff4b0c6af71359353c9f7b6097ec43b948b4d9ac': {
    url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000024/a8-kex991q4202609262026.htm',
    replaceCategories: ['earnings'],
    facts: [{ category: 'earnings', topic: 'revenue', period: 'Q4 fiscal 2026, ended September 26, 2026', text: 'Apple reported quarterly revenue of $114.5 billion, up 12% from a year earlier, and diluted EPS of $2.10, up 14%. EPS included a $0.05 benefit from tariff refunds; reported gross margin of 47.9% also benefited by about one percentage point.' }],
  },
  '125cd2dc37937626995e32764bc5d135a90ca1300ca56f1ddcd9c3e71f11d81b': {
    url: 'https://www.sec.gov/Archives/edgar/data/2488/000000248826000188/q32026991.htm',
    replaceCategories: ['earnings', 'guidance'],
    facts: [
      { category: 'earnings', topic: 'revenue', period: 'Q3 2026', text: 'AMD reported revenue of $13.4 billion, 45% above the prior year. Diluted EPS was $1.46 GAAP and $2.09 non-GAAP; the two measures use different accounting adjustments.' },
      { category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'Management expected revenue of approximately $17 billion, with a 3% margin either side, and non-GAAP gross margin of approximately 55%.' },
    ],
  },
  '203036caa3feb4ccb1df5284ab41bfaf3cfcf984989c0a55842e7b3682b03532': {
    url: 'https://www.sec.gov/Archives/edgar/data/1018724/000101872426000038/amzn-20260930xex991.htm',
    replaceCategories: ['earnings', 'guidance'],
    facts: [
      { category: 'earnings', topic: 'revenue', period: 'Q3 2026, ended September 30, 2026', text: 'Amazon reported net sales of $201.9 billion, up 12% year over year, and diluted EPS of $1.89. Net income fell to $20.7 billion; the prior-year comparison included large Anthropic investment gains.' },
      { category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'Management forecast net sales of $240–$247 billion and operating income of $28.5–$33.5 billion. The outlook assumes no energy-derivative remeasurement impact or additional acquisitions, restructurings or legal settlements.' },
      { category: 'guidance', topic: 'capex', period: 'Full year 2026', text: 'Management continued to expect cash capital expenditure of approximately $220 billion. This is a company investment forecast, not an estimate of electricity costs or their share-price effect.' },
    ],
  },
  '82f19304077445dd82ac943715c780d7996872a9f9a3d4eade587ca0a7b1a8b3': {
    url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000082/nvda-20261111.htm',
    facts: [{ category: 'company-news', topic: 'leadership', text: 'NVIDIA disclosed that Jen-Hsun Huang resigned as CEO, president and a director, effective November 11. CFO Colette Kress became interim CEO while a permanent successor is sought.' }],
  },
  'b925e3b1f5d0900454b026ffe3759f5347dfb1ee77b8892dc8519145cb2919c6': {
    url: 'https://www.sec.gov/Archives/edgar/data/896878/000119312526468834/d182669d8k.htm',
    facts: [{ category: 'company-news', topic: 'transaction', text: 'Intuit agreed to sell Mailchimp to Bending Spoons for a $3.68 billion base price, with $368 million to be reinvested in the buyer’s parent. Closing was expected in early 2027, subject to approvals and other conditions; the sale was not completed by this announcement.' }],
  },
  '3918425bf1b41549b0021b70d1ccbbead78f3fe4612862ef022aefdaa8a7ed17': {
    url: 'https://www.sec.gov/Archives/edgar/data/2023554/000162828026075127/sndk-20261119.htm',
    facts: [{ category: 'company-news', topic: 'split', text: 'Sandisk disclosed an 8-for-1 stock split, with adjusted trading scheduled for November 20. NexSI’s return already accounts for the split; the mechanical change in price per share is not an economic loss.' }],
  },
  '0a51ce48946bbbc5318171f9a77d71866cd9b2fa47b87def9c7dd922238bd2d2': {
    url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000088/q3fy27pr.htm',
    facts: [{ category: 'guidance', topic: 'assumptions', text: 'The Q4 fiscal 2027 outlook covers an extra week and assumes no Data Center compute revenue from China.' }],
  },
  'f0e94c2b60f7d1e0966af2ec51c6bc2e175c548d56c79f34bead2ba25bd14868': {
    url: 'https://www.sec.gov/Archives/edgar/data/896878/000089687826000043/fy27q1earningspressrelease.htm',
    facts: [{ category: 'guidance', topic: 'assumptions', text: 'Intuit updated FY2027 revenue guidance for a Credit Karma change and reiterated its annual operating-income and EPS guidance. Both annual and next-quarter outlooks exclude the pending Mailchimp sale; management said it would update guidance when the transaction closes.' }],
  },
};
