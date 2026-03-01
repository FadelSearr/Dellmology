import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface OrderFlowHeatmapData {
  timestamp: string;
  prices: number[];
  bidVolumes: number[];
  askVolumes: number[];
  netVolumes: number[];
  bidAskRatios: number[];
  intensities: number[];
}

interface MarketDepthData {
  symbol: string;
  timestamp: string;
  bidLevels: Array<{ price: number; volume: number }>;
  askLevels: Array<{ price: number; volume: number }>;
  totalBidVolume: number;
  totalAskVolume: number;
  midPrice: number;
  bidAskSpread: number;
  spreadBps: number;
}

/**
 * GET /api/order-flow-heatmap?symbol=BBCA
 * Retrieves order flow heatmap data for the specified symbol
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BBCA';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const aggregate = searchParams.get('aggregate') === 'true'; // use 1min continuous aggregate

    // Get heatmap data (optionally from aggregated view)
    let heatmapResult;
    if (aggregate) {
      heatmapResult = await db.query(
        `SELECT bucket as timestamp, price, avg_bid_vol as bid_volume, avg_ask_vol as ask_volume,
                avg_net_vol as net_volume, avg_ratio as bid_ask_ratio, avg_intensity as intensity
         FROM order_flow_heatmap_1min
         WHERE symbol = $1
         ORDER BY bucket DESC, price ASC
         LIMIT $2`,
        [symbol, limit]
      );
    } else {
      heatmapResult = await db.query(
        `SELECT timestamp, price, bid_volume, ask_volume, net_volume, bid_ask_ratio, intensity
         FROM order_flow_heatmap
         WHERE symbol = $1
         ORDER BY timestamp DESC, price ASC
         LIMIT $2`,
        [symbol, limit]
      );
    }

    const heatmapData: OrderFlowHeatmapData = {
      timestamp: new Date().toISOString(),
      prices: [],
      bidVolumes: [],
      askVolumes: [],
      netVolumes: [],
      bidAskRatios: [],
      intensities: [],
    };

    const priceMap = new Map<number, any>();

    for (const row of heatmapResult.rows) {
      if (!priceMap.has(row.price)) {
        priceMap.set(row.price, {
          price: row.price,
          bidVolume: 0,
          askVolume: 0,
          netVolume: 0,
          bidAskRatio: 1,
          intensity: 0,
        });
      }
      const item = priceMap.get(row.price)!;
      item.bidVolume = Math.max(item.bidVolume, row.bid_volume);
      item.askVolume = Math.max(item.askVolume, row.ask_volume);
      item.netVolume = Math.max(item.netVolume, row.net_volume);
      item.bidAskRatio = Math.max(item.bidAskRatio, row.bid_ask_ratio);
      item.intensity = Math.max(item.intensity, row.intensity);
    }

    // Sort by price
    const sorted = Array.from(priceMap.values()).sort(
      (a, b) => a.price - b.price
    );

    for (const item of sorted) {
      heatmapData.prices.push(item.price);
      heatmapData.bidVolumes.push(item.bidVolume);
      heatmapData.askVolumes.push(item.askVolume);
      heatmapData.netVolumes.push(item.netVolume);
      heatmapData.bidAskRatios.push(item.bidAskRatio);
      heatmapData.intensities.push(item.intensity);
    }

    // Get latest market depth
    const depthResult = await db.query(
      `SELECT timestamp, bid_levels, ask_levels, total_bid_volume, total_ask_volume, 
              mid_price, bid_ask_spread, spread_bps
       FROM market_depth
       WHERE symbol = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [symbol]
    );

    let marketDepth: MarketDepthData | null = null;
    if (depthResult.rows.length > 0) {
      const row = depthResult.rows[0];
      marketDepth = {
        symbol,
        timestamp: row.timestamp,
        bidLevels: JSON.parse(row.bid_levels),
        askLevels: JSON.parse(row.ask_levels),
        totalBidVolume: row.total_bid_volume,
        totalAskVolume: row.total_ask_volume,
        midPrice: parseFloat(row.mid_price),
        bidAskSpread: parseFloat(row.bid_ask_spread),
        spreadBps: row.spread_bps,
      };
    }

    // Get anomalies
    const anomaliesResult = await db.query(
      `SELECT timestamp, anomaly_type, price, volume, severity, description
       FROM order_flow_anomalies
       WHERE symbol = $1
       ORDER BY timestamp DESC
       LIMIT 20`,
      [symbol]
    );

    return NextResponse.json({
      success: true,
      symbol,
      aggregate,
      heatmap: heatmapData,
      marketDepth,
      anomalies: anomaliesResult.rows.map((row) => ({
        timestamp: row.timestamp,
        type: row.anomaly_type,
        price: parseFloat(row.price),
        volume: row.volume,
        severity: row.severity,
        description: row.description,
      })),
      timestamp: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('Error fetching order flow heatmap:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
