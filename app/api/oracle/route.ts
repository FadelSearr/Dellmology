import { NextRequest, NextResponse } from 'next/server';
import { generateOraclePicks } from '@/lib/ai-oracle';
import { getSessionValue, upsertSession } from '@/lib/supabase';
import { rateLimit } from '@/lib/rateLimit';
import { getPrice } from '@/lib/price-sync';
import { fetchMarketDetector, fetchOrderbook } from '@/lib/stockbit';
import { calculateUPS, calculateZScore } from '@/lib/analysis';
import { getBrokerProfile } from '@/lib/broker-profiles';

// The Oracle is expensive and AI takes time. Cache results adaptively.
const CACHE_KEY = 'oracle_daily_picks_v2';

// Adaptive TTL: 30 min during market hours (09:00–16:30 WIB = 02:00–09:30 UTC)
// 4 hours during off-hours
function getAdaptiveCacheTTL(): number {
  const hourUTC = new Date().getUTCHours();
  const minUTC  = new Date().getUTCMinutes();
  const timeUTC = hourUTC * 60 + minUTC;
  // WIB 09:00 = UTC 02:00 (120 min), WIB 16:30 = UTC 09:30 (570 min)
  const isMarketHours = timeUTC >= 120 && timeUTC < 570;
  return isMarketHours ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;
}

