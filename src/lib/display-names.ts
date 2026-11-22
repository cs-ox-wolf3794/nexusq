/** Presentation labels only. Original provider names remain in evidence and tooltips. */
const COMPANY_NAMES: Record<string, string> = {
  AAPL:'Apple', MSFT:'Microsoft', NVDA:'NVIDIA', AMD:'AMD', AMZN:'Amazon', GOOGL:'Alphabet · Class A', GOOG:'Alphabet · Class C',
  META:'Meta Platforms', SNDK:'SanDisk', ASML:'ASML', ARM:'Arm', ADBE:'Adobe', AVGO:'Broadcom', ALAB:'Astera Labs',
  CRWV:'CoreWeave', CRWD:'CrowdStrike', DDOG:'Datadog', DXCM:'Dexcom', MELI:'MercadoLibre', MSTR:'Strategy', PDD:'PDD Holdings',
  NBIS:'Nebius', NFLX:'Netflix', INTC:'Intel', MU:'Micron Technology', CSCO:'Cisco Systems', TSLA:'Tesla',
  APP:'AppLovin', PANW:'Palo Alto Networks', PLTR:'Palantir Technologies', QCOM:'Qualcomm', NXPI:'NXP Semiconductors',
  SHOP:'Shopify', WDC:'Western Digital', STX:'Seagate Technology', WDAY:'Workday', PYPL:'PayPal', DASH:'DoorDash',
  AEP:'American Electric Power', CEG:'Constellation Energy', EXC:'Exelon', FANG:'Diamondback Energy', BKR:'Baker Hughes',
  LRCX:'Lam Research', AMAT:'Applied Materials', ADI:'Analog Devices', CDNS:'Cadence Design Systems', SNPS:'Synopsys',
  TXN:'Texas Instruments', GEHC:'GE HealthCare', TMUS:'T-Mobile US', ORLY:"O’Reilly Automotive", PCAR:'PACCAR',
};
const ACRONYMS = new Set(['AI','US','UK','EU','GE','CSX','IDEXX','KLA','NXP','PLC','ADS','ADR','NV','N.V.','CL','CMN','CP','NY','ETF','LP']);
export function companyName(symbol: string, original: string) {
  if (COMPANY_NAMES[symbol]) return COMPANY_NAMES[symbol];
  if (original !== original.toUpperCase()) return original;
  return original.split(/(\s+)/).map(word => ACRONYMS.has(word) || /^[A-Z]$/.test(word) ? word : word.toLowerCase().replace(/(^|[-'])\p{L}/gu, x=>x.toUpperCase())).join('');
}
