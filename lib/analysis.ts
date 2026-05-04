/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Analysis Engines
   
   Technical Indicators, Z-Score, Unified Power Score, 
   Market Regime Detection, Position Sizing
   ══════════════════════════════════════════════════════════════ */

import type {
  UnifiedPowerScore, UPSSignal, ConfidenceLevel,
  MarketRegime, PositionSizing, WhaleZScore, BrokerFlowEntry,
} from './types';

// ── Simple Moving Average ────────────────────────────────────
export function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j];
    result.push(sum / period);
  }
  return result;
}

// ── Exponential Moving Average ───────────────────────────────
export function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// ── Relative Strength Index (RSI) ────────────────────────────
export function rsi(closes: number[], period = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

// ── Average True Range (ATR) ─────────────────────────────────
export function atr(
  highs: number[], lows: number[], closes: number[], period = 14
): number[] {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return sma(trs, period);
}

// ── MACD ─────────────────────────────────────────────────────
export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

// ── Whale Z-Score Calculation ────────────────────────────────
// Per roadmap: "Using Z-Score to detect abnormal volume spikes"
export function calculateZScore(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  );
  if (std === 0) return values.map(() => 0);
  return values.map(v => (v - mean) / std);
}

export function detectVolumeAnomalies(
  volumes: number[], dates: string[], threshold = 2.0
): WhaleZScore[] {
  const zScores = calculateZScore(volumes);
  return zScores.map((z, i) => ({
    date: dates[i],
    zScore: Math.round(z * 100) / 100,
    volume: volumes[i],
    isAnomaly: Math.abs(z) > threshold,
  }));
}

// ── Beta-Weighting Analysis ──────────────────────────────────
// Calculates the Beta of a stock relative to the market
export function calculateBeta(stockCloses: number[], marketCloses: number[]): number {
  if (stockCloses.length < 2 || marketCloses.length < 2) return 1;

  // Align lengths if they differ
  const minLength = Math.min(stockCloses.length, marketCloses.length);
  const sCloses = stockCloses.slice(-minLength);
  const mCloses = marketCloses.slice(-minLength);

  const sReturns: number[] = [];
  const mReturns: number[] = [];

  // Calculate daily returns
  for (let i = 1; i < minLength; i++) {
    sReturns.push((sCloses[i] - sCloses[i - 1]) / sCloses[i - 1]);
    mReturns.push((mCloses[i] - mCloses[i - 1]) / mCloses[i - 1]);
  }

  // Calculate means
  const meanS = sReturns.reduce((a, b) => a + b, 0) / sReturns.length;
  const meanM = mReturns.reduce((a, b) => a + b, 0) / mReturns.length;

  // Calculate covariance and variance
  let covariance = 0;
  let varianceM = 0;

  for (let i = 0; i < sReturns.length; i++) {
    const sDiff = sReturns[i] - meanS;
    const mDiff = mReturns[i] - meanM;
    covariance += sDiff * mDiff;
    varianceM += mDiff * mDiff;
  }

  if (varianceM === 0) return 1;
  return covariance / varianceM;
}

// ── Market Regime Detection ──────────────────────────────────
// Per roadmap: "Smart system that knows when market is Uptrend/Downtrend/Sideways"
export function detectMarketRegime(closes: number[], period = 20): MarketRegime {
  if (closes.length < period) return 'sideways';

  const recent = closes.slice(-period);
  const smaValues = sma(recent, Math.min(10, period));
  const lastSma = smaValues[smaValues.length - 1];
  const firstSma = smaValues[0];

  const trendStrength = (lastSma - firstSma) / firstSma;

  if (trendStrength > 0.02) return 'uptrend';
  if (trendStrength < -0.02) return 'downtrend';
  return 'sideways';
}