export async function GET(request: NextRequest) {
  // Rate limiting — quantitative engine is fast, allow more requests
  const limitRes = rateLimit(request, 30, 60);
  if (limitRes) return limitRes;

  try {
    const url = new URL(request.url);
    const minPrice = Number(url.searchParams.get('minPrice') || 100);
    const maxPrice = Number(url.searchParams.get('maxPrice') || 1000);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    // 1. Check cache for Mock Data (Triggered by instruction)
    const cachedData = forceRefresh ? null : await getSessionValue(CACHE_KEY);
    if (cachedData) {
      try {
        const parsedCache = JSON.parse(cachedData);
        // Proceed with parsing cached data

        
        const ttl = getAdaptiveCacheTTL();
        const invalidPick = parsedCache.data?.topPicks?.some((p: any) => {
          const sl = Number(p.stopLoss);
          const tp = Number(p.takeProfit);
          return (sl > maxPrice || sl < minPrice) || (tp > maxPrice || tp < minPrice);
        });

        if (!invalidPick && (Date.now() - parsedCache.timestamp < ttl)) {
          return NextResponse.json({
            success: true,
            data: parsedCache.data,
            cached: true,
            generatedAt: parsedCache.timestamp,
            ttlMinutes: Math.round(ttl / 60000),
          });
        }
      } catch (e) {
        // Cache invalid, proceed
      }
    }

    // 2. Fetch the entire screened IDX list to pre-filter candidates in minPrice-maxPrice range
    let watchlist: any[] = [];
    const protocol = url.protocol;
    const host = request.headers.get('host') || url.host;
    try {
      const screenerUrl = `${protocol}//${host}/api/screener?mode=ai&minPrice=${minPrice}&maxPrice=${maxPrice}`;
      const screenerRes = await fetch(screenerUrl, { headers: request.headers });
      
      if (screenerRes.ok) {
        const screenerData = await screenerRes.json();
        watchlist = screenerData.data?.results || [];
      }
    } catch (e) {
      console.error('Oracle: Initial full-market pre-filter fetch failed:', e);
    }

    if (watchlist.length < 5) {
      console.log('Screened list is empty or < 5. Using predefined mid-cap list for Oracle.');
      const fallbackTickers = ['GOTO', 'BUKA', 'ELSA', 'BRMS', 'BKDP', 'SMCB', 'ANTM', 'INAF', 'TINS', 'ENRG', 'BUMI', 'GJTL', 'CPIN', 'PGEO', 'MAPA', 'MIDI', 'ESSA', 'DOID', 'MEDC', 'AKRA'];
      
      for (const ticker of fallbackTickers) {
        watchlist.push({ emiten: ticker, code: ticker });
      }
    }

    // Deduplicate watchlist by code
    const seen = new Set();
    watchlist = watchlist.filter((item: any) => {
      const code = item.emiten || item.code;
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    });

    // Take top 15 candidates to avoid rate-limiting the Stockbit API deep scan
    watchlist = watchlist.slice(0, 15);

    // Filter to strictly keep it in minPrice-maxPrice
    watchlist = watchlist.filter((stock: any) => {
      const p = Number(stock.price || stock.close);
      return p >= minPrice && p <= maxPrice;
    });

    if (watchlist.length < 5) {
      // Ultimate fallback: fetch REAL prices for known mid-cap tickers in 100-500 range
      console.log('All screeners < 5. Fetching real prices for mid-cap fallback tickers...');
      const fallbackTickers = ['GOTO', 'BUKA', 'ELSA', 'BRMS', 'BKDP', 'SMCB', 'ANTM', 'INAF', 'TINS', 'ENRG', 'BUMI', 'GJTL', 'CPIN'];
      const fallbackResults: any[] = [];
      
      for (const ticker of fallbackTickers) {
        if (fallbackResults.length >= 8) break; // Enough candidates
        try {
          const pData = await getPrice(ticker);
          if (pData.price > 0 && pData.price >= minPrice && pData.price <= maxPrice) {
            fallbackResults.push({
              emiten: ticker, code: ticker,
              price: pData.price,
              changePercent: pData.changePercent || 0,
              volumeRatio: 1, zScore: 0, ups: 50,
              trend: (pData.changePercent || 0) > 0 ? 'bullish' : 'sideways',
            });
          }
        } catch { /* skip */ }
      }
      
      // Merge with whatever we already have
      const existingCodes = new Set(watchlist.map((w: any) => w.emiten || w.code));
      for (const fb of fallbackResults) {
        if (!existingCodes.has(fb.emiten)) {
          watchlist.push(fb);
          existingCodes.add(fb.emiten);
        }
      }
    }

    // ── REAL-TIME PRICE ENRICHMENT ─────────────────────────────
    // Ensure every candidate has real market price (not stale Yahoo daily close)
    console.log(`[Oracle] Enriching ${watchlist.length} candidates with real brokermology data...`);
    
    // Helper for date formatting
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}-${mm}-${yyyy}`;

    const enriched = await Promise.all(
      watchlist.map(async (stock: any) => {
        const code = stock.emiten || stock.code;
        try {
          const pData = await getPrice(code);
          
          let upsScore = stock.ups || 50;
          let zScore = stock.zScore || 0;
          let topBuyers = stock.topBuyers || [];
          let topSellers = stock.topSellers || [];
          
          // If we don't have brokermology data (e.g. from fallback list), fetch it!
          if (!stock.topBuyers || stock.topBuyers.length === 0) {
            const md = await fetchMarketDetector(code, dateStr, dateStr).catch(() => null);
            const ob = await fetchOrderbook(code).catch(() => null);
            
            if (md && md.data && md.data.broker_summary) {
              const buyers = md.data.broker_summary.brokers_buy || [];
              const sellers = md.data.broker_summary.brokers_sell || [];
              
              topBuyers = buyers.slice(0, 5).map((b: any) => ({ code: b.netbs_broker_code, vol: b.bvol, val: b.bval }));
              topSellers = sellers.slice(0, 5).map((s: any) => ({ code: s.netbs_broker_code, vol: s.svol, val: s.sval }));
              
              // Compute whaleNetValue and brokerConsistency
              let whaleNetValue = 0;
              let brokerConsistency = 50;
              for (let j = 0; j < Math.min(3, buyers.length); j++) {
                  const bCode = buyers[j].netbs_broker_code;
                  const profile = getBrokerProfile(bCode);
                  if (profile.character === 'institutional_accumulator' || profile.character === 'foreign_flow') {
                      whaleNetValue += parseFloat(buyers[j].bval || '0');
                      brokerConsistency += 10;
                  }
              }
              for (let j = 0; j < Math.min(3, sellers.length); j++) {
                  const sCode = sellers[j].netbs_broker_code;
                  const profile = getBrokerProfile(sCode);
                  if (profile.character === 'institutional_accumulator' || profile.character === 'foreign_flow') {
                      whaleNetValue -= parseFloat(sellers[j].sval || '0');
                      brokerConsistency -= 10;
                  }
              }

              const bidVol = ob ? parseInt(ob.data.total_bid_offer?.bid?.lot || '1') : 1;
              const offerVol = ob ? parseInt(ob.data.total_bid_offer?.offer?.lot || '1') : 1;
              const hakaRatio = bidVol / (bidVol + offerVol);

              // Compute UPS with whatever we can infer
              const ups = calculateUPS({
                rsiValue: 50, // default if no TA
                macdHistogram: 0,
                trendDirection: (pData?.changePercent || 0) > 0 ? 'uptrend' : 'sideways',
                whaleNetValue,
                brokerConsistency,
                zScore: 0,
                hakaRatio
              });
              
              upsScore = ups.total;
            }
          }
          
          if (pData.price > 0) {
            return {
              ...stock,
              emiten: code,
              price: pData.price,
              changePercent: pData.changePercent ?? stock.changePercent ?? 0,
              ups: upsScore,
              zScore: zScore,
              topBuyers,
              topSellers,
              _priceSource: pData.source,
            };
          }
        } catch (err) { 
          console.error(`[Oracle] Failed to enrich ${code}`, err);
        }
        return { ...stock, emiten: code };
      })
    );

    // Re-filter after enrichment (real price might be outside range)
    // Also apply Foreign Whale Distribution filter per oracle.md spec
    const finalCandidates = enriched.filter((stock: any) => {
      const p = Number(stock.price);
      if (p < minPrice || p > maxPrice || p <= 0) return false;

      // ── FOREIGN WHALE DISTRIBUTION FILTER (oracle.md §2 & §3) ──
      // Calculate net foreign sell vs net foreign buy to detect distribution
      let foreignNetBuy = 0;
      let foreignNetSell = 0;

      if (stock.topBuyers) {
        for (const buyer of stock.topBuyers.slice(0, 5)) {
          const profile = getBrokerProfile(buyer.code);
          if (profile.character === 'foreign_flow') {
            foreignNetBuy += parseFloat(buyer.val || '0');
          }
        }
      }
      if (stock.topSellers) {
        for (const seller of stock.topSellers.slice(0, 5)) {
          const profile = getBrokerProfile(seller.code);
          if (profile.character === 'foreign_flow') {
            foreignNetSell += parseFloat(seller.val || '0');
          }
        }
      }

      // If foreign sell > foreign buy → distribution masif → REJECT
      if (foreignNetSell > 0 && foreignNetSell > foreignNetBuy) {
        console.log(`[Oracle] ❌ FILTERING OUT ${stock.emiten} — Foreign Whale Distribution detected (sell: ${(foreignNetSell/1e6).toFixed(1)}M > buy: ${(foreignNetBuy/1e6).toFixed(1)}M)`);
        return false;
      }

      // Tag remaining stocks with foreign flow metadata for AI synthesis
      stock.foreignNetBuy = foreignNetBuy;
      stock.foreignNetSell = foreignNetSell;
      stock.foreignDistributionFlag = foreignNetSell > foreignNetBuy * 0.5
        ? 'CAUTION: Significant foreign selling pressure detected'
        : foreignNetBuy > 0
          ? 'POSITIVE: Foreign accumulation confirmed'
          : 'NEUTRAL: No significant foreign activity';

      return true;
    });

    if (finalCandidates.length === 0) {
      throw new Error(`No candidates found in the ${minPrice}-${maxPrice} price range after real-time enrichment`);
    }

    // 4. Generate analysis using quantitative engine (no external API)
    const oracleResult = await generateOraclePicks(finalCandidates);

    if (!oracleResult) {
      throw new Error('Oracle failed to generate valid analysis');
    }

    // 4. Cache the successful result
    const ttl = getAdaptiveCacheTTL();
    const now = Date.now();
    const cachePayload = {
      timestamp: now,
      data: oracleResult
    };
    await upsertSession(CACHE_KEY, JSON.stringify(cachePayload), new Date(now + ttl));

    return NextResponse.json({
      success: true,
      data: oracleResult,
      cached: false,
      generatedAt: now,
      ttlMinutes: Math.round(ttl / 60000),
    });

  } catch (error: any) {
    console.error('Oracle Route Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

