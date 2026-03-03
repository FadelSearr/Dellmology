'use client';

import { useEffect, useState } from 'react';

interface AInarrative {
  type: string;
  symbol?: string;
  narrative: string;
  confidence_score?: number;
  confidence_label?: 'LOW' | 'MEDIUM' | 'HIGH';
  generated_at: string;
}

interface BrokerNarrativePayload {
  type: 'broker' | 'regime' | 'screener' | 'swot';
  symbol: string;
  data: {
    whales?: Array<{ is_whale?: boolean }>;
    wash_sale_score?: number;
    consistency?: number;
    period?: string;
  };
}

export const AINarrativeDisplay = ({ 
  symbol, 
  type = 'broker',
  autoRefresh = false 
}: { 
  symbol: string; 
  type?: 'broker' | 'regime' | 'screener' | 'swot';
  autoRefresh?: boolean;
}) => {
  const [narrative, setNarrative] = useState<AInarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateNarrative = async () => {
      try {
        setLoading(true);

        // Prepare data based on type
        const requestPayload: BrokerNarrativePayload = {
          type,
          symbol,
          data: {},
        };

        // Fetch appropriate data first
        if (type === 'broker') {
          const res = await fetch(`/api/broker-flow?symbol=${symbol}&days=7&filter=mix`);
          if (!res.ok) {
            throw new Error('Failed to fetch broker flow for narrative');
          }
          const brokerData = await res.json();
          if (!brokerData.stats) {
            throw new Error('Broker flow stats missing');
          }
          requestPayload.data = {
            whales: brokerData.brokers?.filter((b: any) => b.is_whale).slice(0, 3) || [],
            wash_sale_score: brokerData.stats.wash_sale_score || 0,
            consistency: brokerData.stats.total_brokers > 0 ? 1 : 0,
            period: '7 days'
          };
        } else if (type === 'regime') {
          const res = await fetch('/api/market-regime');
          requestPayload.data = await res.json();
        } else {
          // other types (screener, swot) may not require pre-fetched data
          requestPayload.data = {};
        }

        const response = await fetch('/api/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          const text = await response.text();
          console.error('Narrative API error', response.status, text);
          throw new Error(`Failed to generate narrative (${response.status})`);
        }

        const result = await response.json();
        setNarrative(result);
        setError(null);
      } catch (err) {
        console.error('Error generating narrative:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    generateNarrative();

    if (autoRefresh) {
      const interval = setInterval(generateNarrative, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [symbol, type, autoRefresh]);

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 animate-pulse space-y-2">
        <div className="h-4 bg-gray-700 rounded w-1/3"></div>
        <div className="h-3 bg-gray-700 rounded"></div>
        <div className="h-3 bg-gray-700 rounded w-5/6"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800/50 border border-red-700 rounded-lg p-4 text-red-400 text-sm">
        Error: {error}
      </div>
    );
  }

  if (!narrative) {
    return null;
  }

  return (
    <div className="bg-linear-to-r from-purple-900/20 to-indigo-900/20 border border-purple-700/50 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
            🤖 AI Analysis
            {narrative.symbol && <span className="text-xs bg-purple-500/30 px-2 py-1 rounded">{narrative.symbol}</span>}
          </h4>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span
              className={`px-2 py-0.5 rounded border ${
                narrative.confidence_label === 'HIGH'
                  ? 'border-green-700 bg-green-900/30 text-green-300'
                  : narrative.confidence_label === 'MEDIUM'
                    ? 'border-yellow-700 bg-yellow-900/30 text-yellow-300'
                    : 'border-red-700 bg-red-900/30 text-red-300'
              }`}
            >
              Confidence: {narrative.confidence_label || 'LOW'}
            </span>
            <span className="text-gray-500">{narrative.confidence_score ?? 0}/100</span>
          </div>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(narrative.generated_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="prose prose-invert max-w-none">
        <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {narrative.narrative}
        </p>
      </div>

      <div className="mt-3 text-xs text-gray-500 border-t border-gray-700 pt-3">
        💡 <span className="text-gray-400">Analysis generated by Gemini 1.5 Flash. Use as reference, not financial advice.</span>
      </div>
    </div>
  );
};
