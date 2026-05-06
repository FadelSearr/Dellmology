/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Broker Character Profile (BCP)
   
   Per roadmap: "Don't just look at how many lots are bought.
   Build behavioral profiles for brokers."
   
   Example: Broker MG is known for "One Day Trade". If MG
   accumulates big, label it "Short-Term Volatility" not
   "Strong Uptrend".
   ══════════════════════════════════════════════════════════════ */

export type BrokerCharacter =
  | 'institutional_accumulator'
  | 'one_day_trader'
  | 'foreign_flow'
  | 'retail_herder'
  | 'market_maker'
  | 'swing_player'
  | 'unknown';

export interface BrokerProfile {
  code: string;
  name: string;
  character: BrokerCharacter;
  label: string;           // Short human-readable label
  description: string;     // Full description
  avgHoldDays: number;     // Average holding period
  reliability: number;     // 0-100 — how reliable is accumulation signal
  color: string;           // UI badge color
}

// ── Known IDX Broker Profiles ────────────────────────────────
// Based on historical behavior patterns in Indonesian market
const BROKER_DB: Record<string, Omit<BrokerProfile, 'code'>> = {
  // ── Foreign / Global Heavyweights (Whales) ───
  'AK': { name: 'UBS Sekuritas', character: 'foreign_flow', label: 'Foreign Whale', description: 'Global heavyweight. Accumulation indicates strong foreign institutional conviction.', avgHoldDays: 20, reliability: 90, color: '#fbbf24' },
  'BK': { name: 'J.P. Morgan Sekuritas', character: 'foreign_flow', label: 'Foreign Whale', description: 'Top tier foreign broker. Very high reliability for long-term trends.', avgHoldDays: 30, reliability: 95, color: '#fbbf24' },
  'CS': { name: 'Credit Suisse Sekuritas', character: 'foreign_flow', label: 'Foreign Whale', description: 'Swiss foreign flow. Tracks major regional shifts.', avgHoldDays: 25, reliability: 92, color: '#fbbf24' },
  'CG': { name: 'Citigroup Sekuritas', character: 'foreign_flow', label: 'Foreign Whale', description: 'Major global institutional flow.', avgHoldDays: 20, reliability: 90, color: '#fbbf24' },
  'MS': { name: 'Morgan Stanley', character: 'foreign_flow', label: 'Foreign Whale', description: 'US-based heavyweight. Strong conviction signals.', avgHoldDays: 30, reliability: 95, color: '#fbbf24' },
  'RX': { name: 'Macquarie Sekuritas', character: 'foreign_flow', label: 'Foreign', description: 'Australian foreign broker. Often active in swing/medium-term trades.', avgHoldDays: 10, reliability: 80, color: '#a78bfa' },
  'KZ': { name: 'CLSA Sekuritas', character: 'foreign_flow', label: 'Foreign', description: 'Asian regional foreign flow.', avgHoldDays: 14, reliability: 85, color: '#a78bfa' },
  'ZP': { name: 'Maybank Sekuritas', character: 'institutional_accumulator', label: 'Institutional', description: 'Large institutional and regional flow. Significant market impact.', avgHoldDays: 15, reliability: 88, color: '#4ade80' },
  'GW': { name: 'HSBC Securities', character: 'foreign_flow', label: 'Foreign Whale', description: 'Global banking institutional flow.', avgHoldDays: 25, reliability: 90, color: '#fbbf24' },
  'ML': { name: 'Merrill Lynch', character: 'foreign_flow', label: 'Foreign Whale', description: 'Major US institutional flow.', avgHoldDays: 30, reliability: 95, color: '#fbbf24' },

  // ── Domestic Institutional / Government Linked ───
  'CC': { name: 'Mandiri Sekuritas', character: 'institutional_accumulator', label: 'Pemerintah', description: 'Government-linked broker. Heavily used by BUMN and local institutions.', avgHoldDays: 20, reliability: 85, color: '#60a5fa' },
  'DX': { name: 'Bahana Sekuritas', character: 'institutional_accumulator', label: 'Pemerintah', description: 'State-owned broker. Accumulation often signifies state institutional support.', avgHoldDays: 25, reliability: 88, color: '#60a5fa' },
  'OD': { name: 'BRI Danareksa', character: 'institutional_accumulator', label: 'Pemerintah', description: 'State-owned institutional broker.', avgHoldDays: 20, reliability: 85, color: '#60a5fa' },
  'NI': { name: 'BNI Sekuritas', character: 'institutional_accumulator', label: 'Pemerintah', description: 'State-owned, mix of retail and institutional.', avgHoldDays: 14, reliability: 75, color: '#60a5fa' },
  'KI': { name: 'Ciptadana Sekuritas', character: 'institutional_accumulator', label: 'Institutional', description: 'Local institutional broker with solid accumulation reliability.', avgHoldDays: 15, reliability: 80, color: '#4ade80' },
  'LG': { name: 'Trimegah Sekuritas', character: 'institutional_accumulator', label: 'Institutional', description: 'Strong local institutional and mutual fund flows.', avgHoldDays: 14, reliability: 82, color: '#4ade80' },
  'SQ': { name: 'BCA Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'BCA-linked broker. Often indicates good swing or medium-term accumulation.', avgHoldDays: 10, reliability: 70, color: '#38bdf8' },
  'YU': { name: 'CGS-CIMB Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Large regional broker with strong local swing activity.', avgHoldDays: 8, reliability: 70, color: '#38bdf8' },
  'DR': { name: 'RHB Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Malaysian-backed broker active in local swing trades.', avgHoldDays: 7, reliability: 65, color: '#38bdf8' },
  'GR': { name: 'Panin Sekuritas', character: 'institutional_accumulator', label: 'Institutional', description: 'Local institutional and high-net-worth individual flows.', avgHoldDays: 14, reliability: 75, color: '#4ade80' },
  
  // ── Retail Herder (Mass Retail) ───
  'YP': { name: 'Mirae Asset Sekuritas', character: 'retail_herder', label: 'Mass Retail', description: 'The largest retail broker in Indonesia. "Pasukan YP". High volume often means retail FOMO.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },
  'PD': { name: 'Indo Premier Sekuritas', character: 'retail_herder', label: 'Mass Retail', description: 'Major retail broker (IPOT). Very sensitive to retail sentiment.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },
  'XC': { name: 'Ajaib Sekuritas', character: 'retail_herder', label: 'Retail Gen-Z', description: 'Fintech broker dominated by retail and Gen-Z. Pure retail sentiment.', avgHoldDays: 2, reliability: 15, color: '#94a3b8' },
  'XL': { name: 'Stockbit Sekuritas', character: 'retail_herder', label: 'Retail Community', description: 'Community-driven retail broker. High accumulation = social media hype.', avgHoldDays: 3, reliability: 20, color: '#94a3b8' },
  'EP': { name: 'MNC Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Large retail base. Frequent short-term trading.', avgHoldDays: 2, reliability: 25, color: '#94a3b8' },
  'KK': { name: 'Phillip Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Retail-focused broker (POEMS).', avgHoldDays: 4, reliability: 35, color: '#94a3b8' },
  'AZ': { name: 'Sucor Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Strong retail and influencer-driven community base.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },

  // ── Day Traders / Scalpers / Market Makers ───
  'MG': { name: 'Semesta Indovest', character: 'one_day_trader', label: 'Day Trade ⚡', description: 'Legendary day-trading broker. Aggressive intra-day volatility. Do not hold based on MG accumulation.', avgHoldDays: 1, reliability: 10, color: '#f87171' },
  'YB': { name: 'Jasa Utama Capital', character: 'one_day_trader', label: 'Day Trade ⚡', description: 'Very active in penny stocks and scalping.', avgHoldDays: 1, reliability: 15, color: '#f87171' },
  'SH': { name: 'Artha Sekuritas', character: 'one_day_trader', label: 'Scalper ⚡', description: 'Known for high-frequency scalping operations.', avgHoldDays: 1, reliability: 10, color: '#f87171' },
  'CP': { name: 'Valbury Sekuritas', character: 'swing_player', label: 'Swing', description: 'Active in short to medium term swings.', avgHoldDays: 5, reliability: 50, color: '#38bdf8' },
  'IF': { name: 'Samuel Sekuritas', character: 'market_maker', label: 'Market Maker', description: 'Often acts as liquidity provider / market maker.', avgHoldDays: 2, reliability: 40, color: '#6b7280' },
  'FZ': { name: 'Waterfront Sekuritas', character: 'market_maker', label: 'Market Maker', description: 'Known for market making in specific mid-cap stocks.', avgHoldDays: 2, reliability: 30, color: '#6b7280' },
  'AI': { name: 'UOB Kay Hian', character: 'market_maker', label: 'Market Maker', description: 'Regional broker, but highly active as market maker locally.', avgHoldDays: 3, reliability: 40, color: '#6b7280' },
  'BQ': { name: 'Korea Investment', character: 'swing_player', label: 'Lokal Swing', description: 'Active in swing trading and local distribution.', avgHoldDays: 4, reliability: 55, color: '#38bdf8' },
  'TP': { name: 'OCBC Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Mixed institutional and retail swing.', avgHoldDays: 5, reliability: 60, color: '#38bdf8' },

  // ── Additional Extended Brokers ───
  'DB': { name: 'Deutsche Sekuritas', character: 'foreign_flow', label: 'Foreign Whale', description: 'Global institutional flow. High conviction moves.', avgHoldDays: 25, reliability: 90, color: '#fbbf24' },
  'DP': { name: 'DBS Vickers', character: 'foreign_flow', label: 'Foreign Whale', description: 'Major Singapore-based foreign flow.', avgHoldDays: 20, reliability: 85, color: '#fbbf24' },
  'HP': { name: 'Henan Putihrai', character: 'institutional_accumulator', label: 'Institutional', description: 'Local institutional and high net worth individuals.', avgHoldDays: 14, reliability: 75, color: '#4ade80' },
  'TX': { name: 'Victoria Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Active in medium caps and swing trading.', avgHoldDays: 7, reliability: 60, color: '#38bdf8' },
  'YI': { name: 'Erdikha Elit', character: 'swing_player', label: 'Lokal Swing', description: 'Often active in secondary liners.', avgHoldDays: 5, reliability: 50, color: '#38bdf8' },
  'AG': { name: 'Kiwoom Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Korean-backed broker with mixed retail and institutional flow.', avgHoldDays: 5, reliability: 55, color: '#38bdf8' },
  'AH': { name: 'Aldiracita Sekuritas', character: 'institutional_accumulator', label: 'Institutional', description: 'Local institutional flow, often seen in structured transactions.', avgHoldDays: 20, reliability: 80, color: '#4ade80' },
  'AR': { name: 'Binaartha Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Retail-oriented broker.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },
  'AT': { name: 'Phintraco Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Large retail branches network across Indonesia.', avgHoldDays: 4, reliability: 35, color: '#94a3b8' },
  'BZ': { name: 'Batavia Prosperindo', character: 'institutional_accumulator', label: 'Institutional', description: 'Asset management and institutional linked.', avgHoldDays: 30, reliability: 85, color: '#4ade80' },
  'DH': { name: 'Sinarmas Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Large retail client base (SimInvest).', avgHoldDays: 3, reliability: 35, color: '#94a3b8' },
  'FS': { name: 'Amantara Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Active in small-mid caps.', avgHoldDays: 5, reliability: 50, color: '#38bdf8' },
  'HD': { name: 'KGI Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Taiwanese-backed, active in swing trades.', avgHoldDays: 7, reliability: 60, color: '#38bdf8' },
  'IN': { name: 'Investindo', character: 'market_maker', label: 'Market Maker', description: 'Frequently provides liquidity in specific stocks.', avgHoldDays: 2, reliability: 30, color: '#6b7280' },
  'IU': { name: 'Indo Capital', character: 'market_maker', label: 'Market Maker', description: 'Known for specific market making activities.', avgHoldDays: 2, reliability: 35, color: '#6b7280' },
  'LS': { name: 'Reliance Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Retail heavy broker.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },
  'PG': { name: 'Panca Global', character: 'market_maker', label: 'Market Maker', description: 'Very active in high-frequency providing liquidity.', avgHoldDays: 1, reliability: 20, color: '#6b7280' },
  'PO': { name: 'Pilarmas Investindo', character: 'swing_player', label: 'Lokal Swing', description: 'Active in swing and medium term trades.', avgHoldDays: 6, reliability: 55, color: '#38bdf8' },
  'RF': { name: 'Buana Capital', character: 'institutional_accumulator', label: 'Institutional', description: 'High-net worth and local institutional flow.', avgHoldDays: 15, reliability: 75, color: '#4ade80' },
  'RO': { name: 'NISP Sekuritas', character: 'institutional_accumulator', label: 'Institutional', description: 'Bank OCBC NISP affiliated institutional flow.', avgHoldDays: 20, reliability: 80, color: '#4ade80' },
  'SF': { name: 'Surya Fajar', character: 'swing_player', label: 'Lokal Swing', description: 'Active in small caps and swing trades.', avgHoldDays: 4, reliability: 45, color: '#38bdf8' },
  'TF': { name: 'Universal Broker', character: 'swing_player', label: 'Lokal Swing', description: 'Mixed swing flow.', avgHoldDays: 5, reliability: 50, color: '#38bdf8' },
  'BS': { name: 'Equity Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Active in mid-small caps.', avgHoldDays: 5, reliability: 45, color: '#38bdf8' },
  'YJ': { name: 'Lautandhana', character: 'swing_player', label: 'Lokal Swing', description: 'Traditional swing broker.', avgHoldDays: 6, reliability: 55, color: '#38bdf8' },

  // ── Tier-2 / Minor & Niche Brokers ───
  'AN': { name: 'Wanteg Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Active in small and mid-cap swings.', avgHoldDays: 5, reliability: 40, color: '#38bdf8' },
  'AP': { name: 'Pacific Dua Ribu', character: 'swing_player', label: 'Lokal Swing', description: 'Often handles block sales and specific swings.', avgHoldDays: 7, reliability: 45, color: '#38bdf8' },
  'BF': { name: 'Evergreen Sekuritas', character: 'market_maker', label: 'Market Maker', description: 'Often acts as liquidity provider for specific stocks.', avgHoldDays: 2, reliability: 30, color: '#6b7280' },
  'BW': { name: 'BNP Paribas', character: 'foreign_flow', label: 'Foreign Whale', description: 'European foreign institutional flow.', avgHoldDays: 20, reliability: 85, color: '#fbbf24' },
  'CD': { name: 'Mega Capital Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Retail clients from Mega group.', avgHoldDays: 4, reliability: 35, color: '#94a3b8' },
  'II': { name: 'Danatama Makmur', character: 'institutional_accumulator', label: 'Institutional / MM', description: 'Active in corporate actions and market making.', avgHoldDays: 10, reliability: 65, color: '#4ade80' },
  'KS': { name: 'Kresna Sekuritas', character: 'market_maker', label: 'Market Maker', description: 'Historically strong market maker in tech/digital stocks.', avgHoldDays: 3, reliability: 30, color: '#6b7280' },
  'MI': { name: 'Victoria Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Active in secondary tier stocks.', avgHoldDays: 5, reliability: 45, color: '#38bdf8' },
  'MU': { name: 'Minna Padi Investama', character: 'swing_player', label: 'Lokal Swing', description: 'Local swing and structured transactions.', avgHoldDays: 6, reliability: 40, color: '#38bdf8' },
  'PC': { name: 'First Asia Capital', character: 'swing_player', label: 'Lokal Swing', description: 'Active in swing trades.', avgHoldDays: 5, reliability: 50, color: '#38bdf8' },
  'RS': { name: 'Yulie Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Local swing trades.', avgHoldDays: 5, reliability: 45, color: '#38bdf8' },
  'XA': { name: 'NH Korindo Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Mixed retail and institutional swing.', avgHoldDays: 6, reliability: 55, color: '#38bdf8' },
  'OK': { name: 'Net Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Active in small-caps.', avgHoldDays: 4, reliability: 40, color: '#38bdf8' },

  // ── Long Tail / Less Active & Suspended Brokers ───
  'AF': { name: 'Limas Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'AO': { name: 'Erdikha Elit Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Branch / Alternative code for Erdikha.', avgHoldDays: 5, reliability: 40, color: '#38bdf8' },
  'AQ': { name: 'Reliance Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Branch / Alternative code for Reliance.', avgHoldDays: 4, reliability: 35, color: '#38bdf8' },
  'AW': { name: 'Kiwoom Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Branch / Alternative code for Kiwoom.', avgHoldDays: 5, reliability: 40, color: '#38bdf8' },
  'BB': { name: 'Binaartha Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Alternative code for Binaartha.', avgHoldDays: 4, reliability: 35, color: '#38bdf8' },
  'CM': { name: 'Optima Kharya Capital', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'DF': { name: 'Amantara Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Branch / Alternative code for Amantara.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'FG': { name: 'Nomura Sekuritas Indonesia', character: 'foreign_flow', label: 'Foreign Whale', description: 'Japanese foreign institutional flow.', avgHoldDays: 25, reliability: 85, color: '#fbbf24' },
  'FM': { name: 'Onix Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 35, color: '#38bdf8' },
  'GI': { name: 'Mahakarya Artha Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Pre-acquisition Stockbit / Retail flow.', avgHoldDays: 3, reliability: 20, color: '#94a3b8' },
  'IP': { name: 'Indo Premier Sekuritas', character: 'retail_herder', label: 'Mass Retail', description: 'Alternative code for IPOT.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },
  'IT': { name: 'Inti Fikasa Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'KU': { name: 'Mahatra Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'LH': { name: 'JPMorgan Sekuritas', character: 'foreign_flow', label: 'Foreign Whale', description: 'Alternative code for JPMorgan.', avgHoldDays: 25, reliability: 90, color: '#fbbf24' },
  'LU': { name: 'Lautan Dana Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Alternative code for Lautandhana.', avgHoldDays: 5, reliability: 40, color: '#38bdf8' },
  'NL': { name: 'Macquarie Sekuritas', character: 'foreign_flow', label: 'Foreign', description: 'Alternative code for Macquarie.', avgHoldDays: 15, reliability: 80, color: '#a78bfa' },
  'PF': { name: 'Danasupra Erapacific', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'PP': { name: 'Pacific Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 35, color: '#38bdf8' },
  'PS': { name: 'Paramitra Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 35, color: '#38bdf8' },
  'QA': { name: 'Oso Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'RG': { name: 'Profindo Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 35, color: '#38bdf8' },
  'SC': { name: 'Danatama Makmur', character: 'institutional_accumulator', label: 'Institutional / MM', description: 'Alternative code for Danatama Makmur.', avgHoldDays: 10, reliability: 65, color: '#4ade80' },
  'SS': { name: 'Supra Bakti', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'SU': { name: 'Sucor Sekuritas', character: 'retail_herder', label: 'Retail', description: 'Alternative code for Sucor.', avgHoldDays: 3, reliability: 30, color: '#94a3b8' },
  'TB': { name: 'Tiga Pilar', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'YF': { name: 'Jasa Utama Capital', character: 'one_day_trader', label: 'Day Trade ⚡', description: 'Alternative code for Jasa Utama.', avgHoldDays: 1, reliability: 15, color: '#f87171' },

  // ── Fringe / Dormant Brokers ───
  'AD': { name: 'Adimitra Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 30, color: '#38bdf8' },
  'ES': { name: 'Ekokapital Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 4, reliability: 30, color: '#38bdf8' },
  'FO': { name: 'Forte Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 30, color: '#38bdf8' },
  'HN': { name: 'Minna Padi Investama', character: 'swing_player', label: 'Lokal Swing', description: 'Alternative code for Minna Padi.', avgHoldDays: 5, reliability: 35, color: '#38bdf8' },
  'ID': { name: 'Anugerah Sekuritas', character: 'swing_player', label: 'Lokal Swing', description: 'Small cap swing broker.', avgHoldDays: 5, reliability: 35, color: '#38bdf8' },
};

// ── Lookup ───────────────────────────────────────────────────
export function getBrokerProfile(code: string): BrokerProfile {
  const profile = BROKER_DB[code];
  if (profile) {
    return { code, ...profile };
  }
  return {
    code,
    name: code,
    character: 'unknown',
    label: 'Unknown',
    description: 'No profile data available for this broker.',
    avgHoldDays: 0,
    reliability: 50,
    color: '#6b7280',
  };
}

// ── Interpret accumulation based on broker character ─────────
export function interpretAccumulation(
  brokerCode: string,
  netValue: number,
  isAccumulating: boolean
): { label: string; warning: string | null; adjustedReliability: number } {
  const profile = getBrokerProfile(brokerCode);

  if (!isAccumulating) {
    return {
      label: `${profile.label} — Distribution`,
      warning: null,
      adjustedReliability: profile.reliability,
    };
  }

  switch (profile.character) {
    case 'one_day_trader':
      return {
        label: `${profile.label} — Short-Term Volatility`,
        warning: `⚠️ ${brokerCode} (${profile.name}) known for day trading. Accumulation likely short-lived.`,
        adjustedReliability: profile.reliability,
      };
    case 'retail_herder':
      return {
        label: `${profile.label} — Retail FOMO`,
        warning: `⚠️ Retail-heavy broker. Volume spike may indicate late-stage euphoria.`,
        adjustedReliability: profile.reliability,
      };
    case 'market_maker':
      return {
        label: `${profile.label} — Non-Directional`,
        warning: `ℹ️ Market maker activity — net position has low directional significance.`,
        adjustedReliability: profile.reliability,
      };
    case 'institutional_accumulator':
    case 'foreign_flow':
      return {
        label: `${profile.label} — Strong ${isAccumulating ? 'Uptrend' : 'Downtrend'} Signal`,
        warning: null,
        adjustedReliability: profile.reliability,
      };
    default:
      return {
        label: `${profile.label} — Accumulation`,
        warning: null,
        adjustedReliability: profile.reliability,
      };
  }
}

export function getAllProfiledBrokers(): string[] {
  return Object.keys(BROKER_DB);
}
