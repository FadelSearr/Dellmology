import { NextRequest, NextResponse } from 'next/server';
import { detectPatterns } from '@/lib/pattern-detector';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten') || 'BBRI';

  try {
    // Fetch OHLCV from Yahoo Finance
    const symbol = `${emiten}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Yahoo Finance unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ success: false, error: 'No chart data' }, { status: 404 });
    }

    const timestamps = result.timestamp || [];
    const q = result.indicators.quote[0];

    const bars = timestamps
      .map((ts: number, i: number) => ({
        time: ts,
        open: q.open[i] ?? 0,
        high: q.high[i] ?? 0,
        low: q.low[i] ?? 0,
        close: q.close[i] ?? 0,
        volume: q.volume[i] ?? 0,
      }))
      .filter((b: any) => b.close > 0 && b.open > 0);

    const patterns = detectPatterns(bars);

    // Also try calling Python CNN worker if available
    let cnnResult = null;
    try {
      const cnnRes = await fetch('http://localhost:8002/analyze/timeseries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bars),
        signal: AbortSignal.timeout(3000),
      });
      if (cnnRes.ok) {
        cnnResult = await cnnRes.json();
      }
    } catch {
      // CNN worker offline — use TypeScript patterns only
    }

    return NextResponse.json({
      success: true,
      data: {
        emiten,
        patterns,
        cnnResult,
        totalBars: bars.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
