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

// ── Volume-Profile Divergence (Upper Shadow Alert) ───────────
// Per roadmap: "Jika volume terbesar terjadi di harga atas (Upper Shadow),
// tapi Dellmology mencatat 'Net Buy', berikan label 'Late Entry Warning'."
export function detectUpperShadowDivergence(params: {
  open: number;
  high: number;
  low: number;
  close: number;
  netBuy: number;
}): { alert: boolean; label: string; upperShadowPct: number } {
  const { open, high, low, close, netBuy } = params;
  const totalRange = high - low;
  if (totalRange <= 0) return { alert: false, label: 'No Range', upperShadowPct: 0 };

  // Upper shadow = distance from max(open, close) to high
  const bodyTop = Math.max(open, close);
  const upperShadow = high - bodyTop;
  const upperShadowPct = (upperShadow / totalRange) * 100;

  // Alert: Upper shadow > 60% of total range AND net buy is positive
  // This means institutions finished accumulating and retail is buying at the top
  if (upperShadowPct > 60 && netBuy > 0) {
    return {
      alert: true,
      label: 'Late Entry Warning',
      upperShadowPct: Math.round(upperShadowPct),
    };
  }

  return {
    alert: false,
    label: upperShadowPct > 40 ? 'Elevated Shadow' : 'Normal',
    upperShadowPct: Math.round(upperShadowPct),
  };
}

// ── Market-Wide Concentration Ratio (Artificial Liquidity) ───
// Per roadmap: "Jika akumulasi hanya dilakukan oleh 1 broker sementara
// 50 broker lainnya jualan, berikan label 'Artificial Liquidity Warning'."
export function detectConcentrationAnomaly(brokers: {
  code: string;
  netValue: number;
}[]): {
  warning: boolean;
  ratio: number;
  topBrokerCode: string;
  opposingBrokerCount: number;
  label: string;
} {
  if (brokers.length === 0) {
    return { warning: false, ratio: 0, topBrokerCode: '', opposingBrokerCount: 0, label: 'No Data' };
  }

  // Sort by absolute net value descending
  const sorted = [...brokers].sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));
  const topBroker = sorted[0];
  const totalAbsValue = sorted.reduce((sum, b) => sum + Math.abs(b.netValue), 0);

  if (totalAbsValue === 0) {
    return { warning: false, ratio: 0, topBrokerCode: topBroker.code, opposingBrokerCount: 0, label: 'No Activity' };
  }

  const ratio = Math.abs(topBroker.netValue) / totalAbsValue;

  // Count brokers going in the OPPOSITE direction of the top broker
  const topDirection = topBroker.netValue >= 0 ? 'buy' : 'sell';
  const opposingBrokerCount = sorted.filter(b => {
    if (b.code === topBroker.code) return false;
    return topDirection === 'buy' ? b.netValue < 0 : b.netValue > 0;
  }).length;

  // Warning if top broker dominates > 50% AND > 3 brokers are going opposite direction
  const warning = ratio > 0.5 && opposingBrokerCount >= 3;

  let label = 'Healthy Distribution';
  if (warning) {
    label = 'Artificial Liquidity Warning';
  } else if (ratio > 0.5) {
    label = 'High Concentration';
  } else if (ratio > 0.3) {
    label = 'Moderate Concentration';
  }

  return {
    warning,
    ratio: parseFloat(ratio.toFixed(2)),
    topBrokerCode: topBroker.code,
    opposingBrokerCount,
    label,
  };
}

// ── Iceberg Order Detection (Stealth Accumulation) ───────────
// Detects when a broker is buying in many small lots repeatedly
// instead of one large order — classic institutional tactic.
export function detectIcebergOrder(brokers: {
  code: string;
  netValue: number;
  bfreq?: number;  // buy frequency (number of transactions)
  blot?: number;   // total buy lots
  sfreq?: number;  // sell frequency
  slot?: number;   // total sell lots
}[]): {
  detected: boolean;
  brokerCode: string;
  avgLotPerTx: number;
  frequency: number;
  label: string;
} {
  if (!brokers || brokers.length === 0) {
    return { detected: false, brokerCode: '', avgLotPerTx: 0, frequency: 0, label: 'No Data' };
  }

  for (const b of brokers) {
    const freq = b.bfreq || 0;
    const lots = b.blot || 0;

    // Iceberg pattern: high frequency (>30 txs) but small avg lot per tx (<20 lots)
    // AND net value is positive (accumulating)
    if (freq >= 30 && lots > 0 && b.netValue > 0) {
      const avgLot = lots / freq;
      if (avgLot < 20) {
        return {
          detected: true,
          brokerCode: b.code,
          avgLotPerTx: Math.round(avgLot * 10) / 10,
          frequency: freq,
          label: `Stealth Accumulation by ${b.code}`,
        };
      }
    }
  }

  return { detected: false, brokerCode: '', avgLotPerTx: 0, frequency: 0, label: 'Normal' };
}

