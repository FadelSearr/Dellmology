import { NextRequest, NextResponse } from 'next/server';
import { fetchWatchlistGroups, fetchWatchlist, fetchMarketDetector } from '@/lib/stockbit';
import { IDX_TICKERS } from '@/lib/idx-tickers';
import { getBrokerProfile } from '@/lib/broker-profiles';
import { rateLimit } from '@/lib/rateLimit';
import { calculateFibonacciLevels, atr } from '@/lib/analysis';
import { getPrices } from '@/lib/price-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ══════════════════════════════════════════════════════════════
   Screener Engine — Dellmology Pro
   
   Data source: Yahoo Finance (public, no token needed)
   - Provides 6-month OHLCV for all IDX tickers ({code}.JK)
   - Cached in-memory for 5 minutes per ticker
   - Computed indicators: MA20, MA50, RSI14, VolumeRatio, Value
   
   DAYTRADE — "The Volatility Hunter":
   - Volume Ratio ≥ 2x (vs 20-day avg) — big money entering
   - Change% between +3% and +10% — already moving, not overbought
   - Transaction value ≥ Rp 5 Billion — liquid enough to trade
   - Price above VWAP (typical price) — buyers in control
   
   SWING — "The Trend Navigator":  
   - Close > MA20 > MA50 (uptrend structure)
   - RSI 14-day between 50–65 (momentum building, not overbought)
   - MA20 > MA50 (Golden Cross confirmation)
   ══════════════════════════════════════════════════════════════ */

// ── In-memory cache (per process, 5-min TTL) ─────────────────
interface OHLCVBar {
  date: number;   // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}


interface TechnicalAnalysis {
  score: number;
  verdict: 'BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID';
  groups: Partial<Record<'volume' | 'volatility' | 'trend' | 'momentum', IndicatorRow[]>>;
}

interface ScreenerResult {
  id: string;
  code: string;
  emiten: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  valueBillion: number;
  inWatchlist: boolean;
  dayScore: number;
  swingScore: number;
  volumeRatio: number;
  ma20: number;
  ma50: number;
  rsi14: number;
  technicalAnalysis: TechnicalAnalysis | null;
  // Day trade specific
  aboveVWAP?: boolean;
  aboveMA5?: boolean;
  intradayRange?: number;
  entry?: number;
  tp?: number;
  sl?: number;
  entry_strategy?: string;
  // Swing specific
  volumeExpansion?: number;
  maSpreadPct?: number;
  distFromMA20pct?: number;
  goldenCross?: boolean;
  fibNearest?: number | null;
  fibDistancePct?: number | null;
  fibBouncing?: boolean;
  // Whale specific
  whaleScore?: number;
  whaleBroker?: string;
  bandarSignal?: string;
  smartMoneyLot?: number;
  topBuyers?: { broker: string; name: string; lot: number }[];
  topSellers?: { broker: string; name: string; lot: number }[];
  foreignStatus?: string;
  foreignNetVal?: number;
  foreignNetLot?: number;
  foreignParticipation?: number;
  // AI specific
  aiScore?: number;
  aiReason?: string;
}

const PRICE_CACHE = new Map<string, { bars: OHLCVBar[]; ts: number }>();
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

// ── Fetch OHLCV from Yahoo Finance ───────────────────────────
async function fetchYahooOHLCV(ticker: string): Promise<OHLCVBar[]> {
  const cached = PRICE_CACHE.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.bars;

  try {
    const symbol = `${ticker}.JK`;
    const url    = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
    const res    = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal:  AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data   = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp || [];
    const q          = result.indicators.quote[0];

    const bars: OHLCVBar[] = timestamps
      .map((ts: number, i: number) => ({
        date:   ts,
        open:   q.open[i]   ?? 0,
        high:   q.high[i]   ?? 0,
        low:    q.low[i]    ?? 0,
        close:  q.close[i]  ?? 0,
        volume: q.volume[i] ?? 0,
      }))
      .filter((b: OHLCVBar) => b.close > 0 && b.open > 0);

    PRICE_CACHE.set(ticker, { bars, ts: Date.now() });
    return bars;
  } catch {
    return [];
  }
}

// ── Batch fetch with concurrency control ─────────────────────
async function fetchBatch(tickers: string[], concurrency = 25): Promise<Map<string, OHLCVBar[]>> {
  const result = new Map<string, OHLCVBar[]>();
  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async ticker => {
        const bars = await fetchYahooOHLCV(ticker);
        if (bars.length > 0) result.set(ticker, bars);
      })
    );
  }
  return result;
}

// ── Technical Indicators ─────────────────────────────────────
function computeMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

type IndicatorSignal = 'Bullish' | 'Neutral' | 'Bearish' | 'Strong';
type IndicatorRow = { name: string; value: string; signal: IndicatorSignal; note: string };

function last(values: number[], fallback = 0) {
  return values.length ? values[values.length - 1] : fallback;
}

function computeEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  return values.reduce((ema, value, i) => i === 0 ? value : value * k + ema * (1 - k), values[0]);
}

function moneyFlowIndex(bars: OHLCVBar[], period = 14): number {
  if (bars.length < period + 1) return 50;
  let pos = 0, neg = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const prevTp = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
    const flow = tp * bars[i].volume;
    if (tp >= prevTp) pos += flow; else neg += flow;
  }
  if (neg === 0) return 100;
  return 100 - 100 / (1 + pos / neg);
}

function onBalanceVolume(bars: OHLCVBar[]): number {
  return bars.slice(1).reduce((obv, b, i) => obv + (b.close > bars[i].close ? b.volume : b.close < bars[i].close ? -b.volume : 0), 0);
}

