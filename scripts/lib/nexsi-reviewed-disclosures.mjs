// Concise document-reviewed notes. Exact document hashes prevent reuse after a source correction.
// Facts describe issuer disclosures, not independent verification of allegations or price causation.
export const REVIEWED_DISCLOSURES = {
  '83cb7e94afe2cf19942b6f1acec462f4ef53931416710ff8c4839216439a2583': {
    url:'https://www.sec.gov/Archives/edgar/data/865752/000110465926123387/tm2629095d1_ex99-1.htm',
    facts:[{category:'guidance',guidanceType:'not-issued',topic:'guidance-absence',period:'Q3 2026 written results release',text:'This reviewed results release provides historical financial results but no numerical forward revenue, EPS or margin forecast. This assessment is limited to the written release; it does not establish a company-wide policy or assess statements made on the earnings call.'}],
  },
  'e77f2a6170d427ac8c94a1ad329fddcb05c8c00f61c9b150309b4c75d0b590bf': {
    url:'https://www.sec.gov/Archives/edgar/data/1181412/000162828026066482/spaceexplorationtechnologi.htm',
    facts:[{category:'guidance',guidanceType:'not-issued',topic:'guidance-absence',period:'Q3 2026 written results release',text:'This reviewed results release contains no numerical company-wide forward revenue, EPS or margin forecast. Management discusses investment discipline and project plans; these are not a consolidated financial forecast. Earnings-call guidance and a permanent no-guidance policy have not been verified.'}],
  },
  '7f72b7d0f8406f85479c2e0b1525499b4a483f0aa087eedb111c609f186aeeee': {
    url: 'https://www.sec.gov/Archives/edgar/data/1737806/000110465926130116/tm2630261d1_ex99-1.htm',
    facts: [{ category:'guidance',guidanceType:'not-issued',topic:'guidance-absence',period:'Q3 2026 results release',text:'The reviewed Q3 results release contains no numerical forward revenue, earnings or margin guidance. Management provides qualitative investment priorities. This finding is limited to this release; a permanent company policy of not issuing guidance has not been verified.' }],
  },
  '18218bfbf2d976351898b9afebd9cd70e221836104374457b27c1c31380962c3': {
    url: 'https://www.sec.gov/Archives/edgar/data/1075531/000107553126000044/q3-26bkngearningsrelease.htm',
    replaceCategories: ['earnings', 'guidance'],
    facts: [
      { category: 'earnings', topic: 'revenue', period: 'Q3 2026', text: 'Booking reported revenue of USD 8.9 billion, down 1%, while adjusted revenue of USD 9.8 billion rose 9%. A USD 900 million revenue reduction and a separate USD 100 million loss accrual related to an FTC matter were excluded from its adjusted measures. The GAAP decline is therefore not a direct measure of weaker travel demand.' },
      { category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'Booking forecast adjusted revenue growth of 0–2% and approximately flat adjusted EBITDA year over year. These are non-GAAP measures. The outlook assumed Middle East travel disruptions and indirect effects, including higher airfares, would persist through year end.' },
    ],
  },
  '7b25b0bff65ebad9992df6d3956563c67df59ffae60fd1bc5bee960884087f08': {
    url: 'https://www.sec.gov/Archives/edgar/data/97476/000009747626000165/q32026txnex99-eredgar.htm',
    replaceCategories: ['guidance'],
    facts: [{ category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'Texas Instruments forecast revenue of USD 5.80–6.30 billion and earnings per share of USD 2.45–2.79.' }],
  },
  '1f0673535099f68a794bef7d306df9778e5b899a7e02a81aff882f3044284bec': {
    url: 'https://www.sec.gov/Archives/edgar/data/882835/000088283526000042/a2026q3earningsrelease.htm',
    replaceCategories: ['guidance'],
    facts: [
      { category: 'guidance', topic: 'eps', period: 'Full year 2026', text: 'Roper raised adjusted diluted EPS guidance to USD 22.35–22.40 from USD 22.15–22.30. This is a non-GAAP measure.' },
      { category: 'guidance', topic: 'eps', period: 'Q4 2026', text: 'Roper forecast adjusted diluted EPS of USD 5.95–6.00. Guidance excludes unannounced acquisitions or disposals, proceeds from pending Indicor disposals and potential share repurchases.' },
    ],
  },
  'd37753a04e7edd54dcc93d0044476fdd81e3b3ba15ddd0e0b099c5605856af04': {
    url: 'https://www.sec.gov/Archives/edgar/data/97210/000119312526434981/ter-ex99_1.htm',
    replaceCategories: ['guidance'],
    facts: [{ category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'Teradyne forecast revenue of USD 1,250–1,350 million, GAAP diluted EPS of USD 1.88–2.18 and non-GAAP diluted EPS of USD 1.95–2.25. The adjusted measure excludes specified amortization and related tax effects.' }],
  },
  '74b7fe64e048de9239ffc9ab02842bd4076102977166a489bfd73d41bb8123c4': {
    url: 'https://www.sec.gov/Archives/edgar/data/1559720/000119312526449727/d437988dex991.htm',
    replaceCategories: ['guidance'],
    facts: [{ category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'Airbnb forecast revenue of USD 3.22–3.28 billion, or 16–18% year-over-year growth, including an approximately two-percentage-point currency benefit after hedging. Management expected adjusted EBITDA margin to be slightly below Q4 2025, partly because of marketing timing; adjusted EBITDA is non-GAAP.' }],
  },
  '3c57c61f24ebe5e0aa86517c6ad6ebc603d15299cb7817ac5d2368bf502c9b20': {
    url: 'https://www.sec.gov/Archives/edgar/data/1513845/000110465926126008/tm2629571d1_ex99-1.htm',
    replaceCategories: ['earnings'],
    facts: [{ category: 'earnings', topic: 'revenue', period: 'Q3 2026', text: 'Nebius reported consolidated revenue of USD 980.8 million, up 571% year over year. The loss from continuing operations was USD 37.5 million; adjusted net income was USD 90.9 million, a separate non-GAAP measure.' }],
  },
  '52e21903fe069297945729de9271ab3e556de017d2bb24945993a0cd8af1cd69': {
    url: 'https://www.sec.gov/Archives/edgar/data/1513845/000110465926126008/tm2629571d1_ex99-2.htm',
    replaceCategories: ['guidance'],
    facts: [
      { category: 'guidance', topic: 'revenue', period: '2026', text: 'Nebius expected revenue at the low end of its USD 3.0–3.4 billion range and an adjusted EBITDA margin around 40%. Management said some revenue shifted into early 2027 and that the annualized revenue milestone previously expected in December would move to February.' },
      { category: 'guidance', topic: 'capex', period: '2027 preliminary outlook', text: 'Management initially forecast revenue of USD 12–13 billion and capital spending of USD 40–45 billion, with pre-tax breakeven targeted by year end. These are forecasts, not contracted revenue or achieved results.' },
      { category: 'company-news', topic: 'operations', text: 'Nebius disclosed a shift in the timing of revenue and an annualized revenue milestone as it expanded capacity. This is a company-specific execution update; it does not establish how much of the share-price move it caused.' },
    ],
  },
  '2c08b3585cf207f01417391a3ed725db0c791d20fdbafc79dd869155bcee9182': {
    url: 'https://www.sec.gov/Archives/edgar/data/1075124/000119312526447349/tri-ex99_2.htm',
    replaceCategories: ['earnings'],
    facts: [{ category: 'earnings', topic: 'revenue', period: 'Q3 2026', text: 'Thomson Reuters reported revenue from continuing operations of USD 1,833 million, compared with USD 1,658 million a year earlier. Operating profit was USD 402 million, versus USD 517 million. Global Print is excluded as a discontinued operation.' }],
  },
  '5b3917e48a522d5686cf36ae035a572b6ac1d8da69a2defe7f54b26fafa7d857': {
    url: 'https://www.sec.gov/Archives/edgar/data/1075124/000119312526447349/tri-ex99_1.htm',
    replaceCategories: ['guidance'],
    facts: [{ category: 'guidance', topic: 'revenue', period: 'Full year 2026', text: 'The updated continuing-operations outlook excluded Global Print: total revenue growth around 9.5%, organic revenue growth around 8.5–9.0%, and adjusted EBITDA margin around 39%. The adjusted and organic measures are non-IFRS; the change in business scope prevents a simple comparison with the earlier outlook.' }],
  },
  '8e037642a6a030ca4e29e96dc357ea8898338c09db94c30eb2a48f56a09d1e8b': {
    url: 'https://www.sec.gov/Archives/edgar/data/937966/000162828026065813/pressreleasefinancialresul.htm',
    replaceCategories: ['guidance'],
    facts: [
      { category: 'guidance', topic: 'revenue', period: 'Q4 2026', text: 'ASML forecast total net sales of EUR 14.2–15.2 billion and gross margin around 57%.' },
      { category: 'guidance', topic: 'revenue', period: 'Full year 2026', text: 'ASML forecast total net sales of EUR 44–45 billion and gross margin around 56%.' },
    ],
  },
  'c22007d3c88b9c9f5868272171839565ed4254a3d322e418937df88dfc0f0fd2': {
    url: 'https://www.sec.gov/Archives/edgar/data/1633917/000163391726000086/pypl3q-26earningsrelease.htm',
    replaceCategories: ['guidance'],
    facts: [
      { category: 'guidance', topic: 'eps', period: 'Q4 2026', text: 'PayPal forecast GAAP EPS of approximately USD 1.37 and non-GAAP EPS of approximately USD 1.43.' },
      { category: 'guidance', topic: 'eps', period: 'Full year 2026', text: 'PayPal forecast GAAP EPS of approximately USD 5.07 and non-GAAP EPS of approximately USD 5.60. Management raised its non-GAAP outlook and reaffirmed GAAP EPS guidance; the two accounting measures are not interchangeable.' },
    ],
  },
  'c017178e0082f311a3d36da0bb60a91721567442c51aa551496dec1937f6bd95': {
    url: 'https://www.sec.gov/Archives/edgar/data/1792789/000179278926000062/proddashex991-pressrelease.htm',
    replaceCategories: ['guidance'],
    facts: [{ category: 'guidance', topic: 'outlook', period: 'Q4 2026', text: 'DoorDash forecast marketplace gross order value of USD 35.4–36.4 billion and adjusted EBITDA of USD 900–1,100 million. Order value is transaction volume, not DoorDash revenue; adjusted EBITDA is a non-GAAP measure. The outlook assumes relatively stable consumer demand and key exchange rates.' }],
  },
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
