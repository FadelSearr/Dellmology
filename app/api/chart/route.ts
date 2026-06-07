import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten');
  const timeframe = searchParams.get('tf') || '1D';
  
  if (!emiten) {
    return NextResponse.json({ success: false, error: 'emiten is required' }, { status: 400 });
  }

  try {
    // ── Map Timeframes to Yahoo Finance intervals ────────────
    let interval = '1d';
    let range = '6mo';
    
    switch (timeframe) {
      case '1m':  interval = '1m'; range = '1d'; break;
      case '5m':  interval = '5m'; range = '5d'; break;
      case '15m': interval = '15m'; range = '5d'; break;
      case '30m': interval = '30m'; range = '1mo'; break;
      case '1H':  interval = '60m'; range = '1mo'; break;
      case '4H':  interval = '60m'; range = '3mo'; break; // Yahoo has no 4h, we will aggregate 60m
      case '1W':  interval = '1wk'; range = '2y'; break;
      case '1D':
      default:    interval = '1d'; range = '6mo'; break;
    }

    // Fetch from Yahoo Finance (public V8 chart endpoint)
    // Yahoo requires .JK for IDX stocks, but indices like ^JKSE should be passed as is
    const symbol = emiten.startsWith('^') ? emiten : `${emiten}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch chart data from Yahoo: ${res.status}`);
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      throw new Error('No chart data found');
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];

    // Map to Lightweight Charts format
    let chartData = timestamps.map((ts: number, i: number) => ({
      time: ts, // Unix timestamp in seconds
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      value: quote.volume[i] // Lightweight Charts often uses 'value' for volume histograms
    })).filter((item: { open: number | null, close: number | null }) => item.open !== null && item.close !== null); // Filter out empty days

    // ── 4H Aggregation Logic ─────────────────────────────────
    if (timeframe === '4H' && chartData.length > 0) {
      const aggregated = [];
      let currentBar = null;
      let barCount = 0;

      for (const bar of chartData) {
        if (!currentBar) {
          currentBar = { ...bar };
          barCount = 1;
        } else {
          currentBar.high = Math.max(currentBar.high, bar.high);
          currentBar.low = Math.min(currentBar.low, bar.low);
          currentBar.close = bar.close;
          currentBar.value += bar.value;
          barCount++;
        }

        // Complete 4H bar after 4 hours, or at end of loop
        if (barCount >= 4) {
          aggregated.push(currentBar);
          currentBar = null;
          barCount = 0;
        }
      }
      if (currentBar) aggregated.push(currentBar); // push remaining
      chartData = aggregated;
    }

    // Calculate 14-day ATR (Average True Range)
    let atr = 0;
    if (chartData.length >= 15) {
      const trs = [];
      for (let i = 1; i < chartData.length; i++) {
        const current = chartData[i];
        const prev = chartData[i - 1];
        const tr1 = current.high - current.low;
        const tr2 = Math.abs(current.high - prev.close);
        const tr3 = Math.abs(current.low - prev.close);
        const trueRange = Math.max(tr1, tr2, tr3);
        trs.push(trueRange);
      }
      // Simple 14-day moving average of TR
      const last14Trs = trs.slice(-14);
      atr = last14Trs.reduce((a, b) => a + b, 0) / 14;
    }

    return NextResponse.json({
      success: true,
      data: {
        chartData,
        atr: Math.round(atr)
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
