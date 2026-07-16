import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketDetector, fetchOrderbook, fetchEmitenInfo } from '@/lib/stockbit';
import { getPrice, fetchYahooPrice } from '@/lib/price-sync';
import {
  calculateUPS, rsi, macd, atr as computeAtr, detectMarketRegime,
  calculateZScore, detectWashSale, adjustUPSThreshold,
  checkRoCKillSwitch, multiTimeframeValidation,
  detectUpperShadowDivergence, detectConcentrationAnomaly,
  detectIcebergOrder, calculateMFI, fuseSentimentMFI,
} from '@/lib/analysis';
import { rateLimit } from '@/lib/rateLimit';
import { processAlerts } from '@/lib/telegram';
import rules from '@/app/config/rules.json';

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

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  // ── Rate Limit Guard ────────────────────────────────────────
  const rateLimitResponse = rateLimit(request, 60, 60);
  if (rateLimitResponse) return rateLimitResponse;

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

    const [marketDetector, orderbook, emitenInfo, ihsgChange, yahooPrice] = await Promise.allSettled([
      fetchMarketDetector(emiten, fromDate, toDate),
      fetchOrderbook(emiten),
      fetchEmitenInfo(emiten),
      getIHSGChange(),
      fetchYahooPrice(emiten),
    ]);

    // ── Check token errors and fallback ───────────────────────
    const rejected = [marketDetector, orderbook, emitenInfo].find(p => p.status === 'rejected');
    let price = 0;
    let change = 0;
    let changePercent = 0;
    let fallbackUsed = false;
    
    // Cast to any — API response has dynamic fields not in our strict type
    let ob: any = orderbook.status === 'fulfilled' ? orderbook.value?.data || {} : {};

    if (rejected && rejected.status === 'rejected') {
      console.warn(`[Stock API] Token failed. Using price-sync fallback for ${emiten}`);
      const pData = await getPrice(emiten);
      price = pData.price;
      changePercent = pData.changePercent || 0;
      change = price - (price / (1 + changePercent / 100));
      fallbackUsed = true;
    } else {
      price = ob.lastprice || ob.close || 0;
      const yp = yahooPrice.status === 'fulfilled' ? yahooPrice.value : null;
      let previousClose = yp?.previousClose || ob.previousclose || ob.previousprice || ob.prev_close || 0;
      
      // If previous close is suspiciously 0 or identical to price (due to missing field mapped to lastprice),
      // we try to use Yahoo's change values instead if available.
      if (previousClose === 0 || previousClose === price) {
        if (yp) {
          previousClose = yp.previousClose;
        }
      }
      
      change = price && previousClose ? price - previousClose : 0;
      changePercent = price && previousClose ? parseFloat(((change / previousClose) * 100).toFixed(2)) : 0;
    }

    const mdData = marketDetector.status === 'fulfilled' ? marketDetector.value : null;
    const infoData = emitenInfo.status === 'fulfilled' ? emitenInfo.value : null;
    const ihsgPct = ihsgChange.status === 'fulfilled' ? ihsgChange.value : 0;

    // ── Extract raw data ──────────────────────────────────────
    const topBuyers = mdData?.data?.broker_summary?.brokers_buy?.slice(0, 5) || [];
    const topSellers = mdData?.data?.broker_summary?.brokers_sell?.slice(0, 5) || [];
    const allBuyers = mdData?.data?.broker_summary?.brokers_buy || [];
    const detector = mdData?.data?.bandar_detector;

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
    //    Enhanced: compare top-1 broker vs ALL brokers + count opposing direction
    const allBrokerEntries = [
      ...topBuyers.map((b: any) => ({ code: b.netbs_broker_code || b.code || '', netValue: parseFloat(b.bval || '0') })),
      ...topSellers.map((b: any) => ({ code: b.netbs_broker_code || b.code || '', netValue: -parseFloat(b.sval || b.bval || '0') })),
    ];
    const concentrationResult = detectConcentrationAnomaly(allBrokerEntries);
    const concentrationRatio = concentrationResult.ratio;
    const artificialLiquidity = concentrationResult.warning;

    // 5. Rate-of-Change Kill-Switch
    const history = priceHistory.get(emiten) || [];
    const rocResult = checkRoCKillSwitch(history, 5, 5);

    // 6. Global Correlation Kill-Switch (IHSG crash)
    const upsThreshold = adjustUPSThreshold(ihsgPct);
    const globalKillSwitch = ihsgPct <= rules.killSwitch.rocPercentDrop5Min;

    // 7. Multi-Timeframe Validation
    // Compute signals at different "simulated" timeframes using different RSI periods
    const mtfSignals = [
      { timeframe: '5m',  signal: changePercent > 1 ? 'bullish' as const : changePercent < -1 ? 'bearish' as const : 'neutral' as const },
      { timeframe: '1H',  signal: zScore > 1 ? 'bullish' as const : zScore < -1 ? 'bearish' as const : 'neutral' as const },
      { timeframe: '1D',  signal: (detector?.top5?.accdist?.includes('Accum')) ? 'bullish' as const : (detector?.top5?.accdist?.includes('Dist')) ? 'bearish' as const : 'neutral' as const },
    ];
    const mtfResult = multiTimeframeValidation(mtfSignals);

    // ── Money Flow Index (MFI) ──
    // Fetch mini OHLCV from Yahoo for MFI calculation
    let mfiValue = 50;
    let mfiLabel = 'N/A';
    let mfiDivergence = false;
    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${emiten}.JK?range=1mo&interval=1d`;
      const yahooRes = await fetch(yahooUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (yahooRes.ok) {
        const yahooData = await yahooRes.json();
        const q = yahooData.chart?.result?.[0]?.indicators?.quote?.[0];
        if (q) {
          const h = (q.high || []).filter((v: number | null) => v != null);
          const l = (q.low || []).filter((v: number | null) => v != null);
          const c = (q.close || []).filter((v: number | null) => v != null);
          const v = (q.volume || []).filter((v: number | null) => v != null);
          const minLen = Math.min(h.length, l.length, c.length, v.length);
          if (minLen > 14) {
            mfiValue = calculateMFI(
              h.slice(-minLen), l.slice(-minLen), c.slice(-minLen), v.slice(-minLen)
            );
          }
        }
      }
    } catch { /* MFI fetch failed, use default */ }

    // Fuse MFI with stream sentiment (use 0 as placeholder for now since
    // we don't have the sentiment score here; the frontend will handle fusion)
    const mfiFusion = fuseSentimentMFI(mfiValue, 0);
    mfiLabel = mfiFusion.label;
    mfiDivergence = mfiFusion.divergence;

    // ── Volume-Profile Divergence (Upper Shadow Alert) ──
    const open = ob.open || 0;
    const low = ob.low || 0;
    const upperShadowResult = detectUpperShadowDivergence({
      open, high, low, close: price, netBuy,
    });

    // ── Iceberg Order Detection ──
    const icebergBrokers = allBuyers.map((b: any) => ({
      code: b.netbs_broker_code || '',
      netValue: parseFloat(b.bval || '0') - parseFloat(b.sval || '0'),
      bfreq: parseInt(b.bfreq || b.blot_freq || '0', 10),
      blot: parseInt(String(b.blot || '0').replace(/,/g, ''), 10),
    }));
    const icebergResult = detectIcebergOrder(icebergBrokers);

    // ── Unified Power Score (UPS) ───────────────────────────
    const upsResult = calculateUPS({
      rsiValue: mfiValue, // Using MFI as proxy or we could fetch RSI
      macdHistogram: 0,   // Placeholder if not calculated
      trendDirection: detector?.top5?.accdist?.includes('Accum') ? 'uptrend' : 'sideways',
      whaleNetValue: netBuy,
      brokerConsistency: detector?.top5?.percent || 50,
      zScore: zScore,
      hakaRatio: 0.5, // Placeholder
    });
    
    let ups = upsResult.total;
    if (icebergResult.detected) ups += 5; // Bonus for hidden accumulation

    // ── Data Integrity Shield (Gap Detection) ──
    // Incomplete Data if orderbook is completely empty during market hours
    const incompleteData = fallbackUsed || (!topBuyers.length && !topSellers.length);
    if (incompleteData) {
      ups = 50; // Neutralize UPS on missing data to prevent hallucination
    }
    
    ups = Math.min(Math.max(Math.round(ups), 5), 95);

    // Kill-switch flags
    const killSwitchActive = rocResult.triggered || globalKillSwitch;

    // ── Fire Telegram Alerts (non-blocking) ──
    processAlerts({
      emiten,
      zScore: parseFloat(zScore.toFixed(2)),
      spoofingAlert,
      washSaleAlert,
      icebergDetected: icebergResult.detected,
      icebergBroker: icebergResult.brokerCode,
      concentrationLabel: concentrationResult.label,
      concentrationTopBroker: concentrationResult.topBrokerCode,
      upperShadowAlert: upperShadowResult.alert,
      mfiDivergence,
      mfiLabel,
      mfi: mfiValue,
      killSwitchActive,
      price,
      changePercent,
    }).catch(() => {}); // fire and forget

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
        upsThreshold,
        zScore: parseFloat(zScore.toFixed(2)),
        spoofingAlert,
        washSaleAlert,
        washSaleLabel: washSaleResult.label,
        churnRatio: washSaleResult.churnRatio,
        artificialLiquidity,
        concentrationRatio: parseFloat(concentrationRatio.toFixed(2)),
        concentrationLabel: concentrationResult.label,
        concentrationTopBroker: concentrationResult.topBrokerCode,
        opposingBrokerCount: concentrationResult.opposingBrokerCount,
        upperShadowAlert: upperShadowResult.alert,
        upperShadowLabel: upperShadowResult.label,
        upperShadowPct: upperShadowResult.upperShadowPct,
        incompleteData,
        killSwitchActive,
        rocKillSwitch: rocResult,
        globalKillSwitch,
        ihsgChangePercent: parseFloat(ihsgPct.toFixed(2)),
        mtfConsensus: mtfResult.consensus,
        mtfValid: mtfResult.isValid,
        mtfSignals,
        icebergDetected: icebergResult.detected,
        icebergBroker: icebergResult.brokerCode,
        icebergAvgLot: icebergResult.avgLotPerTx,
        icebergFrequency: icebergResult.frequency,
        icebergLabel: icebergResult.label,
        mfi: mfiValue,
        mfiLabel,
        mfiDivergence,
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
