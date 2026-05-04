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
  // ── Foreign / Institutional Heavyweights ───
  'YP': {
    name: 'Mirae Asset', character: 'institutional_accumulator',
    label: 'Institutional', description: 'Major foreign institutional broker. Accumulation signals are highly reliable for medium-term trend.',
    avgHoldDays: 14, reliability: 90, color: '#4ade80',
  },
  'CC': {
    name: 'Mandiri Sekuritas', character: 'institutional_accumulator',
    label: 'Pemerintah', description: 'Government-linked broker. Often used by BUMN institutions for strategic accumulation.',
    avgHoldDays: 30, reliability: 88, color: '#60a5fa',
  },
  'PD': {
    name: 'Indo Premier', character: 'institutional_accumulator',
    label: 'Institutional', description: 'Major institutional broker with consistent accumulation patterns.',
    avgHoldDays: 10, reliability: 82, color: '#4ade80',
  },
  'KZ': {
    name: 'DBS Vickers', character: 'foreign_flow',
    label: 'Foreign', description: 'Singapore-based foreign flow. Track for regional sentiment.',
    avgHoldDays: 7, reliability: 75, color: '#a78bfa',
  },
  'RX': {
    name: 'Macquarie', character: 'foreign_flow',
    label: 'Foreign', description: 'Australian foreign broker. Swing-oriented foreign flow.',
    avgHoldDays: 5, reliability: 70, color: '#a78bfa',
  },
  'ZP': {
    name: 'Morgan Stanley', character: 'foreign_flow',
    label: 'Foreign Whale', description: 'Global heavyweight. Accumulation is very significant for big-cap stocks.',
    avgHoldDays: 21, reliability: 95, color: '#fbbf24',
  },
  'AK': {
    name: 'CLSA', character: 'foreign_flow',
    label: 'Foreign', description: 'Hong Kong-based broker. Tracks regional sentiment closely.',
    avgHoldDays: 10, reliability: 78, color: '#a78bfa',
  },
  'KI': {
    name: 'JP Morgan', character: 'foreign_flow',
    label: 'Foreign Whale', description: 'US-based heavyweight. Rare activity = very significant signal.',
    avgHoldDays: 30, reliability: 95, color: '#fbbf24',
  },
  'YU': {
    name: 'CGS-CIMB', character: 'swing_player',
    label: 'Swing', description: 'Mixed institutional/retail. Good for swing trade confirmation.',
    avgHoldDays: 5, reliability: 60, color: '#38bdf8',
  },

  // ── Domestic / Retail Heavy ───
  'MG': {
    name: 'MNC Sekuritas', character: 'one_day_trader',
    label: 'Day Trade ⚡', description: 'Known for aggressive one-day trading. Accumulation ≠ uptrend signal. Expect short-term volatility.',
    avgHoldDays: 1, reliability: 25, color: '#f87171',
  },
  'TP': {
    name: 'Sucor Sekuritas', character: 'one_day_trader',
    label: 'Day Trade ⚡', description: 'High frequency, short holding. Often precedes intraday volatility.',
    avgHoldDays: 1, reliability: 20, color: '#f87171',
  },
  'DX': {
    name: 'BNI Sekuritas', character: 'retail_herder',
    label: 'Retail', description: 'Retail-heavy broker. High volume = retail FOMO, not institutional conviction.',
    avgHoldDays: 3, reliability: 30, color: '#94a3b8',
  },
  'SQ': {
    name: 'Shinhan Sekuritas', character: 'swing_player',
    label: 'Lokal', description: 'Mixed domestic broker. Moderate reliability for swing signals.',
    avgHoldDays: 5, reliability: 55, color: '#38bdf8',
  },
  'GR': {
    name: 'Sinarmas Sekuritas', character: 'retail_herder',
    label: 'Retail', description: 'Retail online broker. Volume spike = retail enthusiasm, use with caution.',
    avgHoldDays: 2, reliability: 30, color: '#94a3b8',
  },
  'XL': {
    name: 'BCA Sekuritas', character: 'swing_player',
    label: 'Lokal', description: 'BCA-linked broker. Good for medium-term confirmation.',
    avgHoldDays: 7, reliability: 65, color: '#38bdf8',
  },
  'AZ': {
    name: 'Ajaib Sekuritas', character: 'retail_herder',
    label: 'Retail Gen-Z', description: 'Fintech retail broker. Pure retail sentiment indicator.',
    avgHoldDays: 2, reliability: 15, color: '#94a3b8',
  },
  'EP': {
    name: 'Stockbit Sekuritas', character: 'retail_herder',
    label: 'Retail SB', description: 'Stockbit retail broker. Community-driven sentiment.',
    avgHoldDays: 3, reliability: 20, color: '#94a3b8',
  },
  'IF': {
    name: 'KB Sekuritas', character: 'market_maker',
    label: 'Market Maker', description: 'Often acts as market maker. Net position less meaningful.',
    avgHoldDays: 1, reliability: 10, color: '#6b7280',
  },
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
