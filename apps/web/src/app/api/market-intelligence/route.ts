import { NextResponse } from 'next/server';
import { resolveMarketIntelligence } from '@/lib/market-intelligence-adapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/market-intelligence?symbol=BBCA&timeframe=1h
 * Returns real-time market intelligence data:
 * - HAKA/HAKI ratio
 * - Buy/Sell volume
 * - Order flow heatmap data
 * - Volatility metrics
 * - UPS (Unified Power Score)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BBCA';
    const timeframe = searchParams.get('timeframe') || '1h';
    const fallbackDelayMinutes = 15;

    const timeWindows: { [key: string]: string } = {
      '15m': '15 minutes',
      '1h': '1 hour',
      '4h': '4 hours',
      '1d': '1 day'
    };

    const window = timeWindows[timeframe] || '1 hour';
    const { payload, dataSource } = await resolveMarketIntelligence({
      symbol,
      timeframeWindow: window,
      fallbackDelayMinutes,
    });

    if (!payload) {
      return NextResponse.json(
        {
          error: 'No market data available from primary or fallback source',
          data_source: dataSource,
        },
        { status: 404 },
      );
    }

    const { metrics, volatility, upsScore, signal } = payload;

    return NextResponse.json({
      symbol,
      timeframe,
      metrics,
      volatility,
      unified_power_score: {
        score: Math.round(upsScore),
        signal,
        components: {
          haka_strength: Math.min((metrics.haka_ratio / 50) * 40, 40),
          volume_momentum: Math.min((metrics.total_volume / 10000) * 30, 30),
          price_strength: Math.min(Math.abs(metrics.pressure_index) / 2.5, 20),
          consistency: (metrics.haka_count / (metrics.haka_count + metrics.haki_count || 1)) * 10,
        }
      },
      data_source: dataSource,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching market intelligence:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market intelligence data' },
      { status: 500 }
    );
  }
}
