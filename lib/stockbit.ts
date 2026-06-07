/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Stockbit API Adapter (Modular Adapter Pattern)
   
   Per roadmap: "Don't write code that directly hits Stockbit API
   everywhere. Create one adapter layer. If Stockbit dies, you only
   need to change one adapter file."
   ══════════════════════════════════════════════════════════════ */

import type { MarketDetectorResponse, OrderbookResponse } from './types';
import { getSessionValue, updateTokenLastUsed, invalidateToken, upsertSession } from './supabase';

const STOCKBIT_BASE_URL = 'https://exodus.stockbit.com';

export class TokenExpiredError extends Error {
  constructor(message = 'Token has expired or is invalid.') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

// ── Token Cache ──────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenLastFetched = 0;
const TOKEN_CACHE_DURATION = 10000; // 10 seconds (reduced from 60s to pick up fresh tokens faster)

async function getAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - tokenLastFetched < TOKEN_CACHE_DURATION) {
    return cachedToken;
  }

  const token = await getSessionValue('stockbit_token');
  if (!token) {
    const envToken = process.env.STOCKBIT_JWT_TOKEN;
    if (!envToken) throw new Error('STOCKBIT_JWT_TOKEN not found');
    return envToken;
  }

  cachedToken = token;
  tokenLastFetched = now;
  return token;
}

/** Force clear token cache so next request gets a fresh one */
export function forceRefreshToken() {
  cachedToken = null;
  tokenLastFetched = 0;
}

/** Get token expiration status for Health API */
export async function getTokenStatus() {
  try {
    const token = await getAuthToken();
    if (!token) return { status: 'offline', expiresAt: 0, expiresInMinutes: 0 };
    
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    
    if (!payload.exp) return { status: 'unknown', expiresAt: 0, expiresInMinutes: 0 };
    
    const expiresAt = payload.exp * 1000;
    const expiresInMs = expiresAt - Date.now();
    const expiresInMinutes = Math.round(expiresInMs / 60000);
    
    let status = 'online';
    if (expiresInMinutes <= 0) status = 'offline';
    else if (expiresInMinutes < 15) status = 'expiring';
    
    return { status, expiresAt, expiresInMinutes };
  } catch {
    return { status: 'offline', expiresAt: 0, expiresInMinutes: 0 };
  }
}

// ── Common Headers ───────────────────────────────────────────
async function getHeaders(): Promise<HeadersInit> {
  return {
    accept: 'application/json',
    authorization: `Bearer ${await getAuthToken()}`,
    origin: 'https://stockbit.com',
    referer: 'https://stockbit.com/',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  };
}

// ── Response Handler (with token invalidation) ───────────────
async function handleResponse(response: Response, apiName: string): Promise<void> {
  if (response.status === 401) {
    await invalidateToken();
    cachedToken = null;
    throw new TokenExpiredError(`${apiName}: Token expired (401)`);
  }
  if (!response.ok) {
    throw new Error(`${apiName} error: ${response.status} ${response.statusText}`);
  }
  updateTokenLastUsed().catch(() => {});
}

// ── API Methods ──────────────────────────────────────────────

export async function fetchMarketDetector(
  emiten: string,
  fromDate: string,
  toDate: string
): Promise<MarketDetectorResponse> {
  const url = new URL(`${STOCKBIT_BASE_URL}/marketdetectors/${emiten}`);
  url.searchParams.append('from', fromDate);
  url.searchParams.append('to', toDate);
  url.searchParams.append('transaction_type', 'TRANSACTION_TYPE_NET');
  url.searchParams.append('market_board', 'MARKET_BOARD_REGULER');
  url.searchParams.append('investor_type', 'INVESTOR_TYPE_ALL');
  url.searchParams.append('limit', '25');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Market Detector');
  return response.json();
}

export async function fetchOrderbook(emiten: string): Promise<OrderbookResponse> {
  const url = `${STOCKBIT_BASE_URL}/company-price-feed/v2/orderbook/companies/${emiten}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Orderbook');
  return response.json();
}

export async function fetchEmitenInfo(emiten: string) {
  const url = `${STOCKBIT_BASE_URL}/emitten/${emiten}/info`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Emiten Info');
  return response.json();
}

export async function fetchHistoricalSummary(
  emiten: string,
  startDate: string,
  endDate: string,
  limit = 60
) {
  const url = `${STOCKBIT_BASE_URL}/company-price-feed/historical/summary/${emiten}?period=HS_PERIOD_DAILY&start_date=${startDate}&end_date=${endDate}&limit=${limit}&page=1`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Historical Summary');
  const json = await response.json();
  return json.data?.result || [];
}

export async function fetchWatchlistGroups() {
  const url = `${STOCKBIT_BASE_URL}/watchlist?page=1&limit=500`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Watchlist Groups');
  const json = await response.json();
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchWatchlist(watchlistId: number) {
  const url = `${STOCKBIT_BASE_URL}/watchlist/${watchlistId}?page=1&limit=500`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Watchlist Detail');
  return response.json();
}

export async function fetchStockbitStream(emiten: string, limit = 15) {
  const url = `${STOCKBIT_BASE_URL}/stream/symbol/${emiten}?limit=${limit}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });
  await handleResponse(response, 'Stockbit Stream');
  const json = await response.json();
  return Array.isArray(json.data) ? json.data : [];
}

// ── Portfolio Data (carina.stockbit.com) ─────────────────────
// Carina uses a separate v2 JWT token from exodus

const CARINA_BASE_URL = 'https://carina.stockbit.com';

let cachedCarinaToken: string | null = null;
let carinaTokenLastFetched = 0;

async function getCarinaToken(): Promise<string> {
  const now = Date.now();
  if (cachedCarinaToken && now - carinaTokenLastFetched < TOKEN_CACHE_DURATION) {
    return cachedCarinaToken;
  }

  // Try carina-specific token first
  const carinaToken = await getSessionValue('stockbit_carina_token');
  if (carinaToken) {
    cachedCarinaToken = carinaToken;
    carinaTokenLastFetched = now;
    return carinaToken;
  }

  // Fallback to regular token (may not work for carina, but worth trying)
  return getAuthToken();
}

async function getCarinaHeaders(): Promise<HeadersInit> {
  return {
    accept: 'application/json',
    authorization: `Bearer ${await getCarinaToken()}`,
    origin: 'https://stockbit.com',
    referer: 'https://stockbit.com/',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  };
}

/** Store carina-specific token */
export async function saveCarinaToken(token: string): Promise<void> {
  // Decode JWT to get expiry
  let expiresAt: Date | undefined;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (payload.exp) expiresAt = new Date(payload.exp * 1000);
  } catch {}
  await upsertSession('stockbit_carina_token', token, expiresAt);
  cachedCarinaToken = token;
  carinaTokenLastFetched = Date.now();
}

/**
 * Fetch user stock portfolio holdings
 * Endpoint: carina.stockbit.com/portfolio/v2/list
 */
export async function fetchPortfolio() {
  const url = `${CARINA_BASE_URL}/portfolio/v2/list`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getCarinaHeaders(),
  });
  await handleResponse(response, 'Portfolio');
  return response.json();
}

/**
 * Fetch user bond portfolio
 * Endpoint: carina.stockbit.com/bond/v1/portfolio
 */
export async function fetchBondPortfolio() {
  const url = `${CARINA_BASE_URL}/bond/v1/portfolio`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getCarinaHeaders(),
  });
  await handleResponse(response, 'Bond Portfolio');
  return response.json();
}
