import type { NexsiProject } from "./nexsi-types";

// Dated primary-source case studies, not a complete facility census. Never sum
// generation contracts, portfolio totals and individual campuses together.
export const NEXSI_PROJECTS: NexsiProject[] = [
  {
    id: "fairwater", name: "Fairwater, Mount Pleasant", symbols: ["MSFT"], location: "Wisconsin, US", state: "WI",
    role: "Microsoft operator", reportedStatus: "Operational — June 2026 company disclosure", capacityMw: null, capacityBasis: "unspecified",
    capacityNote: "Electrical capacity not quantified in the cited completion release.", timing: "First facility construction completed; equipment startup began April 2026.",
    energyChannel: "Operating electricity costs and the speed of adding firm grid capacity can affect cloud margins and deployment. Actual tariff and hedge coverage are not disclosed here.",
    sources: [{ title: "Microsoft completion announcement", url: "https://news.microsoft.com/source/2026/06/23/microsoft-completes-construction-on-first-datacenter-facility-in-mount-pleasant-wisconsin/", published: "2026-06-23" }], reviewedAt: "2026-11-21",
  },
  {
    id: "crane", name: "Crane nuclear restart / Microsoft power agreement", symbols: ["MSFT", "CEG"], location: "Pennsylvania, US", state: "PA",
    role: "Constellation generator; Microsoft power buyer", reportedStatus: "Restart in progress; subject to regulatory approvals", capacityMw: 835, capacityBasis: "generation",
    capacityNote: "Generation capacity under a 20-year agreement, not Microsoft IT load.", timing: "Operator targets service in 2027; timing is forward-looking.",
    energyChannel: "Long-term contracted power changes exposure to spot prices. Restart delays create supply and execution risk; generation MW cannot be used as a data-center operating-cost input.",
    sources: [{ title: "Constellation project and restart schedule", url: "https://www.constellationenergy.com/about/locations/crane-clean-energy-center.html", published: "Undated project page; reviewed 2026-11-21" }, { title: "Pennsylvania project facts", url: "https://www.pa.gov/agencies/dep/dep-regions/southcentral-regional-office/crane-clean-energy-center-ccec", published: "2026-07-13" }], reviewedAt: "2026-11-21",
  },
  {
    id: "amazon-pa", name: "AWS Pennsylvania / Susquehanna power agreement", symbols: ["AMZN"], location: "Pennsylvania, US", state: "PA",
    role: "AWS power buyer; Talen supplier", reportedStatus: "Long-term power agreement announced", capacityMw: 1920, capacityBasis: "generation",
    capacityNote: "Full contracted power quantity for regional operations; not a single facility's IT load.", timing: "Power ramps to full quantity no later than 2032 under the 2025 announcement; contract through 2042.",
    energyChannel: "Contracted supply supports AI/cloud expansion and reduces reliance on short-term procurement. Company-specific cost pass-through and contract prices are not inferred from gas futures.",
    sources: [{ title: "Talen expanded AWS power agreement", url: "https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-expands-nuclear-energy-relationship-amazon", published: "2025-06-11" }], reviewedAt: "2026-11-21",
  },
  {
    id: "google-texas", name: "Google Armstrong and Haskell campuses", symbols: ["GOOG", "GOOGL"], location: "Texas, US", state: "TX",
    role: "Alphabet developer / operator", reportedStatus: "Announced investment program", capacityMw: null, capacityBasis: "unspecified",
    capacityNote: "Campus IT demand not stated. The separate 6,200+ MW of Texas energy contracts is not campus capacity.", timing: "$40 billion Texas infrastructure investment through 2027, announced November 2025.",
    energyChannel: "Power availability, solar/storage integration and procurement terms can affect expansion costs. Regional gas prices can influence grid prices, but the relationship is not one-for-one.",
    sources: [{ title: "Google Texas investment announcement", url: "https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-texas/", published: "2025-11-14" }], reviewedAt: "2026-11-21",
  },
  {
    id: "meta-hyperion", name: "Meta Hyperion AI cluster", symbols: ["META"], location: "US; cluster announcement", state: "",
    role: "Meta planned AI infrastructure", reportedStatus: "Planned scale — September 2025 engineering disclosure", capacityMw: 5000, capacityBasis: "unspecified",
    capacityNote: "Up to 5 GW at full buildout; source does not distinguish IT from total facility load. Not current demand.", timing: "Announced start from 2028; subsequent commissioning status not established by this source.",
    energyChannel: "Large power and grid requirements create procurement, construction and utilization risk. Nameplate capacity is not actual consumption or an earnings forecast.",
    sources: [{ title: "Meta engineering: future AI infrastructure", url: "https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/", published: "2025-09-29" }], reviewedAt: "2026-11-21",
  },
  {
    id: "nebius-vineland", name: "Nebius / DataOne Vineland AI factory", symbols: ["NBIS"], location: "New Jersey, US", state: "NJ",
    role: "Nebius tenant and GPU operator; DataOne facility owner", reportedStatus: "Construction ongoing on project website", capacityMw: null, capacityBasis: "unspecified",
    capacityNote: "No comparable operational load quantified in the cited project page.", timing: "Project page expects operation in 2027; forward-looking.",
    energyChannel: "The project specifies on-site Bloom Energy fuel cells. Fuel procurement and commissioning matter; a state average retail electricity tariff does not describe this off-grid arrangement.",
    sources: [{ title: "Nebius Vineland project facts and schedule", url: "https://nebius.com/vinelandnj", published: "Undated project page; reviewed 2026-11-21" }], reviewedAt: "2026-11-21",
  },
  {
    id: "coreweave-portfolio", name: "CoreWeave data-center portfolio", symbols: ["CRWV"], location: "US and international portfolio", state: "",
    role: "Cloud operator across leased and operated capacity", reportedStatus: "52 active data centers reported in Q3 2026", capacityMw: null, capacityBasis: "unspecified",
    capacityNote: "Company reports over 1.7 GW active power and over 4.6 GW contracted power. Portfolio aggregates, not a single project or equivalent current load.", timing: "Quarter ended September 2026; presentation published November 10.",
    energyChannel: "Power delivery determines how contracted infrastructure becomes revenue-producing capacity. Leases, financing, customer contracts and utilization also affect margins and equity value.",
    sources: [{ title: "CoreWeave Q3 2026 presentation", url: "https://s205.q4cdn.com/133937190/files/content_files/CoreWeave-3Q26-Earnings-Presentation-Final.pdf", published: "2026-11-10" }], reviewedAt: "2026-11-21",
  },
  {
    id: "tesla-cortex", name: "Tesla Cortex training clusters", symbols: ["TSLA"], location: "Texas, US", state: "TX",
    role: "Tesla internal autonomy training", reportedStatus: "Cortex 1 and 2 in production in Q3 2026", capacityMw: null, capacityBasis: "unspecified",
    capacityNote: "Company lists >105 MW and >120 MW installed training capacity. Installed capacity is not actual utilization; facility/IT boundary is not specified here.", timing: "Q3 2026 update; future expansion remains a plan.",
    energyChannel: "Training power is one cost channel. Vehicle demand, autonomy execution, manufacturing and storage sales are separate material exposures; the stock's energy coefficient cannot isolate Cortex costs.",
    sources: [{ title: "Tesla Q3 2026 operating update", url: "https://assets-ir.tesla.com/tesla-contents/IR/TSLA-Q3-2026-Update.pdf", published: "2026-10" }], reviewedAt: "2026-11-21",
  },
  {
    id: "apple-maiden", name: "Apple Maiden data-center expansion", symbols: ["AAPL"], location: "North Carolina, US", state: "NC",
    role: "Apple operator", reportedStatus: "Expansion under construction in August 2025 disclosure", capacityMw: null, capacityBasis: "unspecified",
    capacityNote: "Incremental MW and the share of capacity serving AI are not quantified in the cited release.", timing: "Completion date not established by this source.",
    energyChannel: "Owned data centers and external cloud providers create different energy-cost exposures. AI workloads are only part of the infrastructure supporting Apple services.",
    sources: [{ title: "Apple US investment and Maiden expansion", url: "https://www.apple.com/newsroom/2025/08/apple-increases-us-commitment-to-600-billion-usd-announces-ambitious-program/", published: "2025-08-06" }], reviewedAt: "2026-11-21",
  },
];

