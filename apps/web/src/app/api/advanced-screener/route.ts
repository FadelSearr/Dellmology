import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8003';

export interface StockScore {
  symbol: string;
  score: number;
  rank: number;
  technical_score: number;
  flow_score: number;
  pressure_score: number;
  volatility_score: number;
  anomaly_score: number;
  current_price: number;
  volatility_percent: number;
  haka_ratio: number;
  broker_net_value: number;
  risk_reward_ratio: number;
  recommendation: string;
  reason: string;
  pattern_matches: string[];
  anomalies_detected: string[];
}

export interface ScreeningResult {
  mode: string;
  timestamp: string;
  total_scanned: number;
  results: StockScore[];
  top_pick: StockScore | null;
  statistics: {
    avg_score: number;
    max_score: number;
    min_score: number;
    bullish_count: number;
    bearish_count: number;
    avg_volatility: number;
    avg_rr_ratio: number;
  };
}

/**
 * POST /api/advanced-screener
 * Run advanced multi-factor stock screening
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode || 'DAYTRADE';
    const minScore = body.minScore || 0.6;

    // Call ML engine screener API (cache request for 15 seconds)
    const response = await fetch(`${ML_ENGINE_URL}/api/screen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        mode,
        min_score: minScore,
        include_analysis: true,
      }),
      cache: 'force-cache',
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        {
          error: 'Screening failed',
          details: errorData,
        },
        { status: response.status }
      );
    }

    const data: ScreeningResult = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error running screening:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/advanced-screener?mode=DAYTRADE
 * Get current screening results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'DAYTRADE';
    const minScore = parseFloat(searchParams.get('minScore') || '0.6');

    // Call ML engine (edge cache for 15 seconds)
    const response = await fetch(
      `${ML_ENGINE_URL}/api/screen?mode=${mode}&min_score=${minScore}`,
      {
        headers: {
          'accept': 'application/json',
        },
        cache: 'force-cache',
        next: { revalidate: 15 },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch screening results');
    }

    const data: ScreeningResult = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching screening results:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