function chaikinMoneyFlow(bars: OHLCVBar[], period = 20): number {
  const slice = bars.slice(-period);
  const vol = slice.reduce((s, b) => s + b.volume, 0);
  if (!vol) return 0;
  const mfv = slice.reduce((s, b) => {
    const range = b.high - b.low;
    const mfm = range === 0 ? 0 : ((b.close - b.low) - (b.high - b.close)) / range;
    return s + mfm * b.volume;
  }, 0);
  return mfv / vol;
}

function stochasticK(bars: OHLCVBar[], period = 14): number {
  const slice = bars.slice(-period);
  if (slice.length < period) return 50;
  const high = Math.max(...slice.map(b => b.high));
  const low = Math.min(...slice.map(b => b.low));
  return high === low ? 50 : ((last(slice.map(b => b.close)) - low) / (high - low)) * 100;
}

function buildTechnicalAnalysis(bars: OHLCVBar[]) {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const price = last(closes);
  const ma20 = computeMA(closes, 20);
  const ma50 = computeMA(closes, 50);
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macd = ema12 - ema26;
  const rsi = computeRSI(closes, 14);
  const mfi = moneyFlowIndex(bars);
  const obvNow = onBalanceVolume(bars);
  const obvPrev = onBalanceVolume(bars.slice(0, -5));
  const cmf = chaikinMoneyFlow(bars);
  const vwap = bars.slice(-20).reduce((s, b) => s + ((b.high + b.low + b.close) / 3) * b.volume, 0) / Math.max(1, bars.slice(-20).reduce((s, b) => s + b.volume, 0));
  const atr14 = last(atr(highs, lows, closes, 14), price * 0.02);
  const atrPct = price ? (atr14 / price) * 100 : 0;
  const bbMid = ma20;
  const bbStd = Math.sqrt(closes.slice(-20).reduce((s, c) => s + Math.pow(c - bbMid, 2), 0) / 20);
  const bbHigh = bbMid + bbStd * 2;
  const bbLow = bbMid - bbStd * 2;
  const bbPct = bbHigh === bbLow ? 50 : ((price - bbLow) / (bbHigh - bbLow)) * 100;
  const bbWidth = price ? ((bbHigh - bbLow) / price) * 100 : 0;
  const roc = closes.length > 12 && closes[closes.length - 13] ? ((price - closes[closes.length - 13]) / closes[closes.length - 13]) * 100 : 0;
  const stoch = stochasticK(bars);
  const williams = stoch - 100;
  const rows = {
    volume: [
      { name: 'MFI', value: mfi.toFixed(1), signal: mfi > 80 ? 'Bearish' : mfi >= 55 ? 'Bullish' : mfi < 20 ? 'Bullish' : 'Neutral', note: mfi >= 55 ? 'buying pressure dominan' : 'flow belum kuat' },
      { name: 'OBV', value: obvNow > obvPrev ? 'Rising' : 'Falling', signal: obvNow > obvPrev ? 'Bullish' : 'Bearish', note: 'volume mengikuti arah harga' },
      { name: 'CMF', value: cmf.toFixed(2), signal: cmf > 0.05 ? 'Bullish' : cmf < -0.05 ? 'Bearish' : 'Neutral', note: 'akumulasi/distribusi 20 hari' },
      { name: 'VWAP', value: price >= vwap ? 'Above' : 'Below', signal: price >= vwap ? 'Bullish' : 'Bearish', note: 'posisi harga vs average traded price' },
    ],
    volatility: [
      { name: 'ATR %', value: `${atrPct.toFixed(1)}%`, signal: atrPct > 7 ? 'Bearish' : atrPct > 3 ? 'Neutral' : 'Bullish', note: 'risiko range harian' },
      { name: 'BB %B', value: bbPct.toFixed(0), signal: bbPct > 90 ? 'Bearish' : bbPct > 50 ? 'Bullish' : 'Neutral', note: 'posisi harga dalam Bollinger Band' },
      { name: 'BB Width', value: `${bbWidth.toFixed(1)}%`, signal: bbWidth > 12 ? 'Strong' : 'Neutral', note: 'ekspansi/kompresi volatilitas' },
    ],
    trend: [
      { name: 'SMA20/50', value: price > ma20 && ma20 > ma50 ? 'Uptrend' : price < ma20 ? 'Downtrend' : 'Mixed', signal: price > ma20 && ma20 > ma50 ? 'Bullish' : price < ma20 ? 'Bearish' : 'Neutral', note: 'struktur trend utama' },
      { name: 'EMA12/26', value: ema12 > ema26 ? 'Bullish cross' : 'Bearish cross', signal: ema12 > ema26 ? 'Bullish' : 'Bearish', note: 'trend cepat' },
      { name: 'MACD', value: macd.toFixed(2), signal: macd > 0 ? 'Bullish' : macd < 0 ? 'Bearish' : 'Neutral', note: 'momentum trend' },
    ],
    momentum: [
      { name: 'RSI', value: rsi.toFixed(1), signal: rsi > 70 ? 'Bearish' : rsi >= 50 ? 'Bullish' : rsi < 30 ? 'Bullish' : 'Neutral', note: 'momentum sehat vs jenuh' },
      { name: 'Stochastic', value: stoch.toFixed(1), signal: stoch > 80 ? 'Bearish' : stoch >= 50 ? 'Bullish' : 'Neutral', note: 'momentum jangka pendek' },
      { name: 'ROC', value: `${roc.toFixed(1)}%`, signal: roc > 2 ? 'Bullish' : roc < -2 ? 'Bearish' : 'Neutral', note: 'rate of change 12 hari' },
      { name: 'Williams %R', value: williams.toFixed(1), signal: williams > -20 ? 'Bearish' : williams < -80 ? 'Bullish' : 'Neutral', note: 'reversal pressure' },
    ],
  } satisfies Record<string, IndicatorRow[]>;
  const flat = Object.values(rows).flat();
  const raw = flat.reduce((s, r) => s + (r.signal === 'Bullish' || r.signal === 'Strong' ? 1 : r.signal === 'Bearish' ? -1 : 0), 0);
  const score = Math.round(((raw + flat.length) / (flat.length * 2)) * 100);
  const verdict = score >= 70 ? 'BUY' : score >= 58 ? 'WATCH' : score >= 45 ? 'NEUTRAL' : 'AVOID';
  // ponytail: tambah ADX/Ichimoku/PSAR jika panel memang butuh 43 indikator penuh.
  return { score, verdict: verdict as TechnicalAnalysis['verdict'], groups: rows };
}