// ── Broker Consistency Score ─────────────────────────────────
// Per roadmap: "How many days in a week a broker actively accumulates"
export function brokerConsistencyScore(buyDays: number, totalDays: number): number {
  if (totalDays === 0) return 0;
  return Math.round((buyDays / totalDays) * 100);
}

// ── Wash Sale Detection ──────────────────────────────────────
// Per roadmap: "Net Buy vs Gross Turnover check"
export function detectWashSale(
  netBuy: number, grossTurnover: number
): { isWashSale: boolean; churnRatio: number; label: string } {
  if (grossTurnover === 0) return { isWashSale: false, churnRatio: 0, label: 'No Data' };
  const churnRatio = Math.abs(netBuy) / grossTurnover;

  if (churnRatio < 0.01) {
    return { isWashSale: true, churnRatio, label: 'High Churn / Low Accumulation' };
  }
  if (churnRatio < 0.05) {
    return { isWashSale: false, churnRatio, label: 'Moderate Churn' };
  }
  return { isWashSale: false, churnRatio, label: 'Healthy Accumulation' };
}

// ── Unified Power Score (UPS) ────────────────────────────────
// Per roadmap: "Combines technical, volume, bandarmology into single 0-100 score"
export function calculateUPS(params: {
  rsiValue: number;
  macdHistogram: number;
  trendDirection: MarketRegime;
  whaleNetValue: number;
  brokerConsistency: number;
  zScore: number;
  hakaRatio: number; // HAKA / (HAKA + HAKI)
}): UnifiedPowerScore {
  // Technical Score (0-100)
  // RSI 30-70 mapping, MACD trend
  let techScore = 50;
  if (params.rsiValue < 30) techScore += 25; // Oversold = bullish
  else if (params.rsiValue > 70) techScore -= 25; // Overbought = bearish
  else techScore += (50 - params.rsiValue) * 0.5;

  if (params.macdHistogram > 0) techScore += 15;
  else techScore -= 15;

  if (params.trendDirection === 'uptrend') techScore += 10;
  else if (params.trendDirection === 'downtrend') techScore -= 10;

  techScore = Math.max(0, Math.min(100, techScore));

  // Bandarmology Score (0-100)
  let bandarScore = 50;
  if (params.whaleNetValue > 0) bandarScore += Math.min(30, params.whaleNetValue / 1e9 * 3);
  else bandarScore -= Math.min(30, Math.abs(params.whaleNetValue) / 1e9 * 3);

  bandarScore += (params.brokerConsistency - 50) * 0.4;
  bandarScore = Math.max(0, Math.min(100, bandarScore));

  // Volume Flow Score (0-100)
  let volumeScore = 50;
  if (params.zScore > 2) volumeScore += 30;
  else if (params.zScore > 1) volumeScore += 15;
  else if (params.zScore < -1) volumeScore -= 15;

  volumeScore += (params.hakaRatio - 0.5) * 60; // HAKA dominance
  volumeScore = Math.max(0, Math.min(100, volumeScore));

  // Sentiment placeholder
  const sentimentScore = 50;

  // Weighted Total
  const total = Math.round(
    techScore * 0.25 +
    bandarScore * 0.35 +
    volumeScore * 0.25 +
    sentimentScore * 0.15
  );

  // Signal mapping
  let signal: UPSSignal = 'neutral';
  if (total >= 80) signal = 'strong_buy';
  else if (total >= 60) signal = 'buy';
  else if (total <= 20) signal = 'strong_sell';
  else if (total <= 40) signal = 'sell';

  // Confidence based on data quality
  let confidence: ConfidenceLevel = 'medium';
  if (params.brokerConsistency >= 70 && Math.abs(params.zScore) > 1.5) confidence = 'high';
  else if (params.brokerConsistency < 40) confidence = 'low';

  return {
    total,
    technical: Math.round(techScore),
    bandarmology: Math.round(bandarScore),
    volumeFlow: Math.round(volumeScore),
    sentiment: sentimentScore,
    signal,
    confidence,
  };
}

