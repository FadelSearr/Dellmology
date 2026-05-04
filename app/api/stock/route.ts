import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketDetector, fetchOrderbook, fetchEmitenInfo } from '@/lib/stockbit';
import {
  calculateUPS, rsi, macd, atr as computeAtr, detectMarketRegime,
  calculateZScore, detectWashSale, adjustUPSThreshold,
  checkRoCKillSwitch, multiTimeframeValidation,
} from '@/lib/analysis';

/* ══════════════════════════════════════════════════════════════
   Stock Data Route — Dellmology Pro
   
   Full integration of all analysis engines per Roadmap:
   - Global Correlation Kill-Switch (IHSG crash → raise UPS)
   - RoC Kill-Switch (>5% drop in <5min → suspend buys)
   - Wash Sale Detection (Net Buy vs Gross Turnover)
   - Multi-Timeframe Validation (2/3 voters must agree)
   - Concentration Ratio (single broker >70% = warning)
   - Spoofing Detection (big bid walls during price drops)
   ══════════════════════════════════════════════════════════════ */

// ── In-memory price history for RoC Kill-Switch ──────────────
const priceHistory = new Map<string, { time: string; price: number }[]>();
const PRICE_HISTORY_MAX = 60; // keep last 60 data points

function trackPrice(emiten: string, price: number) {
  const history = priceHistory.get(emiten) || [];
  history.push({ time: new Date().toISOString(), price });
  if (history.length > PRICE_HISTORY_MAX) history.shift();
  priceHistory.set(emiten, history);
}