// ── Day Trade Screener — "The Volatility Hunter" (Revised) ───
// Inspired by Stockbit screener + enhanced with intraday analysis
//
// Rules (from User Specification):
// 1. Price >= 100
// 2. Volume MA 5 > 10,000,000
// 3. Value MA 5 > 1,000,000,000
// 4. Price Change >= 2%
// 5. 1 Day Volume Change >= 30%
// 6. Price < 1000
//
// Scoring (100 pts max):
// - Volume Change (30 pts)
// - Price Momentum (25 pts)
// - Value Liquidity (20 pts)
// - Intraday Range (15 pts)
// - VWAP Position (10 pts)
// ──────────────────────────────────────────────────────────────
function screenDayTrade(ticker: string, bars: OHLCVBar[], minPrice: number, maxPrice: number) {
  if (bars.length < 5) return null;

  const today     = bars[bars.length - 1];
  const yesterday = bars[bars.length - 2];
  const closes    = bars.map(b => b.close);
  const volumes   = bars.map(b => b.volume);

  const currentPrice    = today.close;
  const currentVolume   = today.volume;
  const changePercent   = yesterday.close > 0
    ? ((currentPrice - yesterday.close) / yesterday.close) * 100
    : 0;

  // ── Volume Analysis ────────────────────────────────────────
  const yesterdayVolume = yesterday.volume;
  const volumeChangePercent = yesterdayVolume > 0 
    ? ((currentVolume - yesterdayVolume) / yesterdayVolume) * 100 
    : 0;

  // Volume MA5
  const volumeMA5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;

  // ── Transaction Value ──────────────────────────────────────
  const valueBillion    = (currentPrice * currentVolume) / 1e9;
  
  // Value MA 5
  const valueMA5 = bars.slice(-5).reduce((acc, b) => acc + (b.close * b.volume), 0) / 5;

  // ── Intraday Range ─────────────────────────────────────────
  const intradayRange   = today.high > 0 ? ((today.high - today.low) / today.low) * 100 : 0;

  // ── VWAP proxy: typical price = (H + L + C) / 3 ───────────
  const typicalPrice    = (today.high + today.low + today.close) / 3;
  const aboveVWAP       = currentPrice >= typicalPrice;

  // ── MA5 (short-term momentum) ──────────────────────────────
  const ma5 = computeMA(closes, 5);
  const aboveMA5 = currentPrice >= ma5;

  // ── Price filter ───────────────────────────────────────────
  if (currentPrice < minPrice || currentPrice > maxPrice) return null;

  // ════════════════════════════════════════════════════════════
  //  APPLY SCREENING CRITERIA
  // ════════════════════════════════════════════════════════════

  // Rule 1: Price >= 100
  if (currentPrice < 100) return null;

  // Rule 2: Volume MA 5 > 10,000,000
  if (volumeMA5 <= 10_000_000) return null;

  // Rule 3: Value MA 5 > 1,000,000,000
  if (valueMA5 <= 1_000_000_000) return null;

  // Rule 4: Price Change >= 2
  if (changePercent < 2) return null;

  // Rule 5: 1 Day Volume Change >= 30
  if (volumeChangePercent < 30) return null;

  // Rule 6: Price <= maxPrice
  if (currentPrice > maxPrice) return null;

  // ════════════════════════════════════════════════════════════
  //  SCORING — higher = better day trade candidate
  // ════════════════════════════════════════════════════════════

  // 1. Volume Change (max 30 pts)
  const volScore = Math.min(30, Math.round((volumeChangePercent - 30) * 0.5));

  // 2. Price Momentum (max 25 pts)
  const momentumScore = Math.min(25, Math.round(changePercent * 3));

  // 3. Intraday Range (max 15 pts)
  const rangeScore = Math.min(15, Math.round(intradayRange * 2));

  // 4. Value Liquidity (max 20 pts)
  const liquidityScore = Math.min(20, Math.round(Math.log10(valueBillion) * 8));

  // 5. VWAP Position (max 10 pts)
  const vwapScore = aboveVWAP ? 10 : 0;

  const dayScore = Math.max(0, Math.round(volScore + momentumScore + rangeScore + liquidityScore + vwapScore));

  // ── Smart Entry Strategy (ATR) ─────────────────────────────
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const atrVals = atr(highs, lows, closes, 14);
  const atr14 = atrVals.length > 0 ? Math.round(atrVals[atrVals.length - 1]) : Math.round(currentPrice * 0.02);
  
  const entry = currentPrice; 
  const sl = Math.max(1, Math.round(currentPrice - atr14 * 1.5));
  const tp = Math.round(currentPrice + atr14 * 3);
  const entry_strategy = `Momentum Buy di area Rp ${entry.toLocaleString('id-ID')}.\nKetat SL di Rp ${sl.toLocaleString('id-ID')} (-1.5 ATR) karena volatilitas harian tinggi.\nTake Profit bertahap mulai Rp ${tp.toLocaleString('id-ID')} (3 ATR).`;

  return {
    code:           ticker,
    price:          currentPrice,
    change:         currentPrice - yesterday.close,
    changePercent:  parseFloat(changePercent.toFixed(2)),
    volume:         currentVolume,
    volumeRatio:    parseFloat((volumeChangePercent / 100).toFixed(2)), // Reusing field for UI
    volumeMA5Ratio: 0,
    valueBillion:   parseFloat(valueBillion.toFixed(1)),
    intradayRange:  parseFloat(intradayRange.toFixed(2)),
    aboveVWAP,
    aboveMA5,
    dayScore,
    entry, tp, sl, entry_strategy,
    technicalAnalysis: buildTechnicalAnalysis(bars),
  };
}

