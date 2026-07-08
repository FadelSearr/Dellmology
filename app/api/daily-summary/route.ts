import { NextResponse } from 'next/server';

// ══════════════════════════════════════════════════════════════
// /api/daily-summary — Aggregated Daily Intelligence Endpoint
//
// Designed for ZeroClaw (AI Orchestrator) to pull a full snapshot
// of market intelligence in a single call. Powers Daily Briefing.
//
// TTL: 60 minutes (data refreshed at most once per hour)
// ══════════════════════════════════════════════════════════════

interface SummaryCache {
  data: DailySummary;
  ts: number;
}

interface DailySummary {
  generatedAt: string;
  dateWIB: string;
  marketStatus: 'open' | 'closed' | 'pre' | 'post';
  marketBreadth: {
    advance: number;
    decline: number;
    ratio: string;
    foreignNetBillion: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
  };
  oraclePicks: any[];
  screenerTopMovers: any[];
  macro: any[];
  summary: string;
}

let summaryCache: SummaryCache | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

function getMarketStatus(): 'open' | 'closed' | 'pre' | 'post' {
  const hourWIB = (new Date().getUTCHours() + 7) % 24;
  const minWIB  = new Date().getUTCMinutes();
  const totalMin = hourWIB * 60 + minWIB;
  const dayOfWeek = new Date().getUTCDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'closed';
  if (totalMin < 9 * 60)            return 'pre';
  if (totalMin >= 9 * 60 && totalMin < 16 * 60) return 'open';
  return 'post';
}

export async function GET(request: Request) {
  // Honour cache unless ?refresh=true
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!forceRefresh && summaryCache && Date.now() - summaryCache.ts < CACHE_TTL) {
    return NextResponse.json({ success: true, cached: true, data: summaryCache.data });
  }

  const base = `http://localhost:${process.env.PORT || 3000}`;
  const marketStatus = getMarketStatus();
  const dateWIB = new Date(Date.now() + 7 * 3600_000).toISOString().split('T')[0];

  // ── Parallel fetches ─────────────────────────────────────────
  const [breadthRes, oracleRes, screenerRes, macroRes] = await Promise.allSettled([
    fetch(`${base}/api/breadth`).then(r => r.json()),
    fetch(`${base}/api/oracle`).then(r => r.json()),
    fetch(`${base}/api/screener?mode=daytrade`).then(r => r.json()),
    fetch(`${base}/api/macro`).then(r => r.json()),
  ]);

  // ── Market Breadth ───────────────────────────────────────────
  const breadth = breadthRes.status === 'fulfilled' ? breadthRes.value?.data : null;
  const advance = breadth?.advance ?? 420;
  const decline = breadth?.decline ?? 380;
  const foreignNetBillion = breadth?.foreignNet ? breadth.foreignNet / 1e9 : 0;
  const adRatio = decline > 0 ? advance / decline : 1;
  const breadthSentiment: 'bullish' | 'bearish' | 'neutral' =
    adRatio > 1.2 ? 'bullish' : adRatio < 0.8 ? 'bearish' : 'neutral';

  // ── Oracle Picks ─────────────────────────────────────────────
  const oracleData = oracleRes.status === 'fulfilled' ? oracleRes.value : null;
  const oraclePicks = oracleData?.candidates?.slice(0, 5) ?? [];

  // ── Screener Top Movers ──────────────────────────────────────
  const screenerData = screenerRes.status === 'fulfilled' ? screenerRes.value : null;
  const screenerTopMovers = (screenerData?.data?.results ?? [])
    .slice(0, 10)
    .map((s: any) => ({
      code:          s.code,
      price:         s.price,
      changePercent: s.changePercent,
      valueBillion:  s.valueBillion,
      dayScore:      s.dayScore,
    }));

  // ── Macro Indicators ─────────────────────────────────────────
  const macroData = macroRes.status === 'fulfilled' ? macroRes.value?.data ?? [] : [];
  const macro = macroData.slice(0, 5).map((m: any) => ({
    id:            m.id,
    name:          m.name,
    price:         m.price,
    percentChange: m.percentChange,
  }));

  // ── Plain-text summary for LLM context ──────────────────────
  const topOracle = oraclePicks[0];
  const summary = [
    `Tanggal: ${dateWIB}. Status pasar: ${marketStatus}.`,
    `Market breadth: ${advance} advance / ${decline} decline (A/D ratio: ${adRatio.toFixed(2)}). Sentimen: ${breadthSentiment}.`,
    `Foreign net flow: ${foreignNetBillion >= 0 ? '+' : ''}${foreignNetBillion.toFixed(1)}B IDR.`,
    topOracle
      ? `Oracle pick utama: ${topOracle.code} — ${topOracle.narrative?.substring(0, 120) ?? 'N/A'}`
      : 'Oracle picks tidak tersedia.',
    screenerTopMovers.length > 0
      ? `Top mover hari ini: ${screenerTopMovers.slice(0, 3).map((s: any) => `${s.code} (${s.changePercent > 0 ? '+' : ''}${s.changePercent}%)`).join(', ')}.`
      : 'Data screener tidak tersedia.',
  ].join(' ');

  const result: DailySummary = {
    generatedAt:  new Date().toISOString(),
    dateWIB,
    marketStatus,
    marketBreadth: {
      advance,
      decline,
      ratio:              adRatio.toFixed(2),
      foreignNetBillion:  parseFloat(foreignNetBillion.toFixed(2)),
      sentiment:          breadthSentiment,
    },
    oraclePicks,
    screenerTopMovers,
    macro,
    summary,
  };

  summaryCache = { data: result, ts: Date.now() };

  return NextResponse.json({ success: true, cached: false, data: result });
}
