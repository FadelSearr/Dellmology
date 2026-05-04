/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Data Hooks
   
   React hooks that bridge UI components with API routes.
   Auto-refreshes on interval, handles loading/error states,
   and provides toggle between live and mock data.
   ══════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { InfraHealth } from '@/lib/types';

// ── Generic Fetcher ──────────────────────────────────────────
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API Error');
  return json.data as T;
}

// ── useStockData ─────────────────────────────────────────────
export function useStockData(emiten: string, from?: string, to?: string) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!emiten) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ emiten });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const result = await apiFetch<Record<string, unknown>>(`/api/stock?${params}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, [emiten, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ── useWatchlist ─────────────────────────────────────────────
// mode = 'watchlist' | 'daytrade' | 'swing'
// sortBy = 'score' | 'price_asc' | 'price_desc' | 'change'
export function useWatchlist(mode = 'watchlist', minPrice = 0, maxPrice = 999999, searchQuery = '', sortBy = 'score') {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode, minPrice: minPrice.toString(), maxPrice: maxPrice.toString() });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (sortBy !== 'score') params.set('sortBy', sortBy);
      const result = await apiFetch<any>(`/api/screener?${params}`);
      setData(result.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch watchlist');
    } finally {
      setLoading(false);
    }
  }, [mode, minPrice, maxPrice, searchQuery, sortBy]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  return { data, loading, error, refetch: fetchWatchlist };
}

// ── useChartData ──────────────────────────────────────────────
export function useChartData(emiten: string, timeframe: string = '1D') {
  const [data, setData] = useState<any[]>([]);
  const [atr, setAtr] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChart() {
      if (!emiten) return;
      setLoading(true);
      try {
        const result = await apiFetch<any>(`/api/chart?emiten=${emiten}&tf=${timeframe}`);
        setData(result.chartData || []);
        setAtr(result.atr || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
      } finally {
        setLoading(false);
      }
    }
    fetchChart();
  }, [emiten, timeframe]);

  return { data, atr, loading, error };
}

// ── useNarrative ─────────────────────────────────────────────
export function useNarrative(params: {
  emiten: string;
  price?: number;
  change?: number;
  changePercent?: number;
  ups?: number;
  regime?: string;
  zScore?: number;
  atr?: number;
  topBrokers?: any[];
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = useRef<string>('');

  useEffect(() => {
    // Only fetch when we have real price data loaded
    if (!params.emiten || !params.price || params.price <= 0) return;

    // Avoid re-fetching for same emiten (debounce)
    const key = `${params.emiten}-${params.price}`;
    if (lastFetched.current === key) return;
    lastFetched.current = key;

    async function fetchNarrative() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<any>('/api/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Narrative failed');
      } finally {
        setLoading(false);
      }
    }

    fetchNarrative();
  }, [params.emiten, params.price, params.ups, params.zScore]);

  const refetch = useCallback(async () => {
    lastFetched.current = ''; // force refresh
    if (!params.emiten || !params.price) return;
    setLoading(true);
    try {
      const result = await apiFetch<any>('/api/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Narrative failed');
    } finally {
      setLoading(false);
    }
  }, [params.emiten, params.price]);

  return { data, loading, error, refetch };
}

// ── useTokenHealth ───────────────────────────────────────────
export function useTokenHealth(intervalMs = 30000) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const result = await apiFetch<Record<string, unknown>>('/api/token-status');
        setStatus(result);
      } catch {
        setStatus({ exists: false, isValid: false, isExpired: true });
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return status;
}

// ── useInfraHealth ───────────────────────────────────────────
export function useInfraHealth(intervalMs = 10000): InfraHealth {
  const [health, setHealth] = useState<InfraHealth>({
    engine: 'offline',
    database: 'offline',
    token: 'offline',
    dataIntegrity: 'offline',
  });

  useEffect(() => {
    const check = async () => {
      const results: InfraHealth = {
        engine: 'offline',
        database: 'offline',
        token: 'offline',
        dataIntegrity: 'warning',
      };

      // Check API availability
      try {
        const res = await fetch('/api/token-status', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          results.engine = 'online';
          const json = await res.json();
          if (json.success) {
            results.database = 'online';
            results.token = json.data?.isValid ? 'online' : json.data?.isExpiringSoon ? 'warning' : 'offline';
            results.dataIntegrity = json.data?.exists ? 'online' : 'warning';
          }
        }
      } catch {
        results.engine = 'offline';
      }

      setHealth(results);
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return health;
}

// ── useAutoRefresh ───────────────────────────────────────────
export function useAutoRefresh(callback: () => void, intervalMs: number, enabled = true) {
  const savedCallback = useRef(callback);

  useEffect(() => { savedCallback.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}

// ── useCombatMode ────────────────────────────────────────────
// Per roadmap: "When market is volatile, simplify UI to only show
// critical info: Price, UPS, Kill-Switch Status"
export function useCombatMode() {
  const [combatMode, setCombatMode] = useState(false);
  const [volatilityLevel, setVolatilityLevel] = useState<'low' | 'medium' | 'high'>('low');

  const activate = useCallback((atrRatio: number) => {
    if (atrRatio > 2.0) {
      setCombatMode(true);
      setVolatilityLevel('high');
    } else if (atrRatio > 1.5) {
      setVolatilityLevel('medium');
    } else {
      setCombatMode(false);
      setVolatilityLevel('low');
    }
  }, []);

  const toggle = useCallback(() => setCombatMode(prev => !prev), []);

  return { combatMode, volatilityLevel, activate, toggle };
}
