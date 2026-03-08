'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, TrendingUp, Settings, Filter } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/common/StatusBadge';

interface Section0Props {
  onSymbolChange?: (symbol: string) => void;
  marketRegime?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  volatility?: 'HIGH' | 'MEDIUM' | 'LOW';
  systemHealth?: {
    sse: boolean;
    db: boolean;
    shield: boolean;
  };
  rateLimitUsage?: number; // 0-100
}

/**
 * Section 0: The Command Bar (Sticky Header)
 * - Stock search with live info
 * - Market regime badge
 * - Global correlation marquee
 * - System health indicators
 * - API rate limit tracker
 */
export const Section0_CommandBar: React.FC<Section0Props> = ({
  onSymbolChange,
  systemHealth = { sse: true, db: true, shield: true },
  rateLimitUsage = 65,
}) => {
  // Global commodities marquee state
  const [commodities, setCommodities] = useState<{ gold: number | null; coal: number | null; nickel: number | null; ihsg: number | null }>({
    gold: null,
    coal: null,
    nickel: null,
    ihsg: null,
  });

  useEffect(() => {
    const fetchCommodities = async () => {
      try {
        const resp = await fetch('/api/market/commodities')
        const json = await resp.json()
        setCommodities({
          gold: json.gold ?? null,
          coal: json.coal ?? null,
          nickel: json.nickel ?? null,
          ihsg: json.ihsg ?? null,
        })
      } catch {
        // ignore
      }
    }
    fetchCommodities();
    const interval = setInterval(fetchCommodities, 15000);
    return () => clearInterval(interval);
  }, [systemHealth.shield]);

  const [searchInput, setSearchInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Real-time regime and price
  const [regime, setRegime] = useState<'UPTREND'|'DOWNTREND'|'SIDEWAYS'>('SIDEWAYS');
  const [volatility, setVolatility] = useState<'HIGH'|'MEDIUM'|'LOW'>('MEDIUM');
  const [livePrice, setLivePrice] = useState<number|null>(null);
  // Merge prop health with live health polling
  const [liveHealth, setLiveHealth] = useState(systemHealth);

  // Fetch regime status
  useEffect(() => {
    if (!searchInput) return;
    const fetchRegime = async () => {
      try {
        const resp = await fetch(`http://localhost:8080/market/regime?symbol=${searchInput}`);
        const json = await resp.json();
        setRegime(json.regime || 'SIDEWAYS');
        setVolatility(json.volatility ? (json.volatility ? 'HIGH' : 'LOW') : 'MEDIUM');
      } catch {}
    };
    fetchRegime();
    const interval = setInterval(fetchRegime, 10000);
    return () => clearInterval(interval);
  }, [searchInput]);

  // Fetch live price
  useEffect(() => {
    if (!searchInput) return;
    const fetchPrice = async () => {
      try {
        const resp = await fetch(`http://localhost:8080/market/price?symbol=${searchInput}`);
        const json = await resp.json();
        setLivePrice(json.last_price || null);
      } catch {}
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, [searchInput]);

  // Poll ML engine health proxy to update health indicators
  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const resp = await fetch('/api/ml/health')
        const json = await resp.json()
        if (!mounted) return
        const sse = json.status && json.status === 'healthy'
        const db = json.database ? json.database.connected === true : false
        const shield = json.database ? !!json.database.timescaledb : systemHealth.shield
        setLiveHealth({ sse: !!sse, db: !!db, shield: !!shield })
      } catch {
        // keep previous
      }
    }
    fetchHealth()
    const t = setInterval(fetchHealth, 10000)
    return () => {
      mounted = false
      clearInterval(t)
    }
  }, [systemHealth.shield])

  // Suggestions logic (unchanged)
  const topStocks = ['BBCA', 'ASII', 'TLKM', 'GOTO', 'BMRI'];
  const fetchSuggestions = async (q: string) => {
    if (!q) {
      setSuggestions([]);
      return;
    }
    try {
      const resp = await fetch(`/api/symbols?q=${encodeURIComponent(q)}`);
      const json = await resp.json();
      if (json.success) {
        setSuggestions(json.symbols || []);
      }
    } catch (err) {
      console.error('symbol lookup failed', err);
    }
  };
  const filteredSuggestions = suggestions.length > 0 ? suggestions : topStocks.filter((stock) =>
    stock.toUpperCase().includes(searchInput.toUpperCase())
  );
  const handleSelectStock = (symbol: string) => {
    setSearchInput(symbol);
    setShowSuggestions(false);
    onSymbolChange?.(symbol);
  };
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSuggestions(searchInput);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl/Cmd+K opens the Screener
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/screener');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <div className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-xl border-b border-gray-700/50 py-2">
      <div className="max-w-screen-2xl mx-auto px-3">
        {/* Single Pulse Row */}
        <div className="flex items-center justify-between gap-3">
          {/* Search Bar + Live Price */}
          <div ref={searchRef} className="flex-1 max-w-sm relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search stock (e.g. BBCA, ASII)..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              />
              {livePrice !== null && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-cyan-400 font-bold bg-gray-900/80 px-2 py-0.5 rounded">
                  Rp {livePrice.toLocaleString('id-ID')}
                </div>
              )}
              {/* Suggestions Dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                  {filteredSuggestions.map((stock) => (
                    <button
                      key={stock}
                      onClick={() => handleSelectStock(stock)}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-700/50 text-white transition-colors"
                    >
                      <span className="font-semibold">{stock}</span>
                      <span className="ml-2 text-gray-400 text-xs">Index Stock</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Regime Badge (real-time) */}
          <div className="flex items-center gap-2">
            <StatusBadge
              status={regime === 'UPTREND' ? 'bullish' : regime === 'DOWNTREND' ? 'bearish' : 'neutral'}
              label={`${regime} - VOL: ${volatility}`}
              icon={<TrendingUp className="w-3 h-3" />}
            />
          </div>

          {/* Inline Global Correlation Marquee (real-time) */}
          <div className="hidden lg:block flex-1 overflow-hidden">
            <div className="inline-flex gap-5 animate-scroll whitespace-nowrap text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Gold:</span>
                <span className={commodities.gold !== null && commodities.gold >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>
                  {commodities.gold !== null ? `${commodities.gold > 0 ? '+' : ''}${commodities.gold}%` : '--'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Coal:</span>
                <span className={commodities.coal !== null && commodities.coal >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>
                  {commodities.coal !== null ? `${commodities.coal > 0 ? '+' : ''}${commodities.coal}%` : '--'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Nickel:</span>
                <span className={commodities.nickel !== null && commodities.nickel >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>
                  {commodities.nickel !== null ? `${commodities.nickel > 0 ? '+' : ''}${commodities.nickel}%` : '--'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">IHSG:</span>
                <span className="text-green-400 font-mono">
                  {commodities.ihsg !== null ? commodities.ihsg : '--'}
                </span>
              </div>
            </div>
          </div>

            {/* System Health */}
          <div className="flex items-center gap-2">
            {/* SSE */}
            <div
              className={`w-3 h-3 rounded-full ${liveHealth.sse ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-red-500'}`}
              title={`SSE: ${liveHealth.sse ? 'Connected' : 'Disconnected'}`}
            />
            {/* DB */}
            <div
              className={`w-3 h-3 rounded-full ${liveHealth.db ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-red-500'}`}
              title={`DB: ${liveHealth.db ? 'Connected' : 'Disconnected'}`}
            />
            {/* Shield */}
            <div
              className={`w-3 h-3 rounded-full ${liveHealth.shield ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-yellow-500'}`}
              title={`Shield: ${liveHealth.shield ? 'Active' : 'Warning'}`}
            />
          </div>

          {/* Settings */}
          <button className="p-1.5 hover:bg-gray-800/50 rounded-lg transition-colors text-gray-400 hover:text-white">
            <Settings className="w-4 h-4" />
          </button>

          {/* Screener quick access */}
          <Link href="/screener" className="ml-2 inline-flex items-center gap-2 px-2 py-1 hover:bg-gray-800/50 rounded text-sm font-medium text-gray-200">
            <Filter className="w-4 h-4 text-cyan-400" />
            <span className="hidden md:inline">Screener</span>
            <span className="ml-2 text-[10px] text-gray-400">Ctrl+K</span>
          </Link>

          {/* Promotion UI link */}
          <a href="/ml/promotion" className="ml-2 inline-block px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-semibold text-white">Model Promotion</a>

          {/* Rate Limit */}
          <div className="flex items-center gap-2.5 min-w-max">
            <div className="text-right">
              <div className="text-[10px] text-gray-500">API Quota</div>
              <div className="text-xs font-semibold text-white">{rateLimitUsage}%</div>
            </div>
            <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  rateLimitUsage > 80 ? 'bg-red-500' : rateLimitUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(rateLimitUsage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CSS for scrolling marquee */}
      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>
    </div>
  );
};
