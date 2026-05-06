import { NextRequest, NextResponse } from 'next/server';
import { fetchPortfolio, fetchBondPortfolio, TokenExpiredError, forceRefreshToken } from '@/lib/stockbit';
import { rateLimit } from '@/lib/rateLimit';

/* ══════════════════════════════════════════════════════════════
   Portfolio Route — Dellmology Pro

   Fetches user portfolio from Stockbit (carina.stockbit.com):
   - Stock holdings: /portfolio/v2/list
   - Bond holdings: /bond/v1/portfolio
   ══════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic';

export interface PortfolioHolding {
  code: string;
  name: string;
  lot: number;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  investedValue: number;
  pnl: number;
  pnlPercent: number;
  weight: number;
  type: 'stock' | 'bond';
}

export interface PortfolioData {
  holdings: PortfolioHolding[];
  summary: {
    totalEquity: number;
    totalInvested: number;
    totalPnl: number;
    totalPnlPercent: number;
    cashBalance: number;
    holdingCount: number;
    stockCount: number;
    bondCount: number;
  };
}

/**
 * Extract holdings array from Stockbit carina response.
 * Actual structure: { data: { results: [...], summary: {...} } }
 */
function extractHoldings(raw: any): any[] {
  if (!raw) return [];
  // Carina actual structure
  if (raw.data?.results && Array.isArray(raw.data.results)) return raw.data.results;
  // Fallback patterns
  if (Array.isArray(raw.data)) return raw.data;
  if (raw.data?.list && Array.isArray(raw.data.list)) return raw.data.list;
  if (raw.data?.portfolio && Array.isArray(raw.data.portfolio)) return raw.data.portfolio;
  if (raw.data?.holdings && Array.isArray(raw.data.holdings)) return raw.data.holdings;
  if (raw.data?.positions && Array.isArray(raw.data.positions)) return raw.data.positions;
  // Deep search
  if (raw.data && typeof raw.data === 'object') {
    for (const key of Object.keys(raw.data)) {
      if (Array.isArray(raw.data[key]) && raw.data[key].length > 0) return raw.data[key];
    }
  }
  return [];
}

/**
 * Extract summary from Stockbit carina response.
 * Actual structure: { data: { summary: { equity, amount: { invested }, trading: { balance }, profit_loss: { unrealised } } } }
 */
function extractSummary(raw: any) {
  const summary = raw?.data?.summary || {};
  return {
    equity: Number(summary.equity || 0),
    invested: Number(summary.amount?.invested || 0),
    cashBalance: Number(summary.trading?.balance || 0),
    unrealisedPnl: Number(summary.profit_loss?.unrealised || 0),
  };
}

/**
 * Parse a single stock holding from the carina API format.
 * Actual item structure:
 *   symbol, company.name, qty.balance.{lot,share},
 *   price.{latest, average.price},
 *   asset.unrealised.{market_value, profit_loss, gain},
 *   asset.amount_invested
 */
function parseStockHolding(item: any): PortfolioHolding | null {
  const code = (item.symbol || item.code || '').replace('.JK', '');
  if (!code) return null;

  const name = item.company?.name || item.name || item.company_name || code;
  
  // Quantity: nested under qty.balance
  const lot = Number(item.qty?.balance?.lot || item.lot || item.total_lot || 0);
  if (lot <= 0) return null;
  const shares = Number(item.qty?.balance?.share || 0) || (lot * 100);

  // Prices: nested under price
  const avgPrice = Number(item.price?.average?.price || item.avg_price || item.average_price || 0);
  const currentPrice = Number(item.price?.latest || item.last_price || item.current_price || 0);

  // Asset values: nested under asset.unrealised
  const marketValue = Number(item.asset?.unrealised?.market_value || 0) || (currentPrice * shares);
  const investedValue = Number(item.asset?.amount_invested || 0) || (avgPrice * shares);
  const pnl = Number(item.asset?.unrealised?.profit_loss || 0) || (marketValue - investedValue);
  
  // Gain percentage from API (already in %, e.g., 8.55 = 855%)
  // Actually looking at the data: gain 8.553571 with invested 50400 and P/L 431100 → gain is a multiplier
  // 431100 / 50400 = 8.55x → this is a multiplier, not percentage
  // So pnlPercent = gain * 100
  const gain = Number(item.asset?.unrealised?.gain || 0);
  const pnlPercent = gain !== 0 ? gain * 100 : (investedValue > 0 ? (pnl / investedValue) * 100 : 0);

  return {
    code,
    name,
    lot,
    shares,
    avgPrice,
    currentPrice,
    marketValue,
    investedValue,
    pnl,
    pnlPercent: parseFloat(pnlPercent.toFixed(2)),
    weight: 0,
    type: 'stock',
  };
}

