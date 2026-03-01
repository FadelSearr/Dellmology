'use client';

import { useEffect, useState } from 'react';
import { Zap, TrendingUp, AlertCircle, Loader } from 'lucide-react';

interface ScreenerResult {
  symbol: string;
  signal_score: number;
  haka_ratio: number;
  volatility: number;
  consistency: number;
  reason: string;
  recommendation: string;
}

export const AIScreener = ({ mode = 'DAYTRADE' }: { mode?: 'DAYTRADE' | 'SWING' }) => {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState(mode);
  const [priceRange, setPriceRange] = useState({ min: 100, max: 500 });

  useEffect(() => {
    const runScreener = async () => {
      try {
        setLoading(true);
        setError(null);

        // In production, this would call a dedicated screener API
        // For now, generate mock results based on mode
        const mockResults: ScreenerResult[] = [];

        const stocks = ['BBCA', 'TLKM', 'GOTO', 'BBNI', 'ASII', 'BMRI', 'INDF', 'UNTR'];

        for (const stock of stocks) {
          if (selectedMode === 'DAYTRADE') {
            // High volatility, high HAKA ratio
            mockResults.push({
              symbol: stock,
              signal_score: Math.floor(50 + Math.random() * 50),
              haka_ratio: Math.random() * 60 + 40,
              volatility: Math.random() * 4 + 2,
              consistency: Math.random() * 50,
              reason: '📈 High volatility + Strong HAKA dominance',
              recommendation: 'SCALPING - Entry on HAKA surge'
            });
          } else {
            // Broker accumulation, solid technicals
            mockResults.push({
              symbol: stock,
              signal_score: Math.floor(40 + Math.random() * 50),
              haka_ratio: Math.random() * 40 + 30,
              volatility: Math.random() * 2 + 0.5,
              consistency: Math.random() * 100,
              reason: '🐋 Whale accumulation + Broker consistency',
              recommendation: 'SWING - Hold 2-5 days'
            });
          }
        }

        // Sort by signal score
        mockResults.sort((a, b) => b.signal_score - a.signal_score);

        setResults(mockResults.slice(0, 10));
      } catch (err) {
        console.error('Screener error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    runScreener();
  }, [selectedMode]);

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap className="text-yellow-400" size={20} />
          AI Screener
        </h3>

        {/* Mode Selection */}
        <div className="grid grid-cols-2 gap-2">
          {['DAYTRADE', 'SWING'].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMode(m as 'DAYTRADE' | 'SWING')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                selectedMode === m
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {m === 'DAYTRADE' ? '🚀 Daytrade Mode' : '📋 Swing Mode'}
            </button>
          ))}
        </div>

        {/* Price Range Filter */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <label className="text-xs text-gray-400 block mb-2">Price Range (Rp)</label>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="number"
                value={priceRange.min}
                onChange={(e) => setPriceRange({ ...priceRange, min: parseInt(e.target.value) })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                placeholder="Min"
              />
            </div>
            <div className="text-gray-400 text-sm flex items-center">to</div>
            <div className="flex-1">
              <input
                type="number"
                value={priceRange.max}
                onChange={(e) => setPriceRange({ ...priceRange, max: parseInt(e.target.value) })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                placeholder="Max"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader className="animate-spin mr-2" />
          Scanning market...
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          Error: {error}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          No stocks matching criteria
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((result, idx) => (
            <div
              key={result.symbol}
              className="bg-linear-to-r from-gray-800/60 to-gray-800/30 border border-gray-700 rounded-lg p-3 hover:border-cyan-500/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left: Stock Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded">
                      #{idx + 1}
                    </div>
                    <h4 className="text-white font-bold text-lg">{result.symbol}</h4>
                  </div>

                  <p className="text-xs text-gray-400 mb-2">{result.reason}</p>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">HAKA:</span>
                      <span className={`ml-1 ${result.haka_ratio > 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {result.haka_ratio.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Vol:</span>
                      <span className={`ml-1 ${result.volatility > 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {result.volatility.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Cons:</span>
                      <span className="ml-1 text-blue-400">
                        {result.consistency.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Signal Score & Recommendation */}
                <div className="shrink-0 text-right">
                  <div
                    className={`text-2xl font-bold rounded-lg px-3 py-2 ${
                      result.signal_score > 75
                        ? 'bg-green-500/20 text-green-400'
                        : result.signal_score > 60
                        ? 'bg-lime-500/20 text-lime-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {result.signal_score}
                  </div>

                  <div className="text-xs text-gray-400 mt-2 font-mono">
                    {result.recommendation}
                  </div>
                </div>
              </div>

              {/* Bottom: Action Bar */}
              <div className="mt-3 flex gap-2 text-xs">
                <button className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 px-2 py-1 rounded transition-colors">
                  📊 Details
                </button>
                <button className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2 py-1 rounded transition-colors">
                  ✅ Alert
                </button>
                <button className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-2 py-1 rounded transition-colors">
                  💬 Narrative
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-400">
        <p className="mb-2">
          {selectedMode === 'DAYTRADE'
            ? '🚀 Daytrade: High volatility + strong HAKA for quick scalping (1-4 hours)'
            : '📋 Swing: Whale accumulation + solid technicals for 2-5 day holds'}
        </p>
        <p className="text-gray-500">💡 Score 75+ = Strong Signal | 50-75+ = Monitor | &lt;50 = Skip</p>
      </div>
    </div>
  );
};
