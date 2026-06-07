/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Price Synchronization Layer
   
   Single source of truth for all price data with fallback hierarchy:
   1. Stockbit API (real-time, requires token)
   2. Yahoo Finance (delayed 15min, free)
   3. Mock data (development fallback)
   
   Cache: 30 seconds (balance freshness vs API load)
   ══════════════════════════════════════════════════════════════ */

import { fetchOrderbook } from './stockbit';
import { mockWatchlist } from './mock-data';

// ── Types ────────────────────────────────────────────────────
export type PriceSource = 'stockbit' | 'yahoo' | 'mock' | 'unknown';

export interface PriceData {
  price: number;
  source: PriceSource;
  timestamp: number;
  changePercent?: number;
  volume?: number;
}

// ── Cache ────────────────────────────────────────────────────
const PRICE_CACHE = new Map<string, PriceData>();
const CACHE_TTL = 30 * 1000; // 30 seconds

// ── Environment Flag ─────────────────────────────────────────
const USE_MOCK_DATA = process.env.USE_MOCK_DATA === 'true';

// ── Fetch from Yahoo Finance ─────────────────────────────────
async function fetchYahooPrice(ticker: string): Promise<{ price: number; changePercent: number; volume: number } | null> {
  try {
    const symbol = `${ticker}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const quote = result.indicators?.quote?.[0];
    const meta = result.meta;
    
    const close = quote?.close?.filter((c: number | null) => c != null);
    const volume = quote?.volume?.filter((v: number | null) => v != null);
    
    if (!close || close.length === 0) return null;
    
    const currentPrice = close[close.length - 1];
    const previousClose = meta?.previousClose || meta?.chartPreviousClose || 0;
    const changePercent = previousClose > 0 
      ? ((currentPrice - previousClose) / previousClose) * 100 
      : 0;
    
    return {
      price: currentPrice,
      changePercent,
      volume: volume && volume.length > 0 ? volume[volume.length - 1] : 0,
    };
  } catch {
    return null;
  }
}

// ── Main Price Fetching Function ─────────────────────────────
/**
 * Get price for a ticker with automatic fallback hierarchy
 * @param ticker Stock code (e.g., 'BBRI', 'GOTO')
 * @param forceRefresh Skip cache and fetch fresh data
 * @returns PriceData with price, source, and metadata
 */
export async function getPrice(ticker: string, forceRefresh = false): Promise<PriceData> {
  // 0. If USE_MOCK_DATA flag is set, return mock immediately
  if (USE_MOCK_DATA) {
    const mock = mockWatchlist.find(m => m.code === ticker);
    if (mock) {
      return {
        price: mock.price,
        source: 'mock',
        timestamp: Date.now(),
        changePercent: mock.changePercent,
        volume: 0,
      };
    }
  }

  // 1. Check cache (unless force refresh)
  if (!forceRefresh) {
    const cached = PRICE_CACHE.get(ticker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }
  }

  // 2. Try Stockbit (real-time, primary source)
  try {
    const ob = await fetchOrderbook(ticker);
    const obData: any = ob?.data || {};
    const price = obData.lastprice || obData.close || 0;
    
    if (price > 0) {
      const previousClose = obData.previousclose || 0;
      const changePercent = previousClose > 0 
        ? ((price - previousClose) / previousClose) * 100 
        : 0;
      
      const priceData: PriceData = {
        price,
        source: 'stockbit',
        timestamp: Date.now(),
        changePercent,
        volume: obData.volume || 0,
      };
      
      PRICE_CACHE.set(ticker, priceData);
      return priceData;
    }
  } catch (err) {
    // Stockbit failed, continue to fallback
    console.warn(`[PriceSync] Stockbit failed for ${ticker}:`, err instanceof Error ? err.message : 'Unknown error');
  }

  // 3. Fallback to Yahoo Finance (delayed but reliable)
  try {
    const yahooData = await fetchYahooPrice(ticker);
    if (yahooData && yahooData.price > 0) {
      const priceData: PriceData = {
        price: yahooData.price,
        source: 'yahoo',
        timestamp: Date.now(),
        changePercent: yahooData.changePercent,
        volume: yahooData.volume,
      };
      
      PRICE_CACHE.set(ticker, priceData);
      return priceData;
    }
  } catch (err) {
    // Yahoo failed, continue to fallback
    console.warn(`[PriceSync] Yahoo failed for ${ticker}:`, err instanceof Error ? err.message : 'Unknown error');
  }

  // 4. Last resort: Mock data
  const mock = mockWatchlist.find(m => m.code === ticker);
  if (mock) {
    const priceData: PriceData = {
      price: mock.price,
      source: 'mock',
      timestamp: Date.now(),
      changePercent: mock.changePercent,
      volume: 0,
    };
    
    PRICE_CACHE.set(ticker, priceData);
    return priceData;
  }

  // 5. Complete failure
  return {
    price: 0,
    source: 'unknown',
    timestamp: Date.now(),
    changePercent: 0,
    volume: 0,
  };
}

/**
 * Batch fetch prices for multiple tickers
 * @param tickers Array of stock codes
 * @param concurrency Max parallel requests (default: 10)
 * @returns Map of ticker -> PriceData
 */
export async function getPrices(tickers: string[], concurrency = 10): Promise<Map<string, PriceData>> {
  const result = new Map<string, PriceData>();
  
  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const prices = await Promise.all(
      batch.map(ticker => getPrice(ticker))
    );
    
    batch.forEach((ticker, idx) => {
      result.set(ticker, prices[idx]);
    });
  }
  
  return result;
}

/**
 * Clear cache for a specific ticker or all tickers
 * @param ticker Optional ticker to clear, or undefined to clear all
 */
export function clearPriceCache(ticker?: string): void {
  if (ticker) {
    PRICE_CACHE.delete(ticker);
  } else {
    PRICE_CACHE.clear();
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  const now = Date.now();
  const entries = Array.from(PRICE_CACHE.entries());
  
  return {
    size: PRICE_CACHE.size,
    entries: entries.map(([ticker, data]) => ({
      ticker,
      price: data.price,
      source: data.source,
      age: Math.round((now - data.timestamp) / 1000), // seconds
      stale: now - data.timestamp > CACHE_TTL,
    })),
  };
}