function parseBondHolding(item: any): PortfolioHolding | null {
  const code = item.symbol || item.code || item.bond_code || item.series || '';
  if (!code) return null;

  const name = item.name || item.bond_name || item.series_name || code;
  const lot = Number(item.lot || item.unit || item.quantity || 1);
  const avgPrice = Number(item.avg_price || item.purchase_price || 0);
  const currentPrice = Number(item.last_price || item.market_price || item.current_price || 0);
  const investedValue = Number(item.invested_value || item.cost_value || 0) || (avgPrice * lot);
  const marketValue = Number(item.market_value || item.current_value || 0) || (currentPrice * lot);
  const pnl = marketValue - investedValue;
  const pnlPercent = investedValue > 0 ? (pnl / investedValue) * 100 : 0;

  return {
    code,
    name,
    lot,
    shares: lot,
    avgPrice,
    currentPrice,
    marketValue,
    investedValue,
    pnl,
    pnlPercent: parseFloat(pnlPercent.toFixed(2)),
    weight: 0,
    type: 'bond',
  };
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = rateLimit(request, 30, 60);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Fetch with auto-retry on token expired
    async function fetchWithRetry() {
      const [stockRes, bondRes] = await Promise.allSettled([
        fetchPortfolio(),
        fetchBondPortfolio(),
      ]);

      // If both failed with token error, retry once after refreshing token
      const stockFailed = stockRes.status === 'rejected' && stockRes.reason instanceof TokenExpiredError;
      const bondFailed = bondRes.status === 'rejected' && bondRes.reason instanceof TokenExpiredError;

      if (stockFailed || bondFailed) {
        console.log('[Portfolio] Token expired, refreshing and retrying...');
        forceRefreshToken();
        await new Promise(r => setTimeout(r, 1500)); // Wait for Chrome extension to send new token
        
        const [stockRetry, bondRetry] = await Promise.allSettled([
          fetchPortfolio(),
          fetchBondPortfolio(),
        ]);
        return [stockRetry, bondRetry] as const;
      }
      return [stockRes, bondRes] as const;
    }

    const [stockRes, bondRes] = await fetchWithRetry();

    let holdings: PortfolioHolding[] = [];

    // Parse stock holdings
    let stockSummary = { equity: 0, invested: 0, cashBalance: 0, unrealisedPnl: 0 };
    if (stockRes.status === 'fulfilled') {
      const raw = stockRes.value;
      console.log('[Portfolio] Stock response keys:', JSON.stringify(Object.keys(raw?.data || {})));
      
      // Extract summary from API
      stockSummary = extractSummary(raw);
      console.log('[Portfolio] API Summary:', JSON.stringify(stockSummary));
      
      // Extract and parse holdings
      const items = extractHoldings(raw);
      console.log('[Portfolio] Extracted stock items count:', items.length);
      if (items.length > 0) {
        console.log('[Portfolio] Stock item sample keys:', JSON.stringify(Object.keys(items[0])));
      }
      for (const item of items) {
        const h = parseStockHolding(item);
        if (h) holdings.push(h);
      }
    } else {
      console.log('[Portfolio] Stock fetch failed:', stockRes.reason?.message || stockRes.reason);
    }

    // Parse bond holdings
    if (bondRes.status === 'fulfilled') {
      const raw = bondRes.value;
      console.log('[Portfolio] Bond response keys:', JSON.stringify(Object.keys(raw || {})));
      const items = extractHoldings(raw);
      console.log('[Portfolio] Extracted bond items count:', items.length);
      for (const item of items) {
        const h = parseBondHolding(item);
        if (h) holdings.push(h);
      }
    } else {
      console.log('[Portfolio] Bond fetch failed:', bondRes.reason?.message || bondRes.reason);
    }

    // Use API summary for totals (more accurate than summing holdings)
    const totalEquity = stockSummary.equity || holdings.reduce((s, h) => s + h.marketValue, 0);
    const totalInvested = stockSummary.invested || holdings.reduce((s, h) => s + h.investedValue, 0);
    const totalPnl = stockSummary.unrealisedPnl || (totalEquity - totalInvested);
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const cashBalance = stockSummary.cashBalance;

    // Calculate weights
    holdings = holdings.map(h => ({
      ...h,
      weight: totalEquity > 0 ? parseFloat(((h.marketValue / totalEquity) * 100).toFixed(1)) : 0,
    }));

    // Sort by market value descending
    holdings.sort((a, b) => b.marketValue - a.marketValue);

    const data: PortfolioData = {
      holdings,
      summary: {
        totalEquity,
        totalInvested,
        totalPnl,
        totalPnlPercent: parseFloat(totalPnlPercent.toFixed(2)),
        cashBalance,
        holdingCount: holdings.length,
        stockCount: holdings.filter(h => h.type === 'stock').length,
        bondCount: holdings.filter(h => h.type === 'bond').length,
      },
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return NextResponse.json(
        { success: false, error: 'Token Stockbit expired. Silakan login ulang ke stockbit.com lalu refresh halaman ini.' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Portfolio fetch failed' },
      { status: 500 }
    );
  }
}
