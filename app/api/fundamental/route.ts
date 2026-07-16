import { NextRequest, NextResponse } from 'next/server';

/**
 * Fundamental Analysis API Endpoint
 * Endpoints:
 * - GET /api/fundamental?ticker=BBRI.JK
 * - POST /api/fundamental/screen
 * - GET /api/fundamental/compare?tickers=BBRI,BMRI,BBCA
 */

interface FundamentalRequest {
  ticker?: string;
  tickers?: string[];
  criteria?: {
    min_roe?: number;
    max_pe?: number;
    min_dividend_yield?: number;
    max_debt_to_equity?: number;
    min_current_ratio?: number;
    [key: string]: number | undefined;
  };
}

// Cache untuk hasil analisis (5 menit TTL)
const analysisCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function getRealFundamentalData(ticker: string): Promise<any> {
  try {
    const url = `http://localhost:8002/analyze/fundamental/${ticker}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Python Worker API error: ${response.status}`);
    
    const data = await response.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal mengambil data fundamental dari worker' };
  }
}

function getCacheKey(method: string, params: any): string {
  return `${method}:${JSON.stringify(params)}`;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

// GET: Analisis satu saham
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const action = searchParams.get('action') || 'analyze';

    if (!ticker) {
      return NextResponse.json(
        { error: 'ticker parameter required' },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = getCacheKey(action, { ticker });
    const cached = analysisCache.get(cacheKey);

    if (cached && isCacheValid(cached.timestamp)) {
      return NextResponse.json({
        ...cached.data,
        _cached: true,
        _cacheAge: Date.now() - cached.timestamp,
      });
    }

    // Call engine
    const result = await getRealFundamentalData(ticker);

    // Store in cache
    if (result.success) {
      analysisCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST: Screen atau Compare
export async function POST(request: NextRequest) {
  try {
    const body: FundamentalRequest = await request.json();
    const action = request.headers.get('X-Action') || 'screen';

    if (action === 'screen') {
      return NextResponse.json({ error: 'Screening not supported' }, { status: 400 });
    }

    if (action === 'compare' && body.tickers) {
      // Compare multiple stocks
      const results = await Promise.all(
        body.tickers.map((ticker) =>
          getRealFundamentalData(ticker)
        )
      );

      return NextResponse.json({
        success: true,
        stocks: results,
        comparison: generateComparison(results),
      });
    }

    return NextResponse.json(
      { error: 'Invalid action or missing parameters' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateComparison(results: any[]): any {
  /**
   * Generate comparison metrics antar stocks
   */
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return null;
  }

  return {
    best_valuation: successful.reduce((prev, current) =>
      (prev.metrics.pe_ratio || Infinity) < (current.metrics.pe_ratio || Infinity)
        ? prev
        : current
    ),
    best_profitability: successful.reduce((prev, current) =>
      (prev.metrics.roe || 0) > (current.metrics.roe || 0) ? prev : current
    ),
    best_dividend: successful.reduce((prev, current) =>
      (prev.metrics.dividend_yield || 0) > (current.metrics.dividend_yield || 0)
        ? prev
        : current
    ),
    best_liquidity: successful.reduce((prev, current) =>
      (prev.metrics.current_ratio || 0) > (current.metrics.current_ratio || 0)
        ? prev
        : current
    ),
  };
}
