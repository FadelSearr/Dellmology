import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketDetector } from '@/lib/stockbit';
import { getBrokerProfile } from '@/lib/broker-profiles';
import { rateLimit } from '@/lib/rateLimit';

/* ══════════════════════════════════════════════════════════════
   Broker History API — Multi-Day Broker Flow Heatmap
   
   Fetches broker accumulation/distribution data for the past
   5 trading days to build a consistency heatmap.
   ══════════════════════════════════════════════════════════════ */

// In-memory cache: key = "EMITEN", value = { data, ts }
const HISTORY_CACHE = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes (broker data doesn't change intraday much)

function getTradingDays(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  let daysBack = 0;

  while (dates.length < count) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysBack);
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) {
      dates.push(d.toISOString().split('T')[0]);
    }
    daysBack++;
    if (daysBack > 14) break; // safety limit
  }

  return dates.reverse(); // oldest first
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = rateLimit(request, 20, 60);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten');
  if (!emiten) {
    return NextResponse.json({ success: false, error: 'emiten is required' }, { status: 400 });
  }

  // Check cache
  const cached = HISTORY_CACHE.get(emiten);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ success: true, data: cached.data });
  }

  try {
    const tradingDays = getTradingDays(5);
    
    // Fetch broker data for each day concurrently
    const dayResults = await Promise.allSettled(
      tradingDays.map(async (date) => {
        const md = await fetchMarketDetector(emiten, date, date);
        const buyers = md?.data?.broker_summary?.brokers_buy || [];
        const sellers = md?.data?.broker_summary?.brokers_sell || [];
        return { date, buyers, sellers };
      })
    );

    // Build broker-centric view: { brokerCode -> [day1_net, day2_net, ...] }
    const brokerMap = new Map<string, {
      code: string;
      name: string;
      label: string;
      color: string;
      character: string;
      dailyNet: number[];   // net value per day (positive = accum, negative = dist)
      totalNet: number;
      consistentDays: number; // how many days in same direction
    }>();

    const days: string[] = [];

    dayResults.forEach((result, dayIdx) => {
      if (result.status !== 'fulfilled') return;
      const { date, buyers, sellers } = result.value;
      days.push(date);

      // Process buyers
      buyers.forEach((b: any) => {
        const code = b.netbs_broker_code || '';
        if (!code) return;
        const bval = parseFloat(b.bval || '0');
        const sval = parseFloat(b.sval || '0');
        const net = bval - sval;

        if (!brokerMap.has(code)) {
          const profile = getBrokerProfile(code);
          brokerMap.set(code, {
            code,
            name: profile.name,
            label: profile.label,
            color: profile.color,
            character: profile.character,
            dailyNet: new Array(tradingDays.length).fill(0),
            totalNet: 0,
            consistentDays: 0,
          });
        }
        const entry = brokerMap.get(code)!;
        entry.dailyNet[dayIdx] = net;
        entry.totalNet += net;
      });

      // Process sellers
      sellers.forEach((s: any) => {
        const code = s.netbs_broker_code || '';
        if (!code) return;
        const bval = parseFloat(s.bval || '0');
        const sval = parseFloat(s.sval || '0');
        const net = bval - sval;

        if (!brokerMap.has(code)) {
          const profile = getBrokerProfile(code);
          brokerMap.set(code, {
            code,
            name: profile.name,
            label: profile.label,
            color: profile.color,
            character: profile.character,
            dailyNet: new Array(tradingDays.length).fill(0),
            totalNet: 0,
            consistentDays: 0,
          });
        }
        const entry = brokerMap.get(code)!;
        if (entry.dailyNet[dayIdx] === 0) { // Only set if not already set by buyers
          entry.dailyNet[dayIdx] = net;
          entry.totalNet += net;
        }
      });
    });

    // Calculate consistency
    brokerMap.forEach((entry) => {
      const direction = entry.totalNet >= 0 ? 1 : -1;
      entry.consistentDays = entry.dailyNet.filter(n => {
        return direction === 1 ? n > 0 : n < 0;
      }).length;
    });

    // Sort by absolute total net value and take top 10
    const brokers = Array.from(brokerMap.values())
      .sort((a, b) => Math.abs(b.totalNet) - Math.abs(a.totalNet))
      .slice(0, 10);

    const responseData = { days, brokers };
    HISTORY_CACHE.set(emiten, { data: responseData, ts: Date.now() });

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
