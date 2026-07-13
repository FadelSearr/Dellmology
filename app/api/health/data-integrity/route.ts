import { NextResponse } from 'next/server';
import { getPrice, getCacheStats, type PriceData } from '@/lib/price-sync';
import { fetchOrderbook } from '@/lib/stockbit';

/* ══════════════════════════════════════════════════════════════
   Data Integrity Health Check
   
   Monitors price consistency across different data sources:
   - Stockbit API (real-time)
   - Yahoo Finance (delayed)
   - Mock data (fallback)
   
   Alerts if price variance > 5% between sources
   ══════════════════════════════════════════════════════════════ */

// Test tickers for integrity check
const TEST_TICKERS = ['BBRI', 'GOTO', 'ANTM', 'TLKM', 'BBCA'];

interface SourcePrice {
  price: number;
  source: string;
  error?: string;
}

interface IntegrityResult {
  ticker: string;
  prices: {
    unified: SourcePrice;
    stockbit: SourcePrice;
    yahoo: SourcePrice;
  };
  maxDiffPercent: number;
  status: 'ok' | 'warning' | 'error';
  timestamp: number;
}

// Fetch price directly from Yahoo Finance
async function fetchYahooPrice(ticker: string): Promise<number> {
  try {
    const symbol = `${ticker}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!res.ok) return 0;
    
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return 0;

    const quote = result.indicators?.quote?.[0];
    const close = quote?.close?.filter((c: number | null) => c != null);
    
    return close && close.length > 0 ? close[close.length - 1] : 0;
  } catch {
    return 0;
  }
}

// Fetch price directly from Stockbit
async function fetchStockbitPrice(ticker: string): Promise<number> {
  try {
    const ob = await fetchOrderbook(ticker);
    const obData: any = ob?.data || {};
    return obData.lastprice || obData.close || 0;
  } catch {
    return 0;
  }
}


// Calculate price variance
function calculateVariance(prices: number[]): { maxDiff: number; maxDiffPercent: number } {
  const validPrices = prices.filter(p => p > 0);
  if (validPrices.length === 0) return { maxDiff: 0, maxDiffPercent: 0 };
  
  const max = Math.max(...validPrices);
  const min = Math.min(...validPrices);
  const maxDiff = max - min;
  const maxDiffPercent = (maxDiff / max) * 100;
  
  return { maxDiff, maxDiffPercent };
}

export async function GET() {
  const results: IntegrityResult[] = [];
  const startTime = Date.now();

  try {
    // Test each ticker
    for (const ticker of TEST_TICKERS) {
      try {
        // Fetch from all sources in parallel
        const [unifiedData, stockbitPrice, yahooPrice] = await Promise.all([
          getPrice(ticker, true), // Force refresh to bypass cache
          fetchStockbitPrice(ticker),
          fetchYahooPrice(ticker),
        ]);

        // Build price comparison
        const prices = {
          unified: {
            price: unifiedData.price,
            source: unifiedData.source,
          },
          stockbit: {
            price: stockbitPrice,
            source: 'stockbit',
            error: stockbitPrice === 0 ? 'Failed to fetch' : undefined,
          },
          yahoo: {
            price: yahooPrice,
            source: 'yahoo',
            error: yahooPrice === 0 ? 'Failed to fetch' : undefined,
          },
        };

        // Calculate variance
        const allPrices = [stockbitPrice, yahooPrice].filter(p => p > 0);
        const { maxDiffPercent } = calculateVariance(allPrices);

        // Determine status
        let status: 'ok' | 'warning' | 'error' = 'ok';
        if (maxDiffPercent > 10) {
          status = 'error';
        } else if (maxDiffPercent > 5) {
          status = 'warning';
        }

        results.push({
          ticker,
          prices,
          maxDiffPercent: parseFloat(maxDiffPercent.toFixed(2)),
          status,
          timestamp: Date.now(),
        });
      } catch (err) {
        // Individual ticker failed
        results.push({
          ticker,
          prices: {
            unified: { price: 0, source: 'unknown', error: 'Failed' },
            stockbit: { price: 0, source: 'stockbit', error: 'Failed' },
            yahoo: { price: 0, source: 'yahoo', error: 'Failed' },
          },
          maxDiffPercent: 0,
          status: 'error',
          timestamp: Date.now(),
        });
      }
    }

    // Get cache statistics
    const cacheStats = getCacheStats();

    // Overall health status
    const hasErrors = results.some(r => r.status === 'error');
    const hasWarnings = results.some(r => r.status === 'warning');
    const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok';

    // Calculate average variance
    const avgVariance = results.reduce((sum, r) => sum + r.maxDiffPercent, 0) / results.length;

    return NextResponse.json({
      success: true,
      status: overallStatus,
      summary: {
        totalTickers: TEST_TICKERS.length,
        okCount: results.filter(r => r.status === 'ok').length,
        warningCount: results.filter(r => r.status === 'warning').length,
        errorCount: results.filter(r => r.status === 'error').length,
        avgVariance: parseFloat(avgVariance.toFixed(2)),
        executionTime: Date.now() - startTime,
      },
      results,
      cache: cacheStats,
      recommendations: generateRecommendations(results),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        error: message,
        results,
      },
      { status: 500 }
    );
  }
}

// Generate recommendations based on results
function generateRecommendations(results: IntegrityResult[]): string[] {
  const recommendations: string[] = [];

  // Check for high variance
  const highVariance = results.filter(r => r.maxDiffPercent > 5);
  if (highVariance.length > 0) {
    recommendations.push(
      `⚠️ ${highVariance.length} ticker(s) have price variance > 5%. Consider investigating data sources.`
    );
  }

  // Check for Stockbit failures
  const stockbitFailures = results.filter(r => r.prices.stockbit.error);
  if (stockbitFailures.length > 0) {
    recommendations.push(
      `🔴 Stockbit API failed for ${stockbitFailures.length} ticker(s). Check JWT token validity.`
    );
  }

  // Check for Yahoo failures
  const yahooFailures = results.filter(r => r.prices.yahoo.error);
  if (yahooFailures.length > 0) {
    recommendations.push(
      `🟡 Yahoo Finance failed for ${yahooFailures.length} ticker(s). May be rate limited or network issue.`
    );
  }

  // Check unified source distribution
  const sourceCounts = results.reduce((acc, r) => {
    acc[r.prices.unified.source] = (acc[r.prices.unified.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (recommendations.length === 0) {
    recommendations.push('✅ All data sources are healthy and synchronized.');
  }

  return recommendations;
}
