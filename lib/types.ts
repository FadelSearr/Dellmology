/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Type Definitions
   ══════════════════════════════════════════════════════════════ */

// ── Market Regime ────────────────────────────────────────────
export type MarketRegime = 'uptrend' | 'downtrend' | 'sideways';

// ── Screener Mode ────────────────────────────────────────────
export type ScreenerMode = 'daytrade' | 'swing' | 'custom';

// ── Broker Identity ──────────────────────────────────────────
export type BrokerIdentity = 'Whale' | 'Retail' | 'Mix' | 'Bandar';

// ── Health Status ────────────────────────────────────────────
export type HealthStatus = 'online' | 'offline' | 'warning';

// ── Confidence Level ─────────────────────────────────────────
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// ── UPS Signal ───────────────────────────────────────────────
export type UPSSignal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';

// ── Infrastructure Health ────────────────────────────────────
export interface InfraHealth {
  engine: HealthStatus;       // Go + SSE connection
  database: HealthStatus;     // Supabase/TimescaleDB
  token: HealthStatus;        // Bearer token status
  dataIntegrity: HealthStatus; // Data completeness
}

// ── Emiten Summary ───────────────────────────────────────────
export interface EmitenSummary {
  code: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  ups: number;            // Unified Power Score 0-100
  regime: MarketRegime;
}

// ── Watchlist Item ───────────────────────────────────────────
export interface WatchlistItem {
  id: number | string;
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  ups: number;
  sector?: string;
  inWatchlist?: boolean;
}

// ── Broker Flow Entry ────────────────────────────────────────
export interface BrokerFlowEntry {
  brokerCode: string;
  identity: BrokerIdentity;
  netValue: number;
  netLot: number;
  avgPrice: number;
  consistencyScore: number;  // 0-100
  dailyHeatmap: number[];   // Array of daily net values for sparkline
  buyDays: number;
  totalDays: number;
}

// ── Whale Z-Score ────────────────────────────────────────────
export interface WhaleZScore {
  date: string;
  zScore: number;
  volume: number;
  isAnomaly: boolean;
}

// ── Order Flow Level ─────────────────────────────────────────
export interface OrderFlowLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  isBigWall: boolean;
  isSpoofing: boolean;
}

// ── HAKA/HAKI Tick ───────────────────────────────────────────
export interface AggressiveTick {
  time: string;
  price: number;
  volume: number;
  type: 'haka' | 'haki';
  emiten: string;
}

// ── Unified Power Score ──────────────────────────────────────
export interface UnifiedPowerScore {
  total: number;           // 0-100
  technical: number;       // 0-100
  bandarmology: number;    // 0-100
  volumeFlow: number;      // 0-100
  sentiment: number;       // 0-100
  signal: UPSSignal;
  confidence: ConfidenceLevel;
}

// ── AI Narrative ─────────────────────────────────────────────
export interface AINarrative {
  summary: string;
  bullCase: string;
  bearCase: string;
  confidence: ConfidenceLevel;
  timestamp: string;
  keyPoints: string[];
}

// ── Position Sizing ──────────────────────────────────────────
export interface PositionSizing {
  atr: number;
  suggestedLot: number;
  riskPerTrade: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  slippageBuffer: number;  // 0.5-1% per roadmap
}

// ── Wash Sale Alert ──────────────────────────────────────────
export interface WashSaleAlert {
  emiten: string;
  brokerA: string;
  brokerB: string;
  volume: number;
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
}

// ── Token Status ─────────────────────────────────────────────
export interface TokenStatus {
  exists: boolean;
  isValid: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  isExpiringSoon: boolean;
  isExpired: boolean;
  hoursUntilExpiry?: number;
}

// ── Supabase Session ─────────────────────────────────────────
export interface SessionRow {
  key: string;
  value: string;
  expires_at?: string;
  is_valid: boolean;
  last_used_at?: string;
  updated_at: string;
}

// ── Stock Query Record ───────────────────────────────────────
export interface StockQueryRecord {
  id: number;
  emiten: string;
  sector?: string;
  from_date: string;
  to_date: string;
  bandar?: string;
  barang_bandar?: number;
  rata_rata_bandar?: number;
  harga?: number;
  ara?: number;
  arb?: number;
  target_realistis?: number;
  target_max?: number;
  status: string;
  created_at: string;
}

// ── Screener Result ──────────────────────────────────────────
export interface ScreenerResult {
  emiten: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  ups: number;
  regime: MarketRegime;
  topBroker: string;
  netValue: number;
  zScore: number;
  hakaRatio: number;  // HAKA / (HAKA+HAKI)
  signal: UPSSignal;
  confidence: ConfidenceLevel;
}

// ── Market Detector Response ─────────────────────────────────
export interface MarketDetectorBroker {
  netbs_broker_code: string;
  bval: string;
  blot: string;
  netbs_buy_avg_price: string;
}

export interface MarketDetectorResponse {
  data: {
    broker_summary: {
      brokers_buy: MarketDetectorBroker[];
      brokers_sell: MarketDetectorBroker[];
    };
    bandar_detector: {
      top1: { vol: number; percent: number; amount: number; accdist: string };
      top3: { vol: number; percent: number; amount: number; accdist: string };
      top5: { vol: number; percent: number; amount: number; accdist: string };
      total_buyer: number;
      total_seller: number;
      volume: number;
      value: number;
    };
  };
}

// ── Orderbook Response ───────────────────────────────────────
export interface OrderbookResponse {
  data: {
    close: number;
    high: number;
    ara: { value: string };
    arb: { value: string };
    offer: { price: string; volume: string }[];
    bid: { price: string; volume: string }[];
    total_bid_offer: {
      bid: { lot: string };
      offer: { lot: string };
    };
  };
}