// ── Money Flow Index (MFI) ───────────────────────────────────
// Volume-weighted RSI: combines price AND volume to detect
// overbought/oversold with money flow confirmation.
// Returns 0-100. >80 = overbought, <20 = oversold.
export function calculateMFI(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period = 14
): number {
  if (highs.length < period + 1) return 50; // neutral fallback

  const typicalPrices: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
  }

  // Raw Money Flow = Typical Price × Volume
  const rawMoneyFlows = typicalPrices.map((tp, i) => tp * volumes[i]);

  // Separate positive and negative money flows
  let posFlow = 0;
  let negFlow = 0;

  const start = rawMoneyFlows.length - period;
  for (let i = start; i < rawMoneyFlows.length; i++) {
    if (i < 1) continue;
    if (typicalPrices[i] > typicalPrices[i - 1]) {
      posFlow += rawMoneyFlows[i];
    } else if (typicalPrices[i] < typicalPrices[i - 1]) {
      negFlow += rawMoneyFlows[i];
    }
    // Equal typical prices are ignored
  }

  if (negFlow === 0) return 100;
  const moneyFlowRatio = posFlow / negFlow;
  const mfi = 100 - 100 / (1 + moneyFlowRatio);

  return Math.round(mfi * 100) / 100;
}

// ── MFI + Sentiment Fusion ───────────────────────────────────
// Combines MFI with stream sentiment score to produce a unified
// sentiment component for UPS (replaces the hardcoded 50).
export function fuseSentimentMFI(
  mfiValue: number,
  streamSentimentScore: number // -100 to +100 from sentiment.ts
): {
  fusedScore: number;     // 0-100 for UPS
  label: string;
  divergence: boolean;
} {
  // Normalize MFI (0-100) to sentiment (0-100)
  // MFI > 50 = bullish money flow, < 50 = bearish
  const mfiNormalized = mfiValue; // already 0-100

  // Normalize stream sentiment (-100 to +100) to (0-100)
  const sentimentNormalized = (streamSentimentScore + 100) / 2;

  // Weighted fusion: MFI 60% (hard data), Sentiment 40% (soft data)
  const fusedScore = Math.round(mfiNormalized * 0.6 + sentimentNormalized * 0.4);

  // Detect divergence: MFI says overbought but retail still euphoric
  let divergence = false;
  let label = 'Normal';

  if (mfiValue > 80 && streamSentimentScore > 30) {
    divergence = true;
    label = 'Distribution Imminent — MFI Overbought + Retail Euphoria';
  } else if (mfiValue < 20 && streamSentimentScore < -30) {
    divergence = true;
    label = 'Accumulation Window — MFI Oversold + Retail Panic';
  } else if (mfiValue > 70) {
    label = 'Overbought Zone';
  } else if (mfiValue < 30) {
    label = 'Oversold Zone';
  }

  return { fusedScore: Math.max(0, Math.min(100, fusedScore)), label, divergence };
}

// ── Broker Flow Matrix (Bipartite Distribution) ──────────────
// Calculates proportional flow between Top Sellers and Top Buyers
// assuming liquidity is shared proportionally among top players.
export interface FlowLink {
  source: string;
  sourceType: string;
  target: string;
  targetType: string;
  value: number;
}

export function calculateBrokerFlowMatrix(
  sellers: { code: string; type: string; netValue: number }[],
  buyers: { code: string; type: string; netValue: number }[]
): FlowLink[] {
  if (!sellers.length || !buyers.length) return [];

  // Sellers have negative netValue, buyers have positive.
  // We work with absolute values for volume transfer.
  const totalSell = sellers.reduce((s, b) => s + Math.abs(b.netValue), 0);
  const totalBuy = buyers.reduce((s, b) => s + Math.abs(b.netValue), 0);
  
  if (totalSell === 0 || totalBuy === 0) return [];

  // Normalization: total flow transferred is the minimum of the two totals
  // (since we only look at top 5, they rarely match exactly)
  const totalFlow = Math.min(totalSell, totalBuy);
  const links: FlowLink[] = [];

  sellers.forEach(seller => {
    const sVol = Math.abs(seller.netValue);
    // Proportion of this seller's volume relative to the matched total flow
    const sRatio = sVol / totalSell; 
    const effectiveSVol = totalFlow * sRatio;

    buyers.forEach(buyer => {
      const bVol = Math.abs(buyer.netValue);
      // Proportion of this buyer's volume relative to the matched total flow
      const bRatio = bVol / totalBuy;
      
      // Proportional matching: How much of seller's volume goes to this buyer?
      // Simple cross multiplication probability.
      const transferredValue = effectiveSVol * bRatio;

      if (transferredValue > 1000) { // filter out noise
        links.push({
          source: seller.code,
          sourceType: seller.type,
          target: buyer.code,
          targetType: buyer.type,
          value: Math.round(transferredValue)
        });
      }
    });
  });

  return links.sort((a, b) => b.value - a.value);
}