// ── Swing Screener — "The Trend Navigator" (Revised) ─────────
// Inspired by Stockbit screener + enhanced with smart pullback detection
//
// Rules (from User Specification):
// 1. Volume > 50,000
// 2. Value > 5,000,000
// 3. Price > 100
// 4. Price < 1000
// 5. Price MA 5 > 1 x Price MA 20
// 6. Value MA 5 > 1.2 x Value MA 20
//
// Scoring (100 pts max):
// - RSI Sweet Spot (30 pts)
// - Pullback Proximity (25 pts)
// - Volume Expansion (20 pts)
// - MA Structure (15 pts)
// - Trend Slope (10 pts)
// ──────────────────────────────────────────────────────────────
function screenSwing(ticker: string, bars: OHLCVBar[], minPrice: number, maxPrice: number) {
  if (bars.length < 25) return null;

  const today     = bars[bars.length - 1];
  const yesterday = bars[bars.length - 2];
  const closes    = bars.map(b => b.close);
  const volumes   = bars.map(b => b.volume);

  const currentPrice  = today.close;
  const changePercent = yesterday.close > 0
    ? ((currentPrice - yesterday.close) / yesterday.close) * 100
    : 0;

  // ── Fibonacci ──────────────────────────────────────────────
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const fib = calculateFibonacciLevels(highs, lows, currentPrice, 60);

  // ── Moving Averages ────────────────────────────────────────
  const ma5  = computeMA(closes, 5);
  const ma20 = computeMA(closes, 20);
  const ma50 = closes.length >= 50 ? computeMA(closes, 50) : 0;

  // ── MA20 Slope (trend direction) ───────────────────────────
  // Compare MA20 today vs MA20 5 days ago
  const ma20_5daysAgo = closes.length >= 25
    ? closes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20
    : ma20;
  const ma20Slope = ma20 - ma20_5daysAgo; // positive = uptrend

  // ── Volume Analysis ────────────────────────────────────────
  const volumeMA5  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeMA20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeExpansion = volumeMA20 > 0 ? volumeMA5 / volumeMA20 : 0;

  // ── Transaction Value ──────────────────────────────────────
  const currentVolume = today.volume;
  const value         = currentPrice * currentVolume;
  const valueBillion  = value / 1e9;
  
  const valueMA5 = bars.slice(-5).reduce((acc, b) => acc + (b.close * b.volume), 0) / 5;
  const valueMA20 = bars.slice(-20).reduce((acc, b) => acc + (b.close * b.volume), 0) / 20;

  // ── RSI ────────────────────────────────────────────────────
  const rsi14 = computeRSI(closes, 14);

  // ── Pullback distance from MA20 ────────────────────────────
  const distFromMA20pct = ((currentPrice - ma20) / ma20) * 100;

  // ── Price filter ───────────────────────────────────────────
  if (currentPrice < minPrice || currentPrice > maxPrice) return null;

  // ════════════════════════════════════════════════════════════
  //  APPLY SCREENING CRITERIA
  // ════════════════════════════════════════════════════════════

  // Rule 1: Volume > 50,000
  if (currentVolume <= 50_000) return null;

  // Rule 2: Value > 5,000,000
  if (value <= 5_000_000) return null;

  // Rule 3: Price >= 100
  if (currentPrice < 100) return null;

  // Rule 4: Price <= maxPrice
  if (currentPrice > maxPrice) return null;

  // Rule 5: Price MA 5 > 1 x Price MA 20
  if (ma5 <= ma20) return null;

  // Rule 6: Value MA 5 > 1.2 x Value MA 20
  if (valueMA5 <= 1.2 * valueMA20) return null;

  // ════════════════════════════════════════════════════════════
  //  SCORING — higher = better swing entry
  // ════════════════════════════════════════════════════════════

  // 1. RSI Sweet Spot (max 30 pts) — ideal entry around RSI 50-58
  const rsiOptimal = 55;
  const rsiScore = Math.max(0, 30 - Math.abs(rsi14 - rsiOptimal) * 2);

  // 2. Pullback Proximity (max 25 pts) — best when 1-5% above MA20
  //    Too close (0%) = just touching, risky. Too far (>10%) = extended
  let pullbackScore = 0;
  if (distFromMA20pct >= 1 && distFromMA20pct <= 5) {
    pullbackScore = 25; // Perfect entry zone
  } else if (distFromMA20pct > 5 && distFromMA20pct <= 10) {
    pullbackScore = Math.round(25 - (distFromMA20pct - 5) * 3); // Decay
  } else if (distFromMA20pct > 0 && distFromMA20pct < 1) {
    pullbackScore = 15; // Close but risky
  }

  // 3. Volume Expansion (max 20 pts) — more expansion = more conviction
  const volScore = Math.min(20, Math.round((volumeExpansion - 1) * 20));

  // 4. MA Structure (max 15 pts) — Golden Cross bonus
  let maScore = 0;
  if (ma50 > 0 && ma20 > ma50) {
    const maSpreadPct = ((ma20 - ma50) / ma50) * 100;
    maScore = Math.min(15, Math.round(maSpreadPct * 3));
  }

  // 5. Trend Slope (max 10 pts) — steeper MA20 slope = stronger trend
  const slopeScore = Math.min(10, Math.round(Math.abs(ma20Slope / currentPrice * 100) * 50));

  // 6. Fibonacci Bouncing Bonus (max 20 pts)
  let fibScore = 0;
  if (fib && fib.isBouncing) {
    fibScore = 20 - Math.round(fib.distancePct * 5); // semakin dekat (distance kecil), skor makin tinggi
  }

  const swingScore = Math.round(rsiScore + pullbackScore + volScore + maScore + slopeScore + fibScore);

  // ── Smart Entry Strategy (ATR & Fib) ───────────────────────
  const atrVals = atr(highs, lows, closes, 14);
  const atr14 = atrVals.length > 0 ? Math.round(atrVals[atrVals.length - 1]) : Math.round(currentPrice * 0.02);
  
  let entry = currentPrice;
  let entry_strategy = "";
  if (fib && fib.isBouncing) {
    entry = Math.round((currentPrice + fib.nearestPrice) / 2);
    entry_strategy = `Buy on Weakness (Fibonacci Bounce) area Rp ${entry.toLocaleString('id-ID')}.\nSL ketat jika breakdown Rp ${Math.round(entry - atr14 * 1.5).toLocaleString('id-ID')} (-1.5 ATR).\nTarget Profit di area Rp ${Math.round(entry + atr14 * 3).toLocaleString('id-ID')} (3 ATR).`;
  } else if (distFromMA20pct > 0.5 && distFromMA20pct < 5) {
    entry = Math.round((currentPrice + ma20) / 2);
    entry_strategy = `Buy on Pullback dekat MA20 area Rp ${entry.toLocaleString('id-ID')}.\nSL di Rp ${Math.round(entry - atr14 * 2).toLocaleString('id-ID')} (-2 ATR).\nTarget di Rp ${Math.round(entry + atr14 * 3).toLocaleString('id-ID')}.`;
  } else {
    entry = Math.round(currentPrice - atr14 * 0.5);
    entry_strategy = `Buy cicil di area Rp ${entry.toLocaleString('id-ID')} antisipasi fluktuasi normal.\nSL di Rp ${Math.round(entry - atr14 * 2).toLocaleString('id-ID')} (-2 ATR).\nTarget di Rp ${Math.round(entry + atr14 * 3).toLocaleString('id-ID')}.`;
  }
  const sl = Math.max(1, Math.round(entry - atr14 * 2));
  const tp = Math.round(entry + atr14 * 3);

  // ── Determine entry quality label ──────────────────────────
  const goldenCross = ma50 > 0 && ma20 > ma50;
  const maSpreadPct = ma50 > 0 ? ((ma20 - ma50) / ma50) * 100 : 0;

  return {
    code:            ticker,
    price:           currentPrice,
    change:          currentPrice - yesterday.close,
    changePercent:   parseFloat(changePercent.toFixed(2)),
    volume:          currentVolume,
    valueBillion:    parseFloat(valueBillion.toFixed(1)),
    ma5:             parseFloat(ma5.toFixed(0)),
    ma20:            parseFloat(ma20.toFixed(0)),
    ma50:            ma50 > 0 ? parseFloat(ma50.toFixed(0)) : 0,
    rsi14:           parseFloat(rsi14.toFixed(1)),
    volumeExpansion: parseFloat(volumeExpansion.toFixed(2)),
    maSpreadPct:     parseFloat(maSpreadPct.toFixed(2)),
    distFromMA20pct: parseFloat(distFromMA20pct.toFixed(2)),
    goldenCross,
    swingScore,
    fibNearest:      fib ? fib.nearestLevel : null,
    fibDistancePct:  fib ? fib.distancePct : null,
    fibBouncing:     fib ? fib.isBouncing : false,
    entry, tp, sl, entry_strategy,
    technicalAnalysis: buildTechnicalAnalysis(bars),
  };
}

