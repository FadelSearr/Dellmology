import { NextRequest, NextResponse } from 'next/server';
import { fetchWatchlistGroups, fetchWatchlist } from '@/lib/stockbit';
import { IDX_TICKERS } from '@/lib/idx-tickers';

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

// ── Day Trade Screener — "The Volatility Hunter" (Revised) ───
// Inspired by Stockbit screener + enhanced with intraday analysis
//
// Rules (from Stockbit):
// 1. Price > Rp 200 (avoid penny/gorengan stocks)
// 2. Value > Rp 5B (liquid enough for day trade)
// 3. Volume > 1.5x Volume MA20 (volume surge — Stockbit uses 1x, we use 1.5x for stronger signal)
// 4. Price Change > +1% (already moving — Stockbit uses 1%)
// 5. Price Change < +15% (not ARA/extreme — avoid chasing)
//
// Enhanced rules (custom Dellmology):
// 6. Close > MA5 (short-term momentum confirmed)
// 7. Intraday Range > 2% (enough volatility for day trading)
// 8. Price above VWAP proxy (buyers in control)
//
// Scoring (100 pts max):
// - Volume Surge (30 pts) — higher ratio = more institutional interest
// - Price Momentum (25 pts) — change% strength
// - Intraday Range (20 pts) — wider range = more opportunity
// - Value Liquidity (15 pts) — bigger value = easier entry/exit
// - VWAP Position (10 pts) — above VWAP = bullish bias
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
  const hist20          = bars.slice(-21, -1);
  const avgVolume20     = hist20.length > 0
    ? hist20.reduce((s, b) => s + b.volume, 0) / hist20.length
    : currentVolume;
  const volumeRatio     = avgVolume20 > 0 ? currentVolume / avgVolume20 : 0;

  // Volume MA5 for additional context
  const volumeMA5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeMA5Ratio = avgVolume20 > 0 ? volumeMA5 / avgVolume20 : 0;

  // ── Transaction Value ──────────────────────────────────────
  const valueBillion    = (currentPrice * currentVolume * 100) / 1e9;

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

  // Rule 1: Price > Rp 200 (from Stockbit — avoid gorengan)
  if (currentPrice < 200) return null;

  // Rule 2: Value > Rp 5B (from Stockbit — liquidity)
  if (valueBillion < 5) return null;

  // Rule 3: Volume > 1.5x MA20 (inspired by Stockbit's 1x, slightly stricter)
  if (volumeRatio < 1.5) return null;

  // Rule 4: Price change > +1% (from Stockbit — already moving)
  if (changePercent < 1) return null;

  // Rule 5: Price change < +15% (avoid ARA chasing)
  if (changePercent > 15) return null;

  // Rule 6: Close > MA5 (short-term momentum)
  if (!aboveMA5) return null;

  // Rule 7: Intraday range > 2% (enough volatility for day trade)
  if (intradayRange < 2) return null;

  // ════════════════════════════════════════════════════════════
  //  SCORING — higher = better day trade candidate
  // ════════════════════════════════════════════════════════════

  // 1. Volume Surge (max 30 pts) — 1.5x = 0pts, 5x+ = 30pts
  const volScore = Math.min(30, Math.round((volumeRatio - 1.5) * 8.5));

  // 2. Price Momentum (max 25 pts) — 1% = 5pts, 7%+ = 25pts
  const momentumScore = Math.min(25, Math.round(changePercent * 3.5));

  // 3. Intraday Range (max 20 pts) — 2% = 0pts, 8%+ = 20pts
  const rangeScore = Math.min(20, Math.round((intradayRange - 2) * 3.3));

  // 4. Value Liquidity (max 15 pts) — 5B = 3pts, 50B+ = 15pts
  const liquidityScore = Math.min(15, Math.round(Math.log10(valueBillion) * 5));

  // 5. VWAP Position (max 10 pts) — bonus for being above VWAP
  const vwapScore = aboveVWAP ? 10 : 0;

  const dayScore = Math.max(0, Math.round(volScore + momentumScore + rangeScore + liquidityScore + vwapScore));

  return {
    code:           ticker,
    price:          currentPrice,
    change:         currentPrice - yesterday.close,
    changePercent:  parseFloat(changePercent.toFixed(2)),
    volume:         currentVolume,
    volumeRatio:    parseFloat(volumeRatio.toFixed(2)),
    volumeMA5Ratio: parseFloat(volumeMA5Ratio.toFixed(2)),
    valueBillion:   parseFloat(valueBillion.toFixed(1)),
    intradayRange:  parseFloat(intradayRange.toFixed(2)),
    aboveVWAP,
    aboveMA5,
    dayScore,
    // Swing fields (empty)
    ma5: 0, ma20: 0, ma50: 0, rsi14: 0, swingScore: 0,
  };
}

