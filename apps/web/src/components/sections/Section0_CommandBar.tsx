'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, TrendingUp, Settings } from 'lucide-react';
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
  marketRegime = 'BULLISH',
  volatility = 'HIGH',
  systemHealth = { sse: true, db: true, shield: true },
  rateLimitUsage = 65,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]);

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

  const topStocks = ['BBCA', 'ASII', 'TLKM', 'GOTO', 'BMRI'];
  // if API returns nothing (table not scraped yet), fall back to a small sample list
  const filteredSuggestions = suggestions.length > 0 ? suggestions : topStocks.filter((stock) =>
    stock.toUpperCase().includes(searchInput.toUpperCase())
  );

  const handleSelectStock = (symbol: string) => {
    setSearchInput(symbol);
    setShowSuggestions(false);
    onSymbolChange?.(symbol);
  };

  // debounce lookup
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSuggestions(searchInput);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-xl border-b border-gray-700/50 py-2">
      <div className="max-w-screen-2xl mx-auto px-3">
        {/* Single Pulse Row */}
        <div className="flex items-center justify-between gap-3">
          {/* Search Bar */}
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

          {/* Regime Badge */}
          <div className="flex items-center gap-2">
            <StatusBadge
              status={marketRegime === 'BULLISH' ? 'bullish' : marketRegime === 'BEARISH' ? 'bearish' : 'neutral'}
              label={`${marketRegime} - VOL: ${volatility}`}
              icon={<TrendingUp className="w-3 h-3" />}
            />
          </div>

          {/* Inline Global Correlation Marquee */}
          <div className="hidden lg:block flex-1 overflow-hidden">
            <div className="inline-flex gap-5 animate-scroll whitespace-nowrap text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Gold:</span>
                <span className="text-green-400 font-mono">+0.5%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Coal:</span>
                <span className="text-red-400 font-mono">-1.2%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Nickel:</span>
                <span className="text-green-400 font-mono">+2.1%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">IHSG:</span>
                <span className="text-green-400 font-mono">7,200</span>
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="flex items-center gap-2">
            {/* SSE */}
            <div
              className={`w-3 h-3 rounded-full ${systemHealth.sse ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-red-500'}`}
              title={`SSE: ${systemHealth.sse ? 'Connected' : 'Disconnected'}`}
            />
            {/* DB */}
            <div
              className={`w-3 h-3 rounded-full ${systemHealth.db ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-red-500'}`}
              title={`DB: ${systemHealth.db ? 'Connected' : 'Disconnected'}`}
            />
            {/* Shield */}
            <div
              className={`w-3 h-3 rounded-full ${systemHealth.shield ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-yellow-500'}`}
              title={`Shield: ${systemHealth.shield ? 'Active' : 'Warning'}`}
            />
          </div>

          {/* Settings */}
          <button className="p-1.5 hover:bg-gray-800/50 rounded-lg transition-colors text-gray-400 hover:text-white">
            <Settings className="w-4 h-4" />
          </button>

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
