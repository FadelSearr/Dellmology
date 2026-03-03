import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fallbackEmptyMeta, sourceMeta } from '@/lib/source-adapter';

// Initialize Supabase client with fallbacks for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !supabaseUrl.includes('placeholder.supabase.co') &&
  supabaseKey !== 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

export const runtime = 'nodejs';
export const maxDuration = 60;

interface HeatmapDataPoint {
  time: string;
  symbol: string;
  price: number;
  bid_volume: number;
  ask_volume: number;
  net_volume: number;
  bid_ask_ratio: number;
  intensity: number;
  trade_count: number;
}

interface MarketDepth {
  time: string;
  symbol: string;
  bid_levels: Record<string, number>;
  ask_levels: Record<string, number>;
  total_bid_volume: number;
  total_ask_volume: number;
  mid_price: number;
  bid_ask_spread: number;
  spread_bps: number;
}

interface Anomaly {
  time: string;
  symbol: string;
  anomaly_type: string;
  price: number;
  volume: number;
  severity: string;
  description: string;
}

interface HAKAHAKIData {
  time: string;
  symbol: string;
  haka_volume: number;
  haki_volume: number;
  haka_ratio: number;
  dominance: string;
  net_pressure: number;
}

/**
 * GET /api/order-flow-heatmap?symbol=BBCA&minutes=60
 *
 * Returns order flow heatmap data for visualization
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const minutes = parseInt(searchParams.get('minutes') || '60', 10);
    const includeAnomalies = searchParams.get('anomalies') === 'true';

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json(
        {
          symbol,
          timestamp: new Date().toISOString(),
          heatmap: { prices: [], bidVolumes: [], askVolumes: [], netVolumes: [], bidAskRatios: [], intensities: [] },
          marketDepth: null,
          hakaHaki: null,
          anomalies: [],
          stats: {
            totalDataPoints: 0,
            minPrice: 0,
            maxPrice: 0,
            avgIntensity: 0,
            anomalyCount: 0,
          },
          degraded: true,
          reason: 'Supabase is not configured; using graceful fallback payload',
          data_source: sourceMeta({
            provider: 'FALLBACK_EMPTY',
            degraded: true,
            reason: 'Supabase is not configured; using graceful fallback payload',
            fallbackDelayMinutes: 15,
          }),
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
            'Content-Type': 'application/json',
          },
        },
      );
    }

    // Fetch order flow heatmap data
    const { data: heatmapData, error: heatmapError } = await supabase
      .from('order_flow_heatmap')
      .select('*')
      .eq('symbol', symbol)
      .gte('time', new Date(Date.now() - minutes * 60000).toISOString())
      .order('time', { ascending: false })
      .limit(500);

    if (heatmapError) {
      console.error('Heatmap fetch error:', heatmapError);
      // Return graceful empty data instead of 500 error
      return NextResponse.json(
        {
          symbol,
          timestamp: new Date().toISOString(),
          heatmap: { prices: [], bidVolumes: [], askVolumes: [], netVolumes: [], bidAskRatios: [], intensities: [] },
          marketDepth: null,
          hakaHaki: null,
          anomalies: [],
          stats: {
            totalDataPoints: 0,
            minPrice: 0,
            maxPrice: 0,
            avgIntensity: 0,
            anomalyCount: 0,
          },
          data_source: fallbackEmptyMeta('Heatmap query failed'),
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Fetch market depth
    const { data: depthData, error: depthError } = await supabase
      .from('market_depth')
      .select('*')
      .eq('symbol', symbol)
      .gte('time', new Date(Date.now() - 5 * 60000).toISOString())
      .order('time', { ascending: false })
      .limit(50);

    if (depthError) {
      console.error('Market depth fetch error:', depthError);
    }

    // Fetch HAKA/HAKI summary
    const { data: hakaHakiData, error: hakaHakiError } = await supabase
      .from('haka_haki_summary')
      .select('*')
      .eq('symbol', symbol)
      .gte('time', new Date(Date.now() - minutes * 60000).toISOString())
      .order('time', { ascending: false })
      .limit(200);

    if (hakaHakiError) {
      console.error('HAKA/HAKI fetch error:', hakaHakiError);
    }

    // Fetch anomalies if requested
    let anomalies: Anomaly[] = [];
    if (includeAnomalies) {
      const { data: anomalyData, error: anomalyError } = await supabase
        .from('order_flow_anomalies')
        .select('*')
        .eq('symbol', symbol)
        .gte('time', new Date(Date.now() - minutes * 60000).toISOString())
        .order('time', { ascending: false })
        .limit(100);

      if (anomalyError) {
        console.error('Anomaly fetch error:', anomalyError);
      } else if (anomalyData) {
        anomalies = anomalyData as Anomaly[];
      }
    }

    // Aggregate heatmap data into price bins
    const bins = aggregateHeatmap(heatmapData as HeatmapDataPoint[]);

    // Cache headers: 15 seconds revalidate, 60 seconds stale-while-revalidate
    return NextResponse.json(
      {
        symbol,
        timestamp: new Date().toISOString(),
        heatmap: bins,
        marketDepth: depthData ? depthData[0] : null,
        hakaHaki: hakaHakiData && hakaHakiData.length > 0 ? hakaHakiData[0] : null,
        anomalies: anomalies.slice(0, 50),
        stats: {
          totalDataPoints: heatmapData?.length || 0,
          minPrice: getMinPrice(heatmapData as HeatmapDataPoint[]),
          maxPrice: getMaxPrice(heatmapData as HeatmapDataPoint[]),
          avgIntensity: getAvgIntensity(heatmapData as HeatmapDataPoint[]),
          anomalyCount: anomalies.length,
        },
        data_source: sourceMeta({
          provider: 'SUPABASE',
          degraded: false,
          reason: null,
          fallbackDelayMinutes: 0,
        }),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Order flow heatmap API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        data_source: fallbackEmptyMeta('Order flow heatmap internal error'),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/order-flow-heatmap
 *
 * Insert order flow heatmap data (for local testing/development)
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json(
        { error: 'Supabase is not configured' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { symbol, price, bid_volume, ask_volume, bid_ask_ratio, intensity } = body;

    if (!symbol || price === undefined) {
      return NextResponse.json(
        { error: 'Symbol and price are required' },
        { status: 400 }
      );
    }

    const net_volume = bid_volume - ask_volume;

    const { data, error } = await supabase
      .from('order_flow_heatmap')
      .insert({
        time: new Date().toISOString(),
        symbol: symbol.toUpperCase(),
        price: parseFloat(price),
        bid_volume: parseInt(bid_volume || '0', 10),
        ask_volume: parseInt(ask_volume || '0', 10),
        net_volume: parseInt(String(net_volume) || '0', 10),
        bid_ask_ratio: parseFloat(bid_ask_ratio || '1.0'),
        intensity: parseFloat(intensity || '0.5'),
        trade_count: 0,
      } as any)
      .select();

    if (error) {
      console.error('Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to insert heatmap data' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions

function aggregateHeatmap(
  data: HeatmapDataPoint[]
): Array<{ price: number; timestamp: string; bid: number; ask: number; ratio: number; intensity: number }> {
  if (!data || data.length === 0) {
    return [];
  }

  // Group by price level
  const priceGroups: Record<number, HeatmapDataPoint[]> = {};

  for (const point of data) {
    const price = Math.round(point.price * 100) / 100;
    if (!priceGroups[price]) {
      priceGroups[price] = [];
    }
    priceGroups[price].push(point);
  }

  // Aggregate each price group
  return Object.entries(priceGroups)
    .map(([priceStr, points]) => {
      const price = parseFloat(priceStr);
      const avgBid =
        points.reduce((sum, p) => sum + p.bid_volume, 0) / points.length;
      const avgAsk =
        points.reduce((sum, p) => sum + p.ask_volume, 0) / points.length;
      const avgRatio =
        points.reduce((sum, p) => sum + p.bid_ask_ratio, 0) / points.length;
      const avgIntensity =
        points.reduce((sum, p) => sum + p.intensity, 0) / points.length;
      const latestTime = new Date(
        Math.max(...points.map(p => new Date(p.time).getTime()))
      ).toISOString();

      return {
        price,
        timestamp: latestTime,
        bid: Math.round(avgBid),
        ask: Math.round(avgAsk),
        ratio: parseFloat(avgRatio.toFixed(3)),
        intensity: parseFloat(avgIntensity.toFixed(3)),
      };
    })
    .sort((a, b) => b.price - a.price);
}

function getMinPrice(data: HeatmapDataPoint[]): number {
  if (!data || data.length === 0) return 0;
  return Math.min(...data.map(d => d.price));
}

function getMaxPrice(data: HeatmapDataPoint[]): number {
  if (!data || data.length === 0) return 0;
  return Math.max(...data.map(d => d.price));
}

function getAvgIntensity(data: HeatmapDataPoint[]): number {
  if (!data || data.length === 0) return 0;
  const sum = data.reduce((acc, d) => acc + d.intensity, 0);
  return parseFloat((sum / data.length).toFixed(3));
}
