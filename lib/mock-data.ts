/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Mock Data for Dashboard Development
   ══════════════════════════════════════════════════════════════ */

import type {
  WatchlistItem, BrokerFlowEntry, WhaleZScore,
  UnifiedPowerScore, AINarrative, PositionSizing,
  InfraHealth, ScreenerResult,
} from './types';

// ── Watchlist ────────────────────────────────────────────────
export const mockWatchlist: WatchlistItem[] = [
  { id: 1, code: 'BBRI', name: 'Bank Rakyat Indonesia', price: 4650, change: 50, changePercent: 1.09, ups: 82, sector: 'Finance' },
  { id: 2, code: 'BBCA', name: 'Bank Central Asia', price: 9875, change: -25, changePercent: -0.25, ups: 65, sector: 'Finance' },
  { id: 3, code: 'ANTM', name: 'Aneka Tambang', price: 1505, change: 30, changePercent: 2.03, ups: 91, sector: 'Mining' },
  { id: 4, code: 'TLKM', name: 'Telkom Indonesia', price: 3120, change: -40, changePercent: -1.27, ups: 38, sector: 'Telecom' },
  { id: 5, code: 'GOTO', name: 'GoTo Gojek Tokopedia', price: 68, change: 3, changePercent: 4.62, ups: 74, sector: 'Technology' },
  { id: 6, code: 'ADRO', name: 'Adaro Energy', price: 2380, change: 60, changePercent: 2.59, ups: 87, sector: 'Mining' },
  { id: 7, code: 'INDF', name: 'Indofood Sukses', price: 6325, change: -75, changePercent: -1.17, ups: 42, sector: 'Consumer' },
  { id: 8, code: 'ASII', name: 'Astra International', price: 4710, change: 10, changePercent: 0.21, ups: 56, sector: 'Automotive' },
  { id: 9, code: 'UNVR', name: 'Unilever Indonesia', price: 3450, change: -20, changePercent: -0.58, ups: 29, sector: 'Consumer' },
  { id: 10, code: 'BRIS', name: 'Bank Syariah Indonesia', price: 2620, change: 80, changePercent: 3.15, ups: 78, sector: 'Finance' },
];

// ── Broker Flow ──────────────────────────────────────────────
export const mockBrokerFlow: BrokerFlowEntry[] = [
  { brokerCode: 'YP', identity: 'Whale', netValue: 15200000000, netLot: 32000, avgPrice: 4625, consistencyScore: 92, dailyHeatmap: [3, 5, 2, 8, 4, 6, 7], buyDays: 6, totalDays: 7 },
  { brokerCode: 'CC', identity: 'Whale', netValue: 8700000000, netLot: 18500, avgPrice: 4638, consistencyScore: 85, dailyHeatmap: [4, 3, 6, 2, 5, 4, 3], buyDays: 5, totalDays: 7 },
  { brokerCode: 'MG', identity: 'Bandar', netValue: -5200000000, netLot: -11000, avgPrice: 4680, consistencyScore: 71, dailyHeatmap: [-2, -4, 1, -6, -3, -5, -2], buyDays: 1, totalDays: 7 },
  { brokerCode: 'DX', identity: 'Retail', netValue: -2100000000, netLot: -4500, avgPrice: 4660, consistencyScore: 43, dailyHeatmap: [-1, 2, -3, 1, -2, -1, 0], buyDays: 2, totalDays: 7 },
  { brokerCode: 'PD', identity: 'Whale', netValue: 6300000000, netLot: 13400, avgPrice: 4615, consistencyScore: 88, dailyHeatmap: [2, 4, 3, 5, 2, 3, 4], buyDays: 7, totalDays: 7 },
];

// ── Whale Z-Score (deterministic to avoid hydration mismatch) ─
const zValues = [0.3, -0.5, 1.2, 0.8, -0.2, 2.5, 1.1, -0.9, 0.4, 1.8, -1.3, 0.6, 2.1, -0.7, 0.9, 1.5, -2.3, 0.2, 2.8, -0.1];
const zVolumes = [12e6, 8e6, 25e6, 15e6, 9e6, 42e6, 18e6, 7e6, 11e6, 30e6, 6e6, 14e6, 38e6, 10e6, 16e6, 28e6, 5e6, 13e6, 45e6, 9e6];
export const mockZScores: WhaleZScore[] = zValues.map((z, i) => ({
  date: `2026-04-${String(10 + i).padStart(2, '0')}`,
  zScore: z,
  volume: zVolumes[i],
  isAnomaly: Math.abs(z) > 2,
}));

// ── Unified Power Score ──────────────────────────────────────
export const mockUPS: UnifiedPowerScore = {
  total: 82,
  technical: 78,
  bandarmology: 91,
  volumeFlow: 85,
  sentiment: 72,
  signal: 'buy',
  confidence: 'high',
};

