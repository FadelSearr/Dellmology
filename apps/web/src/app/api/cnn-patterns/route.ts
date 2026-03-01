import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8002';

export interface CnnPattern {
  symbol: string;
  pattern_name: string;
  pattern_type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  start_date: string;
  end_date: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  pattern_description: string;
  technical_score: number;
}

export interface CnnPatternsResponse {
  symbol: string;
  timestamp: string;
  detected_patterns: CnnPattern[];
  total_patterns: number;
  bullish_count: number;
  bearish_count: number;
  confidence_distribution: {
    high: number;      // >= 0.8
    medium: number;    // 0.6-0.8
    low: number;       // < 0.6
  };
}

/**
 * GET /api/cnn-patterns?symbol=BBCA&lookback=100&min_confidence=0.6
 * Detects technical patterns using CNN
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BBCA';
    const lookback = parseInt(searchParams.get('lookback') || '100', 10);
    const minConfidence = parseFloat(
      searchParams.get('min_confidence') || '0.6'
    );

    // Call ML engine (edge cache for 30s)
    const response = await fetch(
      `${ML_ENGINE_URL}/api/detect-patterns?symbol=${symbol}&lookback=${lookback}&min_confidence=${minConfidence}`,
      {
        headers: {
          'accept': 'application/json',
        },
        cache: 'force-cache',
        next: { revalidate: 30 },
      }
    );

    if (!response.ok) {
      const errorBody = await response.json();
      return NextResponse.json(
        {
          error: 'Failed to detect patterns from ML engine',
          details: errorBody,
        },
        { status: response.status }
      );
    }

    const data: CnnPatternsResponse = await response.json();

    // Calculate confidence distribution
    const confidenceDistribution = {
      high: data.detected_patterns.filter((p) => p.confidence >= 0.8).length,
      medium: data.detected_patterns.filter(
        (p) => p.confidence >= 0.6 && p.confidence < 0.8
      ).length,
      low: data.detected_patterns.filter((p) => p.confidence < 0.6).length,
    };

    // Enrich response
    const enrichedResponse: CnnPatternsResponse = {
      ...data,
      confidence_distribution: confidenceDistribution,
    };

    return NextResponse.json(enrichedResponse);
  } catch (error) {
    console.error('Error fetching CNN patterns:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