export function energyPathway(group: string): string {
  if (group === "Cloud & data centers") return "Direct operating exposure: electricity procurement, cooling and utilization affect cloud economics. Power connections and construction timing affect capacity and revenue. Long-term contracts can buffer spot-price changes; their terms are not fully public.";
  if (group === "Chips & semiconductor equipment") return "Main channel: customers' AI infrastructure budgets, power availability and demand for compute efficiency; manufacturing also uses electricity. Chip suppliers do not automatically own the data centers that buy their products. Export rules, product cycles and competition are separate drivers.";
  if (group === "Power & energy suppliers") return "Generation, fuel procurement and regulated utility investment have different exposures. Higher energy prices can help or hurt depending on contracts, fuel costs and regulation. A technology customer's electricity expense is not automatically this company's profit.";
  if (group === "AI software & platforms") return "Cloud hosting and inference costs can affect gross margins, with exposure mediated by cloud contracts, pricing and efficiency. Customer budgets, adoption and competitive changes are separate drivers; a daily energy-market correlation does not identify an AI cost share.";
  if (group === "Hardware & connectivity") return "Exposure includes manufacturing energy and data-center equipment demand. Customers' power constraints may delay orders or raise demand for efficient systems. Product mix, inventory and competition remain independent channels.";
  return "Potential channels include cloud/compute spending, customer demand, inflation and financing costs. The group's inclusion is a broad research screen, not proof of material AI revenue or a disclosed data-center energy bill. Review the company's filings for its actual business mix.";
}
