'use client';

import { useEffect, useState } from "react";

interface BrokerSummary {
  broker_id: string;
  net_buy_value: number;
  avg_buy_price: number;
  avg_sell_price: number;
}

// Function to format large numbers into a more readable format (e.g., 1.2B, 345.6M)
const formatValue = (value: number): string => {
  if (Math.abs(value) >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B';
  }
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M';
  }
  if (Math.abs(value) >= 1_000) {
    return (value / 1_000).toFixed(2) + 'K';
  }
  return value.toString();
};

export function BrokerFlow() {
  const [summary, setSummary] = useState<BrokerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [narrative, setNarrative] = useState('');
  const [isNarrativeLoading, setIsNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const symbol = 'BBCA'; // Hardcoded for now

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/broker-summary?symbol=${symbol}&date=${today}`);
        
        if (!response.ok) {
          const res = await response.json();
          throw new Error(res.error || `Failed to fetch data: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          setSummary(result.data);
        } else {
          throw new Error(result.error || 'An unknown error occurred');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [symbol, today]);

  const handleGenerateNarrative = async () => {
    setIsNarrativeLoading(true);
    setNarrativeError(null);
    setNarrative('');
    try {
      const response = await fetch('/api/generate-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, date: today, data: summary }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate narrative.');
      }
      setNarrative(result.narrative);
    } catch (err: unknown) {
      setNarrativeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsNarrativeLoading(false);
    }
  };

  const topAccumulation = summary.filter(s => s.net_buy_value > 0).slice(0, 5);
  const topDistribution = summary.filter(s => s.net_buy_value < 0).sort((a,b) => a.net_buy_value - b.net_buy_value).slice(0, 5);

  const renderTable = (data: BrokerSummary[], title: string, isAccumulation: boolean) => (
    <div className="flex-1">
      <h4 className={`text-lg font-bold mb-2 ${isAccumulation ? 'text-green-400' : 'text-red-400'}`}>{title}</h4>
      <div className="text-sm font-mono bg-gray-900/50 rounded p-2">
        <div className="flex justify-between font-bold text-gray-400 border-b border-gray-700 pb-1 mb-1">
          <span>Broker</span>
          <span>Net Value</span>
        </div>
        {data.map(item => (
          <div key={item.broker_id} className="flex justify-between hover:bg-gray-700/50 p-1 rounded">
            <span>{item.broker_id}</span>
            <span className={isAccumulation ? 'text-green-500' : 'text-red-500'}>{formatValue(item.net_buy_value)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-200 mb-4">
        [🌊 The Flow Engine] - Broker Summary for {symbol} ({today})
      </h2>
      {loading && <p className="text-gray-400">Loading broker flow...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      {!loading && !error && summary.length === 0 && <p className="text-gray-500">No broker summary data available for today. Run the importer first.</p>}
      
      {!loading && !error && summary.length > 0 && (
        <>
          <div className="flex flex-col md:flex-row gap-4">
            {renderTable(topAccumulation, 'Top Accumulation', true)}
            {renderTable(topDistribution, 'Top Distribution', false)}
          </div>
          
          <div className="mt-4">
            <button 
              onClick={handleGenerateNarrative}
              disabled={isNarrativeLoading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isNarrativeLoading ? '🧠 Generating...' : '🤖 Generate AI Narrative'}
            </button>
          </div>

          {narrativeError && <p className="text-red-500 mt-4">AI Error: {narrativeError}</p>}
          
          {narrative && (
            <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <h4 className="text-lg font-bold text-cyan-400 mb-2">AI Narrative Summary</h4>
              <pre className="text-gray-300 whitespace-pre-wrap font-sans">{narrative}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