// ── Watchlist map (for inWatchlist flag) ─────────────────────
let watchlistCache: { codes: Set<string>; names: Map<string, string>; ts: number } | null = null;
const WL_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

async function getWatchlistData() {
  if (watchlistCache && Date.now() - watchlistCache.ts < WL_CACHE_TTL) {
    if (watchlistCache.codes.size > 0) {
      return watchlistCache;
    }
  }
  
  try {
    const groups = await fetchWatchlistGroups();
    const codes  = new Set<string>();
    const names  = new Map<string, string>();
    
    if (groups && groups.length > 0) {
      await Promise.allSettled(groups.map(async (g: { watchlist_id: string }) => {
        const wData = await fetchWatchlist(Number(g.watchlist_id)).catch(err => {
          console.error(`[Watchlist] Failed to fetch group ${g.watchlist_id}:`, err);
          return null;
        });
        if (wData?.data?.result) {
          wData.data.result.forEach((item: { symbol: string; name: string }) => {
            const code = (item.symbol || '').toUpperCase();
            if (code) {
              codes.add(code);
              if (item.name) names.set(code, item.name);
            }
          });
        }
      }));
    } else {
      console.warn('[Watchlist] No groups returned from Stockbit API.');
    }
    
    // Only cache if we actually got items, or if we are sure it's empty
    watchlistCache = { codes, names, ts: Date.now() };
    return watchlistCache;
  } catch (err) {
    console.error('[Watchlist] fetchWatchlistGroups failed:', err);
    // Return empty but don't cache it, so next request retries
    return { codes: new Set<string>(), names: new Map<string, string>(), ts: 0 };
  }
}