// ── Swing Screener — "The Trend Navigator" (Revised) ─────────
// Inspired by Stockbit screener + enhanced with smart pullback detection
//
// Rules:
// 1. MA5 > MA20 (short-term momentum above medium-term) — from Stockbit
// 2. Volume MA5 > 1.2x Volume MA20 (volume expansion) — from Stockbit
// 3. Price > Rp 100 (avoid penny stocks) — from Stockbit
// 4. RSI 14: between 40-70 (wider range to catch pullback entries)
// 5. Close > MA20 (still in uptrend)
// 6. MA20 slope positive (trend direction confirmed)
// 7. Transaction value ≥ Rp 2B (liquid enough for swing)
//
// Bonus scoring:
// - Pullback proximity: best entries are when price is close to MA20 (3-8% above)
// - MA20 > MA50 (Golden Cross) = bonus points
// - Volume expansion ratio = higher is better
// - RSI sweet spot near 55 = highest score
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

  // ── RSI ────────────────────────────────────────────────────
  const rsi14 = computeRSI(closes, 14);

  // ── Transaction Value ──────────────────────────────────────
  const currentVolume = today.volume;
  const valueBillion  = (currentPrice * currentVolume * 100) / 1e9;

  // ── Pullback distance from MA20 ────────────────────────────
  const distFromMA20pct = ((currentPrice - ma20) / ma20) * 100;

  // ── Price filter ───────────────────────────────────────────
  if (currentPrice < minPrice || currentPrice > maxPrice) return null;

  // ════════════════════════════════════════════════════════════
  //  APPLY SCREENING CRITERIA
  // ════════════════════════════════════════════════════════════

  // Rule 1: Price > Rp 100 (no penny stocks)
  if (currentPrice < 100) return null;

  // Rule 2: Close must be above MA20 (in uptrend)
  if (currentPrice <= ma20) return null;

  // Rule 3: MA5 > MA20 (short-term strength — Stockbit rule)
  if (ma5 <= ma20) return null;

  // Rule 4: Volume expansion — MA5 Vol > 1.2x MA20 Vol (Stockbit rule)
  if (volumeExpansion < 1.2) return null;

  // Rule 5: RSI between 40-70 (catch pullbacks, avoid overbought)
  if (rsi14 < 40 || rsi14 > 70) return null;

  // Rule 6: MA20 slope must be positive (trend confirmed)
  if (ma20Slope <= 0) return null;

  // Rule 7: Minimum transaction value Rp 2B (liquidity)
  if (valueBillion < 2) return null;

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

  const swingScore = Math.round(rsiScore + pullbackScore + volScore + maScore + slopeScore);

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
    // Day fields (empty)
    volumeRatio: 0, aboveVWAP: true, dayScore: 0,
  };
}

// ── Watchlist map (for inWatchlist flag) ─────────────────────
let watchlistCache: { codes: Set<string>; names: Map<string, string>; ts: number } | null = null;
const WL_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

async function getWatchlistData() {
  if (watchlistCache && Date.now() - watchlistCache.ts < WL_CACHE_TTL) return watchlistCache;
  const groups = await fetchWatchlistGroups().catch(() => []);
  const codes  = new Set<string>();
  const names  = new Map<string, string>();
  if (groups?.length > 0) {
    await Promise.allSettled(groups.map(async (g: any) => {
      const wData = await fetchWatchlist(g.watchlist_id).catch(() => null);
      if (wData?.data?.result) {
        wData.data.result.forEach((item: any) => {
          const code = (item.symbol || '').toUpperCase();
          if (code) {
            codes.add(code);
            if (item.name) names.set(code, item.name);
          }
        });
      }
    }));
  }
  watchlistCache = { codes, names, ts: Date.now() };
  return watchlistCache;
}

// ── Main Route ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode        = searchParams.get('mode') || 'daytrade';
  const minPrice    = Number(searchParams.get('minPrice') || 0);
  const maxPrice    = Number(searchParams.get('maxPrice') || 999999);
  const searchQuery = (searchParams.get('q') || '').toUpperCase().trim();
  const sortBy      = searchParams.get('sortBy') || 'score'; // score | price_asc | price_desc | change

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
          dayScore:      0, swingScore: 0, volumeRatio: 0,
          ma20: 0, ma50: 0, rsi14: 0,
        };
      });
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
          dayScore:      0, swingScore: 0, volumeRatio: 0,
          ma20: 0, ma50: 0, rsi14: 0,
        };
      }).sort((a, b) => b.volume - a.volume);
      return NextResponse.json({
        success: true,
        data: { mode: 'watchlist', count: results.length, results },
      });
    }

    // ── SCREENER MODE: scan ALL IDX tickers ──────────────────
    const barsMap  = await fetchBatch(IDX_TICKERS, 30);
    const screened: any[] = [];

    for (const [ticker, bars] of barsMap) {
      const hit = mode === 'daytrade'
        ? screenDayTrade(ticker, bars, minPrice, maxPrice)
        : screenSwing   (ticker, bars, minPrice, maxPrice);

      if (hit) {
        screened.push({
          ...hit,
          id:          ticker,
          emiten:      ticker,
          name:        wl.names.get(ticker) || ticker,
          inWatchlist: wl.codes.has(ticker),
        });
      }
    }

    // ── Sort ─────────────────────────────────────────────────
    screened.sort((a, b) => {
      if (sortBy === 'price_asc')  return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'change')     return b.changePercent - a.changePercent;
      // default: by mode score
      return mode === 'daytrade'
        ? b.dayScore   - a.dayScore
        : b.swingScore - a.swingScore;
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
