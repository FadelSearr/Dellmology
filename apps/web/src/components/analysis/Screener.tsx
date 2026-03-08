'use client';

import { useEffect, useState } from "react";

interface ScreenerResult {
  symbol: string;
  total_net_accumulation?: string; // Swing mode
  haka_ratio?: number; // Daytrade mode
  total_trades?: number; // Daytrade mode
}

const formatValue = (value: string | number | undefined): string => {
  if (value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return value.toString();

  if (Math.abs(num) >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (Math.abs(num) >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (Math.abs(num) >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toString();
};

type ScreenerMode = 'swing' | 'daytrade';

export function Screener() {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days] = useState(7);
  const [mode, setMode] = useState<ScreenerMode>('swing');

  useEffect(() => {
    async function runScreener() {
      try {
        setLoading(true);
        setError(null);
        const endpoint = mode === 'swing' ? `/api/screener/swing?days=${days}` : '/api/screener/daytrade';
        const response = await fetch(endpoint);
        
        if (!response.ok) {
          throw new Error(`Failed to run ${mode} screener`);
        }
        
        const data = await response.json();
        if (data.success) {
          setResults(data.data);
        } else {
          throw new Error(data.error || `${mode.charAt(0).toUpperCase() + mode.slice(1)} screener failed`);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    runScreener();
  }, [days, mode]);

  const renderSwingScreener = () => (
    <div className="font-mono text-sm">
      <div className="flex justify-between font-bold text-gray-400 border-b border-gray-700 pb-2 mb-2">
        <span>Symbol</span>
        <span>Total Net Accumulation</span>
      </div>
      {results.map((item) => (
        <div key={item.symbol} className="flex justify-between p-1.5 hover:bg-gray-800/50 rounded">
          <span className="font-bold">{item.symbol}</span>
          <span className="text-green-400">{formatValue(item.total_net_accumulation)}</span>
        </div>
      ))}
    </div>
  );

  const renderDaytradeScreener = () => (
    <div className="font-mono text-sm">
      <div className="flex justify-between font-bold text-gray-400 border-b border-gray-700 pb-2 mb-2">
        <span>Symbol</span>
        <span>HAKA Ratio</span>
        <span>Total Trades</span>
      </div>
      {results.map((item) => (
        <div key={item.symbol} className="flex justify-between p-1.5 hover:bg-gray-800/50 rounded">
          <span className="font-bold">{item.symbol}</span>
          <span className="text-orange-400">{item.haka_ratio ? `${(item.haka_ratio * 100).toFixed(2)}%` : 'N/A'}</span>
          <span>{formatValue(item.total_trades)}</span>
        </div>
      ))}
    </div>
  );
  
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-200 mb-4">
        [🧠 Neural Narrative Hub] - AI Screener
      </h2>
      <div className="bg-gray-900/50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-4">
          <div>
            <h3 className="text-lg font-bold text-cyan-400">
              {mode === 'swing' ? `Top Accumulated Stocks (Last ${days} Days)` : 'Real-time Daytrade Candidates'}
            </h3>
            <p className="text-xs text-gray-500">
              {mode === 'swing' ? 'Based on consistent broker accumulation.' : 'Based on high HAKA ratio and trade volume.'}
            </p>
          </div>
          <div className="flex items-center bg-gray-800/60 rounded-lg p-1">
            <button 
              onClick={() => setMode('swing')}
              className={`px-3 py-1 text-sm font-bold rounded-md ${mode === 'swing' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
            >
              Swing
            </button>
            <button 
              onClick={() => setMode('daytrade')}
              className={`px-3 py-1 text-sm font-bold rounded-md ${mode === 'daytrade' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
            >
              Daytrade
            </button>
          </div>
        </div>

        {loading && <p className="text-gray-400">Running screener...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}

        {!loading && !error && (
          mode === 'swing' ? renderSwingScreener() : renderDaytradeScreener()
        )}
      </div>
    </div>
  );
}