// ── Volatility-Adjusted Position Sizing ──────────────────────
// Per roadmap: "Calculate how volatile stock is (ATR) and recommend max lots"
export function calculatePositionSize(params: {
  currentPrice: number;
  atrValue: number;
  portfolioSize: number;
  riskPercent?: number; // default 2%
  slippagePercent?: number; // default 0.75% per roadmap
}): PositionSizing {
  const riskPct = params.riskPercent ?? 2;
  const slippage = params.slippagePercent ?? 0.75;
  const riskPerTrade = params.portfolioSize * (riskPct / 100);

  // Stop loss at 2x ATR below entry
  const stopDistance = params.atrValue * 2;
  const stopLoss = Math.round(params.currentPrice - stopDistance);

  // Take profit at 3x ATR above entry (1.5 R:R)
  const tpDistance = params.atrValue * 3;
  const takeProfit = Math.round(params.currentPrice + tpDistance);

  // Max lots based on risk
  const riskPerLot = stopDistance * 100; // 1 lot = 100 shares
  const suggestedLot = Math.floor(riskPerTrade / riskPerLot);

  const rrRatio = tpDistance / stopDistance;

  return {
    atr: Math.round(params.atrValue),
    suggestedLot: Math.max(1, suggestedLot),
    riskPerTrade: Math.round(riskPerTrade),
    stopLoss,
    takeProfit,
    riskRewardRatio: Math.round(rrRatio * 100) / 100,
    slippageBuffer: slippage,
  };
}

// ── Rate of Change Kill-Switch ───────────────────────────────
// Per roadmap: "If price drops >X% in <5 min, kill all buy signals"
export function checkRoCKillSwitch(
  priceHistory: { time: string; price: number }[],
  thresholdPercent = 5,
  windowMinutes = 5
): { triggered: boolean; dropPercent: number } {
  if (priceHistory.length < 2) return { triggered: false, dropPercent: 0 };

  const latest = priceHistory[priceHistory.length - 1];
  const windowStart = new Date(latest.time).getTime() - windowMinutes * 60 * 1000;

  const pricesInWindow = priceHistory.filter(
    p => new Date(p.time).getTime() >= windowStart
  );

  if (pricesInWindow.length < 2) return { triggered: false, dropPercent: 0 };

  const maxPrice = Math.max(...pricesInWindow.map(p => p.price));
  const dropPercent = ((maxPrice - latest.price) / maxPrice) * 100;

  return {
    triggered: dropPercent >= thresholdPercent,
    dropPercent: Math.round(dropPercent * 100) / 100,
  };
}

// ── Global Correlation Kill-Switch ───────────────────────────
// Per roadmap: "If IHSG drops >1.5% in one session, raise UPS threshold"
export function adjustUPSThreshold(
  ihsgChangePercent: number,
  baseThreshold = 70
): number {
  if (ihsgChangePercent <= -1.5) return 90;
  if (ihsgChangePercent <= -1.0) return 80;
  return baseThreshold;
}

// ── Multi-Timeframe Validation ───────────────────────────────
// Per roadmap: "Signal must be confirmed by higher timeframe"
export function multiTimeframeValidation(signals: {
  timeframe: string;
  signal: 'bullish' | 'bearish' | 'neutral';
}[]): { isValid: boolean; consensus: string } {
  const bullish = signals.filter(s => s.signal === 'bullish').length;
  const bearish = signals.filter(s => s.signal === 'bearish').length;
  const total = signals.length;

  if (bullish >= Math.ceil(total * 0.66)) {
    return { isValid: true, consensus: 'BULLISH CONSENSUS' };
  }
  if (bearish >= Math.ceil(total * 0.66)) {
    return { isValid: true, consensus: 'BEARISH CONSENSUS' };
  }
  return { isValid: false, consensus: 'MARKET CONFUSION - STAND ASIDE' };
}