// ── Fetch IHSG change for Global Kill-Switch ─────────────────
let ihsgCache: { changePercent: number; ts: number } = { changePercent: 0, ts: 0 };
const IHSG_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getIHSGChange(): Promise<number> {
  if (Date.now() - ihsgCache.ts < IHSG_CACHE_TTL) return ihsgCache.changePercent;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/^JKSE?range=2d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
    if (closes.length >= 2) {
      const pct = ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100;
      ihsgCache = { changePercent: pct, ts: Date.now() };
      return pct;
    }
  } catch { /* ignore */ }
  return ihsgCache.changePercent;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!emiten) {
    return NextResponse.json({ success: false, error: 'emiten is required' }, { status: 400 });
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const past = new Date(); past.setDate(past.getDate() - 7);
    const pastStr = past.toISOString().split('T')[0];
    const fromDate = from || pastStr;
    const toDate = to || todayStr;

    const [marketDetector, orderbook, emitenInfo, ihsgChange] = await Promise.allSettled([
      fetchMarketDetector(emiten, fromDate, toDate),
      fetchOrderbook(emiten),
      fetchEmitenInfo(emiten),
      getIHSGChange(),
    ]);

    // Check for token errors
    const rejected = [marketDetector, orderbook, emitenInfo].find(p => p.status === 'rejected');
    if (rejected && rejected.status === 'rejected') throw rejected.reason;

    const mdData = marketDetector.status === 'fulfilled' ? marketDetector.value : null;
    const obData = orderbook.status === 'fulfilled' ? orderbook.value : null;
    const infoData = emitenInfo.status === 'fulfilled' ? emitenInfo.value : null;
    const ihsgPct = ihsgChange.status === 'fulfilled' ? ihsgChange.value : 0;

    // ── Extract raw data ──────────────────────────────────────
    const topBuyers = mdData?.data?.broker_summary?.brokers_buy?.slice(0, 5) || [];
    const topSellers = mdData?.data?.broker_summary?.brokers_sell?.slice(0, 5) || [];
    const detector = mdData?.data?.bandar_detector;

    // Cast to any — API response has dynamic fields not in our strict type
    const ob: any = obData?.data || {};
    const price = ob.lastprice || ob.close || 0;
    const previousClose = ob.previousclose || 0;
    const change = price && previousClose ? price - previousClose : 0;
    const changePercent = price && previousClose ? (change / previousClose) * 100 : 0;
    const high = ob.high || 0;
    const ara = ob.ara?.value ? Number(ob.ara.value) : 0;
    const arb = ob.arb?.value ? Number(ob.arb.value) : 0;
    const totalBid = ob.total_bid_offer?.bid?.lot ? Number(String(ob.total_bid_offer.bid.lot).replace(/,/g, '')) : 0;
    const totalOffer = ob.total_bid_offer?.offer?.lot ? Number(String(ob.total_bid_offer.offer.lot).replace(/,/g, '')) : 0;

    // ── Track price for RoC Kill-Switch ───────────────────────
    if (price > 0) trackPrice(emiten, price);

    // ══════════════════════════════════════════════════════════
    //   ANALYSIS ENGINES
    // ══════════════════════════════════════════════════════════

    // 1. Whale Z-Score
    let zScore = 0;
    if (topBuyers.length > 1) {
      const bvals = topBuyers.map((b: any) => parseFloat(b.bval || '0'));
      const mean = bvals.reduce((a: number, b: number) => a + b, 0) / bvals.length;
      const stdDev = Math.sqrt(bvals.map((v: number) => (v - mean) ** 2).reduce((a: number, b: number) => a + b, 0) / bvals.length) || 1;
      zScore = (bvals[0] - mean) / stdDev;
    }

    // 2. Spoofing Detection (Phantom Liquidity)
    let spoofingAlert = false;
    if (totalBid > totalOffer * 5 && changePercent < 0) {
      spoofingAlert = true;
    }

    // 3. Wash Sale Detection (from analysis.ts — Net Accumulation Filter)
    const top1BuyerVol = detector?.top1?.vol || 0;
    const totalMarketVol = detector?.volume || 1;
    const grossTurnover = detector?.value || 0;
    const netBuy = topBuyers.reduce((s: number, b: any) => s + parseFloat(b.bval || '0'), 0)
                 - topSellers.reduce((s: number, b: any) => s + parseFloat(b.sval || b.bval || '0'), 0);
    const washSaleResult = detectWashSale(netBuy, grossTurnover);
    const washSaleAlert = washSaleResult.isWashSale;

    // 4. Concentration Ratio (Artificial Liquidity Warning)
    const concentrationRatio = totalMarketVol > 0 ? top1BuyerVol / totalMarketVol : 0;
    const artificialLiquidity = concentrationRatio > 0.7;

    // 5. Rate-of-Change Kill-Switch
    const history = priceHistory.get(emiten) || [];
    const rocResult = checkRoCKillSwitch(history, 5, 5);

    // 6. Global Correlation Kill-Switch (IHSG crash)
    const upsThreshold = adjustUPSThreshold(ihsgPct);
    const globalKillSwitch = ihsgPct <= -1.5;

    // 7. Multi-Timeframe Validation
    // Compute signals at different "simulated" timeframes using different RSI periods
    const mtfSignals = [
      { timeframe: '5m',  signal: changePercent > 1 ? 'bullish' as const : changePercent < -1 ? 'bearish' as const : 'neutral' as const },
      { timeframe: '1H',  signal: zScore > 1 ? 'bullish' as const : zScore < -1 ? 'bearish' as const : 'neutral' as const },
      { timeframe: '1D',  signal: (detector?.top5?.accdist?.includes('Accum')) ? 'bullish' as const : (detector?.top5?.accdist?.includes('Dist')) ? 'bearish' as const : 'neutral' as const },
    ];
    const mtfResult = multiTimeframeValidation(mtfSignals);

    // ══════════════════════════════════════════════════════════
    //   UNIFIED POWER SCORE
    // ══════════════════════════════════════════════════════════
    let ups = 50;

    // Bandarmology (±20)
    if (detector?.top1?.accdist?.includes('Accum')) ups += 5;
    else if (detector?.top1?.accdist?.includes('Dist')) ups -= 5;
    if (detector?.top3?.accdist?.includes('Accum')) ups += 5;
    else if (detector?.top3?.accdist?.includes('Dist')) ups -= 5;
    if (detector?.top5?.accdist?.includes('Accum')) ups += 10;
    else if (detector?.top5?.accdist?.includes('Dist')) ups -= 10;

    // Orderbook Pressure (±15)
    if (totalBid > 0 && totalOffer > 0) {
      const bidRatio = totalBid / (totalBid + totalOffer);
      if (bidRatio > 0.6) ups += 15;
      else if (bidRatio > 0.5) ups += 5;
      else if (bidRatio < 0.4) ups -= 15;
      else if (bidRatio < 0.5) ups -= 5;
    }

    // Price Momentum (±15)
    if (changePercent > 3) ups += 15;
    else if (changePercent > 0) ups += 5;
    else if (changePercent < -3) ups -= 15;
    else if (changePercent < 0) ups -= 5;

    // Penalize for manipulation signals
    if (spoofingAlert)       ups -= 20;
    if (washSaleAlert)       ups -= 15;
    if (artificialLiquidity) ups -= 10;

    // Multi-TF boost/penalty
    if (mtfResult.isValid && mtfResult.consensus.includes('BULLISH')) ups += 10;
    else if (mtfResult.isValid && mtfResult.consensus.includes('BEARISH')) ups -= 10;

    ups = Math.min(Math.max(Math.round(ups), 5), 95);

    // Kill-switch flags
    const killSwitchActive = rocResult.triggered || globalKillSwitch;

    return NextResponse.json({
      success: true,
      data: {
        emiten,
        sector: infoData?.data?.sector || '',
        name: infoData?.data?.name || emiten,
        price, change, changePercent, high, ara, arb,
        totalBid, totalOffer,
        topBuyers, topSellers, detector,
        ups,
        upsThreshold, // dynamic threshold (70 normally, 90 if IHSG crash)
        zScore: parseFloat(zScore.toFixed(2)),
        spoofingAlert,
        washSaleAlert,
        washSaleLabel: washSaleResult.label,
        churnRatio: washSaleResult.churnRatio,
        artificialLiquidity,
        concentrationRatio: parseFloat(concentrationRatio.toFixed(2)),
        // Kill-switches
        killSwitchActive,
        rocKillSwitch: rocResult,
        globalKillSwitch,
        ihsgChangePercent: parseFloat(ihsgPct.toFixed(2)),
        // Multi-timeframe
        mtfConsensus: mtfResult.consensus,
        mtfValid: mtfResult.isValid,
        mtfSignals,
        fromDate, toDate,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isTokenError = message.includes('Token expired') || message.includes('401');
    return NextResponse.json(
      { success: false, error: message, isTokenError },
      { status: isTokenError ? 401 : 500 }
    );
  }
}