// ── AI Narrative ─────────────────────────────────────────────
export const mockNarrative: AINarrative = {
  summary: 'BBRI menunjukkan akumulasi konsisten oleh **Broker YP** (Whale) selama 6 dari 7 hari terakhir dengan rata-rata harga Rp 4.625. Z-Score volume berada di 2.3 (anomali positif). Pola teknikal menunjukkan **Bull Flag** pada timeframe 1H, dikonfirmasi oleh tren 4H yang masih Uptrend.',
  bullCase: 'Akumulasi solid oleh 2 Whale (YP, PD) dengan consistency >85%. Target teknikal di Rp 4.850 berdasarkan Fibonacci Extension.',
  bearCase: 'Distribusi oleh MG (Bandar) bisa menandakan One Day Trade. Jika IHSG terkoreksi >1%, sinyal ini perlu ditinjau ulang.',
  confidence: 'high',
  timestamp: '2026-04-29T09:00:00.000Z',
  keyPoints: [
    'Whale Accumulation: YP +32K lot (6/7 hari)',
    'Z-Score: 2.3 (Anomali Positif)',
    'Bull Flag 1H, Uptrend 4H',
    'Risk: MG distribusi -11K lot',
  ],
};

// ── Position Sizing ──────────────────────────────────────────
export const mockPositionSizing: PositionSizing = {
  atr: 85,
  suggestedLot: 45,
  riskPerTrade: 2500000,
  stopLoss: 4520,
  takeProfit: 4850,
  riskRewardRatio: 2.54,
  slippageBuffer: 0.75,
};

// ── Infrastructure Health ────────────────────────────────────
export const mockInfraHealth: InfraHealth = {
  engine: 'online',
  database: 'online',
  token: 'online',
  dataIntegrity: 'warning',
};

// ── Screener Results ─────────────────────────────────────────
export const mockScreenerResults: ScreenerResult[] = [
  { id: '1', code: 'ANTM', emiten: 'ANTM', name: 'Aneka Tambang', sector: 'Mining', price: 1505, change: 30, changePercent: 2.03, ups: 91, regime: 'uptrend', topBroker: 'YP', netValue: 12000000000, zScore: 2.8, hakaRatio: 0.72, signal: 'strong_buy', confidence: 'high', volume: 1000000 },
  { id: '2', code: 'ADRO', emiten: 'ADRO', name: 'Adaro Energy', sector: 'Mining', price: 2380, change: 60, changePercent: 2.59, ups: 87, regime: 'uptrend', topBroker: 'CC', netValue: 9500000000, zScore: 2.1, hakaRatio: 0.68, signal: 'buy', confidence: 'high', volume: 1000000 },
  { id: '3', code: 'BBRI', emiten: 'BBRI', name: 'Bank Rakyat Indonesia', sector: 'Finance', price: 4650, change: 50, changePercent: 1.09, ups: 82, regime: 'uptrend', topBroker: 'YP', netValue: 15200000000, zScore: 2.3, hakaRatio: 0.65, signal: 'buy', confidence: 'high', volume: 1000000 },
  { id: '4', code: 'BRIS', emiten: 'BRIS', name: 'Bank Syariah Indonesia', sector: 'Finance', price: 2620, change: 80, changePercent: 3.15, ups: 78, regime: 'uptrend', topBroker: 'PD', netValue: 6300000000, zScore: 1.9, hakaRatio: 0.61, signal: 'buy', confidence: 'medium', volume: 1000000 },
  { id: '5', code: 'GOTO', emiten: 'GOTO', name: 'GoTo Gojek Tokopedia', sector: 'Technology', price: 68, change: 3, changePercent: 4.62, ups: 74, regime: 'sideways', topBroker: 'RX', netValue: 4100000000, zScore: 1.5, hakaRatio: 0.58, signal: 'neutral', confidence: 'medium', volume: 1000000 },
];

// ── Mock Price Data for Chart (deterministic) ────────────────
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}
export const mockPriceData = Array.from({ length: 60 }, (_, i) => {
  const basePrice = 4400;
  const trend = i * 3;
  const noise = (seededRandom(i) - 0.4) * 80;
  const close = Math.round(basePrice + trend + noise);
  return {
    time: `2026-02-${String(i + 1).padStart(2, '0')}`,
    open: close - Math.floor(seededRandom(i + 100) * 40),
    high: close + Math.floor(seededRandom(i + 200) * 60),
    low: close - Math.floor(seededRandom(i + 300) * 60),
    close,
    volume: Math.floor(seededRandom(i + 400) * 30000000) + 5000000,
  };
});