import fs from 'fs';
import path from 'path';

// ── Main Route ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // ── Rate Limit Guard (20 req/60s — expensive endpoint) ────
  const rateLimitResponse = rateLimit(request, 20, 60);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const mode        = searchParams.get('mode') || 'daytrade';
  const minPrice    = Number(searchParams.get('minPrice') || 0);
  const maxPrice    = Number(searchParams.get('maxPrice') || 999999);
  const searchQuery = (searchParams.get('q') || '').toUpperCase().trim();
  const sortBy      = searchParams.get('sort') || 'score';

  // ── 🛡️ Check Market Guardian State ──────────────────────────
  let isRiskOff = false;
  try {
    const statePath = path.join(process.cwd(), 'engine', 'market_state.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (state?.kill_switch_active === true) {
        isRiskOff = true;
        console.warn(`[Screener] RISK-OFF MODE ACTIVE. IHSG: ${state.ihsg_change_pct}%. Only allowing high quality setups.`);
      }
    }
  } catch (err) {
    console.error('Failed to read market state:', err);
  }

  try {
    // ── WATCHLIST DATA (for watchlist tab + inWatchlist flag) ─
    const wl = await getWatchlistData();

    // ── SEARCH MODE ───────────────────────────────────────────
    if (searchQuery) {
      const matches = IDX_TICKERS.filter(c => c.includes(searchQuery));
      const barsMap = await fetchBatch(matches, 20);
      const results = matches.map(code => {
        const bars = barsMap.get(code) || [];
        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2];
        const price = last?.close ?? 0;
        const changePercent = last && prev && prev.close > 0
          ? parseFloat((((last.close - prev.close) / prev.close) * 100).toFixed(2))
          : 0;
        return {
          id: code, code, emiten: code,
          name:          wl.names.get(code) || code,
          price,
          change:        last && prev ? last.close - prev.close : 0,
          changePercent,
          volume:        last?.volume ?? 0,
          valueBillion:  0,
          inWatchlist:   wl.codes.has(code),
          ma20: 0, ma50: 0, rsi14: 0,
          previousClose: prev?.close ?? 0,
          technicalAnalysis: bars.length >= 25 ? buildTechnicalAnalysis(bars) : null,
        };
      });

      if (results.length > 0) {
        const realPrices = await getPrices(results.map(r => r.code));
        for (const item of results) {
          const p = realPrices.get(item.code);
          if (p && p.price > 0) {
            item.price = p.price;
            if (item.previousClose > 0) {
              item.change = item.price - item.previousClose;
              item.changePercent = parseFloat(((item.change / item.previousClose) * 100).toFixed(2));
            } else if (p.changePercent !== undefined && p.change !== undefined && p.changePercent !== 0) {
              item.changePercent = p.changePercent;
              item.change = p.change;
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: { mode: 'search', count: results.length, results },
      });
    }

    // ── WATCHLIST TAB: only watchlist stocks, no screening ────
    if (mode === 'watchlist') {
      const wlTickers = Array.from(wl.codes);
      const barsMap   = await fetchBatch(wlTickers, 20);
      const results   = wlTickers.map(code => {
        const bars = barsMap.get(code) || [];
        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2];
        const price = last?.close ?? 0;
        const changePercent = last && prev && prev.close > 0
          ? parseFloat((((last.close - prev.close) / prev.close) * 100).toFixed(2))
          : 0;
        return {
          id: code, code, emiten: code,
          name:          wl.names.get(code) || code,
          price,
          change:        last && prev ? last.close - prev.close : 0,
          changePercent,
          volume:        last?.volume ?? 0,
          valueBillion:  0,
          inWatchlist:   true,
          ma20: 0, ma50: 0, rsi14: 0,
          previousClose: prev?.close ?? 0,
          technicalAnalysis: bars.length >= 25 ? buildTechnicalAnalysis(bars) : null,
        };
      }).sort((a, b) => b.volume - a.volume);

      if (results.length > 0) {
        const realPrices = await getPrices(results.map(r => r.code));
        for (const item of results) {
          const p = realPrices.get(item.code);
          if (p && p.price > 0) {
            item.price = p.price;
            if (item.previousClose > 0) {
              item.change = item.price - item.previousClose;
              item.changePercent = parseFloat(((item.change / item.previousClose) * 100).toFixed(2));
            } else if (p.changePercent !== undefined && p.change !== undefined && p.changePercent !== 0) {
              item.changePercent = p.changePercent;
              item.change = p.change;
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: { mode: 'watchlist', count: results.length, results },
      });
    }

    // ── SCREENER MODE: scan ALL IDX tickers ──────────────────
    const barsMap  = await fetchBatch(IDX_TICKERS, 30);
    const screened: ScreenerResult[] = [];
    const whaleCandidates: (ScreenerResult & { lastDateStr: string })[] = []; // For whale mode pre-filter
    const aiCandidates: (ScreenerResult & { dynamicScore: number })[]    = []; // For AI mode pre-filter

    for (const [ticker, bars] of barsMap) {
      if (mode === 'daytrade') {
        const hit = screenDayTrade(ticker, bars, minPrice, maxPrice);
        if (hit) {
          if (hit.dayScore < 60) continue;
          if (isRiskOff && hit.dayScore < 80) continue;
          screened.push({ ...hit, id: ticker, emiten: ticker, name: wl.names.get(ticker) || ticker, inWatchlist: wl.codes.has(ticker), swingScore: 0, ma20: 0, ma50: 0, rsi14: 0 });
        }
      } else if (mode === 'swing') {
        const hit = screenSwing(ticker, bars, minPrice, maxPrice);
        if (hit) {
          if (hit.swingScore < 50) continue;
          if (isRiskOff && (hit.swingScore < 70 || !hit.goldenCross)) continue;
          screened.push({ ...hit, id: ticker, emiten: ticker, name: wl.names.get(ticker) || ticker, inWatchlist: wl.codes.has(ticker), dayScore: 0, volumeRatio: 0 });
        }
      } else if (mode === 'whale') {
        // Pre-filter: use swing logic but slightly looser (min swing score > 0)
        const hit = screenSwing(ticker, bars, minPrice, maxPrice);
        if (hit && hit.swingScore > 10) {
          const lastDateStr = new Date(bars[bars.length - 1].date * 1000).toISOString().split('T')[0];
          whaleCandidates.push({ ...hit, id: ticker, emiten: ticker, name: wl.names.get(ticker) || ticker, inWatchlist: wl.codes.has(ticker), lastDateStr, dayScore: 0, volumeRatio: 0 });
        }
      } else if (mode === 'ai') {
        // Pre-filter: throw away dead stocks and score by anomaly
        if (bars.length < 25) continue;
        const currentPrice = bars[bars.length - 1].close;
        const currentVolume = bars[bars.length - 1].volume;
        const valueBillion = (currentPrice * currentVolume) / 1e9;
        
        if (currentPrice < minPrice || currentPrice > maxPrice || valueBillion < 0.5) continue;
        
        const prevPrice = bars[bars.length - 2].close;
        const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
        const volMA5 = bars.slice(-5).reduce((s, b) => s + b.volume, 0) / 5;
        const volRatio = volMA5 > 0 ? currentVolume / volMA5 : 0;
        
        const closes = bars.map(b => b.close);
        const ma5 = computeMA(closes, 5);
        const ma20 = computeMA(closes, 20);
        
        // Simple heuristic for dynamic anomaly score
        const dynamicScore = Math.abs(changePercent) * 2 + (volRatio > 1 ? volRatio * 5 : 0) + (ma5 > ma20 ? 10 : 0);
        
        aiCandidates.push({
          id: ticker, code: ticker, emiten: ticker, name: wl.names.get(ticker) || ticker, inWatchlist: wl.codes.has(ticker),
          price: currentPrice, change: currentPrice - prevPrice, changePercent: parseFloat(changePercent.toFixed(2)),
          volume: currentVolume, valueBillion: parseFloat(valueBillion.toFixed(1)),
          volRatio: parseFloat(volRatio.toFixed(2)), ma5, ma20,
          dynamicScore,
          technicalAnalysis: buildTechnicalAnalysis(bars),
        });
      }
    }

    // ── WHALE MODE: Stockbit Deep Scan ───────────────────────
    if (mode === 'whale') {
      // 1. Sort pre-filter candidates by Swing Score
      whaleCandidates.sort((a, b) => b.swingScore - a.swingScore);
      // 2. Take top 15 for deep scan (to avoid API block)
      const topCandidates = whaleCandidates.slice(0, 15);
      
      // 3. Concurrency control for Stockbit (max 3 at a time)
      const concurrency = 3;
      for (let i = 0; i < topCandidates.length; i += concurrency) {
        const batch = topCandidates.slice(i, i + concurrency);
        await Promise.all(batch.map(async (cand) => {
          try {
            const md = await fetchMarketDetector(cand.emiten, cand.lastDateStr, cand.lastDateStr);
            const buyers = md?.data?.broker_summary?.brokers_buy || [];
            
            let whaleScore = 0;
            const whaleBrokers: string[] = [];
            
            // Check top 3 buyers
            for (let j = 0; j < Math.min(3, buyers.length); j++) {
              const brokerCode = buyers[j].netbs_broker_code;
              const profile = getBrokerProfile(brokerCode);
              const netValue = parseFloat(buyers[j].bval || '0'); // In NET mode, bval is net buy
              
              if (netValue > 0) {
                if (profile.character === 'institutional_accumulator' || profile.character === 'foreign_flow') {
                  whaleScore += profile.reliability + (j === 0 ? 30 : 0); // Bonus for top 1
                  whaleBrokers.push(`${brokerCode} +${Math.round(netValue / 1e9)}B`);
                } else if (profile.character === 'swing_player') {
                  whaleScore += (profile.reliability / 2);
                } else if (profile.character === 'one_day_trader' && j === 0) {
                  // Penalize if the top buyer is a day trader (MG)
                  whaleScore -= 20;
                }
              }
            }
            
            if (whaleScore > 40) { // Found a whale!
              const topBuyers = (md?.data?.broker_summary?.brokers_buy || []).slice(0, 3).map((b) => ({
                broker: b.netbs_broker_code,
                name: getBrokerProfile(b.netbs_broker_code).name,
                lot: parseInt(b.blot || '0')
              }));
              const topSellers = (md?.data?.broker_summary?.brokers_sell || []).slice(0, 2).map((s) => ({
                broker: s.netbs_broker_code,
                name: getBrokerProfile(s.netbs_broker_code).name,
                lot: parseInt(s.slot || '0')
              }));
              const bd = md?.data?.bandar_detector;
              let bandarSignal = '⚪ NEUTRAL';
              const top3Acc = bd?.top3?.accdist?.toLowerCase() || '';
              const top1Acc = bd?.top1?.accdist?.toLowerCase() || '';

              if (top3Acc.includes('accum')) bandarSignal = '🟢🟢 STRONG BUY';
              else if (top1Acc.includes('accum')) bandarSignal = '🟢 BUY';
              else if (top3Acc.includes('dist')) bandarSignal = '🔴🔴 STRONG SELL';

              const smartMoneyLot = (bd?.top3?.vol || 0);
              let foreignNetLot = 0;
              let foreignNetVal = 0;
              let totalForeignVol = 0;
              let totalVol = 0;

              (md?.data?.broker_summary?.brokers_buy || []).forEach((b) => {
                const lot = parseInt(b.blot || '0');
                const val = parseFloat(b.bval || '0');
                const lotv = parseInt(b.blot || '0');
                totalVol += lot;
                // ponytail: Logic to identify 'Asing' brokers needs to be implemented.
                // For now, assuming all brokers contribute to foreignNetLot/Val for compilation.
                foreignNetLot += lot;
                foreignNetVal += val;
                totalForeignVol += lot;
              });

              (md?.data?.broker_summary?.brokers_sell || []).forEach((s) => {
                const lot = parseInt(s.slot || '0'); 
                const val = parseFloat(s.sval || '0'); 
                totalVol += lot;
                // ponytail: Logic to identify 'Asing' brokers needs to be implemented.
                // For now, assuming all brokers contribute to foreignNetLot/Val for compilation.
                foreignNetLot -= lot; // subtract for sellers
                foreignNetVal -= val; // subtract for sellers
                totalForeignVol += lot;
              });

              const foreignStatus = foreignNetLot > 0 ? '🟢 NET BUY ASING' : (foreignNetLot < 0 ? '🔴 NET SELL ASING' : '⚪ NEUTRAL');
              const foreignParticipation = totalVol > 0 ? (totalForeignVol / totalVol) * 100 : 0;

              screened.push({
                ...cand,
                whaleScore: Math.round(whaleScore),
                whaleBroker: whaleBrokers.length > 0 ? whaleBrokers.join(', ') : 'Mixed Whale',
                bandarSignal,
                smartMoneyLot,
                topBuyers,
                topSellers,
                foreignStatus,
                foreignNetVal,
                foreignNetLot,
                foreignParticipation
              });
            }
          } catch (err) {
            console.error(`[Whale Scanner] Error fetching ${cand.emiten}:`, err);
          }
        }));
      }
    }

    // ── AI MODE: Ask The Oracle ──────────────────────────────
    if (mode === 'ai') {
      aiCandidates.sort((a, b) => b.dynamicScore - a.dynamicScore);
      const topCandidates = aiCandidates.slice(0, 20);
      
      try {
        const prompt = `You are a Quant AI. Review these 20 stocks:\n${JSON.stringify(topCandidates.map(c => ({
          code: c.emiten, price: c.price, change: c.changePercent + '%', volRatio: c.volRatio, trend: c.ma5 > c.ma20 ? 'UP' : 'DOWN'
        })))}\nSelect exactly 5 stocks with highest probability of rising tomorrow. Return ONLY a JSON array of objects with 'code', 'score' (1-100), and 'reason' (max 2 sentences). No other text.`;
        
        const AI_ENDPOINT = process.env.AI_ENDPOINT || 'http://localhost:4891/v1/chat/completions';
        const AI_MODEL = process.env.AI_MODEL || 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_0';
        
        const res = await fetch(AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
          }),
          signal: AbortSignal.timeout(60000)
        });
        
        let aiJsonStr = '';
        if (res.ok) {
          const json = await res.json();
          aiJsonStr = json.choices?.[0]?.message?.content || json.response || '';
        }
        
        const jsonMatch = aiJsonStr.match(/\[[\s\S]*\]/);
        const parsedAI = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        
        if (Array.isArray(parsedAI) && parsedAI.length > 0) {
          for (const ai of parsedAI) {
            const cand = topCandidates.find(c => c.emiten === ai.code);
            if (cand) {
              screened.push({
                ...cand,
                aiScore: ai.score,
                aiReason: ai.reason
              });
            }
          }
        } else {
          throw new Error('AI response invalid or empty');
        }
      } catch (err) {
        console.error('[AI Screener] Fallback triggered:', err);
        // Fallback: Pick top 5 by dynamic score
        for (let i = 0; i < Math.min(5, topCandidates.length); i++) {
          const c = topCandidates[i];
          screened.push({
            ...c,
            aiScore: 80 - i * 2,
            aiReason: `Strong anomaly detected with ${c.volRatio}x volume expansion and ${c.changePercent}% momentum. Favorable setup for continuation.`
          });
        }
      }
    }

    // ── Apply Real-Time Prices ───────────────────────────────
    if (screened.length > 0) {
      const tickers = screened.map((s) => s.emiten);
      const realPrices = await getPrices(tickers);
      
      for (const item of screened) {
        const p = realPrices.get(item.emiten);
        if (p && p.price > 0) {
          item.price = p.price;
          // Only override changePercent if we have a valid previous close to compare against, 
          // or trust the real-time source's changePercent if available
          if (p.changePercent !== undefined) {
             item.changePercent = p.changePercent;
          }
          if (p.change !== undefined) {
             item.change = p.change;
          }
        }
      }
    }

    // ── Sort ─────────────────────────────────────────────────
    screened.sort((a, b) => {
      if (sortBy === 'price_asc')  return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'change')     return b.changePercent - a.changePercent;
      // default: by mode score
      if (mode === 'daytrade') return b.dayScore - a.dayScore;
      if (mode === 'whale') return b.whaleScore - a.whaleScore;
      if (mode === 'ai') return b.aiScore - a.aiScore;
      return b.swingScore - a.swingScore;
    });

    return NextResponse.json({
      success: true,
      data: { mode, sortBy, count: screened.length, results: screened },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Screener failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
