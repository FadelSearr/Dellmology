'use client';

import { useEffect, useState } from 'react';

interface AInarrative {
  type: string;
  symbol?: string;
  narrative: string;
  primary_narrative?: string;
  bearish_counter_case?: string | null;
  confidence_score?: number;
  confidence_label?: 'LOW' | 'MEDIUM' | 'HIGH';
  market_bias?: 'BUY' | 'SELL' | 'NEUTRAL';
  market_bias_score?: number;
  generated_at: string;
}

interface BrokerNarrativePayload {
  type: 'broker' | 'regime' | 'screener' | 'swot';
  symbol: string;
  data: Record<string, unknown>;
}

export const AINarrativeDisplay = ({ 
  symbol, 
  type = 'broker',
  autoRefresh = false,
  combatMode = false
  }: { 
  symbol: string; 
  type?: 'broker' | 'regime' | 'screener' | 'swot';
  autoRefresh?: boolean;
  combatMode?: boolean;
  }) => {
  const [narrative, setNarrative] = useState<AInarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdversarial, setShowAdversarial] = useState(false);

  useEffect(() => {
    const generateNarrative = async () => {
      try {
        setLoading(true);

        function isBroker(obj: unknown): obj is { is_whale?: boolean } {
          return !!obj && typeof obj === 'object' && 'is_whale' in (obj as Record<string, unknown>);
        }

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
            whales: Array.isArray(brokerData.brokers)
              ? brokerData.brokers.filter(isBroker).filter((b: any) => Boolean((b as any).is_whale)).slice(0, 3)
              : [],
            wash_sale_score: brokerData.stats.wash_sale_score || 0,
            consistency: brokerData.stats.total_brokers > 0 ? 1 : 0,
            period: '7 days'
          };
        } else if (type === 'regime') {
          const res = await fetch('/api/market-regime');
          requestPayload.data = await res.json();
        } else if (type === 'swot') {
          const [brokerRes, regimeRes, marketRes] = await Promise.all([
            fetch(`/api/broker-flow?symbol=${symbol}&days=7&filter=mix`).catch(() => null),
            fetch(`/api/market-regime?symbol=${symbol}`).catch(() => null),
            fetch(`/api/market-intelligence?symbol=${symbol}&timeframe=1h`).catch(() => null),
          ]);

          const brokerData = brokerRes && brokerRes.ok ? await brokerRes.json() : null;
          const regimeData = regimeRes && regimeRes.ok ? await regimeRes.json() : null;
          const marketData = marketRes && marketRes.ok ? await marketRes.json() : null;

          const washSaleScore = Number(brokerData?.stats?.wash_sale_score || 0);
          const whaleCount = Array.isArray(brokerData?.brokers)
            ? brokerData.brokers.filter((b: any) => isBroker(b) && Boolean((b as any).is_whale)).length
            : 0;
          const upsScore = Number(marketData?.unified_power_score?.score || 0);
          const regime = String(regimeData?.regime || 'UNKNOWN');
          const volatility = String(regimeData?.volatility || marketData?.volatility?.classification || 'UNKNOWN');

          const strengths: string[] = [];
          const weaknesses: string[] = [];
          const opportunities: string[] = [];
          const threats: string[] = [];

          if (upsScore >= 70) strengths.push(`UPS kuat (${upsScore.toFixed(0)}) menunjukkan konfluensi sinyal`);
          if (whaleCount >= 2) strengths.push(`Dukungan akumulasi dari ${whaleCount} broker whale`);
          if (regime === 'UPTREND') strengths.push('Regime pasar mendukung skenario lanjutan bullish');

          if (washSaleScore >= 50) weaknesses.push(`Wash-sale risk meningkat (${washSaleScore.toFixed(1)}%)`);
          if (volatility === 'HIGH' || volatility === 'EXTREME') weaknesses.push(`Volatilitas ${volatility} meningkatkan risiko whipsaw`);
          if (upsScore > 0 && upsScore < 55) weaknesses.push(`UPS moderat (${upsScore.toFixed(0)}) belum konfirmasi penuh`);

          if (regime === 'UPTREND' && upsScore >= 60) opportunities.push('Momentum continuation berpeluang jika volume konfirmasi');
          if (whaleCount > 0 && washSaleScore < 50) opportunities.push('Akumulasi broker berpotensi membuka swing setup');

          if (regime === 'DOWNTREND') threats.push('Tekanan trend mayor dapat membatalkan entry agresif');
          if (washSaleScore >= 65) threats.push('Risiko fake move dari churn tinggi tanpa akumulasi riil');
          if (volatility === 'EXTREME') threats.push('Lonjakan volatilitas berpotensi trigger stop-loss beruntun');

          requestPayload.data = {
            strengths: strengths.length > 0 ? strengths : ['Data strength terbatas, perlu konfirmasi tambahan'],
            weaknesses: weaknesses.length > 0 ? weaknesses : ['Belum ada kelemahan dominan dari data ringkas'],
            opportunities: opportunities.length > 0 ? opportunities : ['Opportunity muncul jika ada konfirmasi volume lanjutan'],
            threats: threats.length > 0 ? threats : ['Ancaman utama berasal dari perubahan sentimen makro mendadak'],
            summary: {
              ups_score: upsScore,
              wash_sale_score: washSaleScore,
              whale_count: whaleCount,
              regime,
              volatility,
            },
          };
        } else {
          // other types (screener, swot) may not require pre-fetched data
          requestPayload.data = {};
        }

        // Prefer the new detailed XAI endpoint, fallback to legacy `/api/narrative`.
        let response = await fetch('/api/xai/narrative_detailed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        }).catch(() => null as any);

        if (!response || !response.ok) {
          // Fallback: try legacy endpoint
          response = await fetch('/api/narrative', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
          });
        }

        if (!response || !response.ok) {
          const text = response ? await response.text() : 'no response';
          console.error('Narrative API error', response?.status, text);
          throw new Error(`Failed to generate narrative (${response?.status ?? 'no-response'})`);
        }

        const resJson = await response.json();

        // Map backend shape to local `AInarrative` shape.
        const mapped: any = {
          type,
          symbol,
          narrative: resJson.primary || resJson.narrative || '',
          primary_narrative: resJson.primary || resJson.primary_narrative || resJson.narrative || '',
          bearish_counter_case: resJson.adversarial || resJson.bearish_counter_case || null,
          confidence_score: typeof resJson.confidence === 'number' ? resJson.confidence : resJson.confidence_score ?? null,
          confidence_label: resJson.confidence_label || (typeof resJson.confidence === 'number'
            ? (resJson.confidence >= 75 ? 'HIGH' : resJson.confidence >= 50 ? 'MEDIUM' : 'LOW')
            : undefined),
          market_bias: resJson.market_bias,
          market_bias_score: resJson.market_bias_score ?? resJson.ups_score,
          generated_at: resJson.generated_at || new Date().toISOString(),
        } as AInarrative;

        setNarrative(mapped);
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

  const primaryNarrative = (narrative.primary_narrative || narrative.narrative || '').trim();
  const bearishCounterCase = (narrative.bearish_counter_case || '').trim();

    if (combatMode) {
      // Combat Mode: Short narrative, big UPS, hide logs/footer
      const shortNarrative = primaryNarrative.split(/\.|,|;/)[0].split(' ').slice(0, 3).join(' ').toUpperCase();
      return (
        <div className="bg-gradient-to-r from-red-900/40 to-yellow-900/40 border-2 border-red-700 rounded-lg p-6 flex flex-col items-center justify-center">
          <div className="text-4xl font-extrabold text-yellow-300 mb-2 tracking-wide">{shortNarrative}</div>
          <div className="text-2xl font-bold text-cyan-400 mb-1">UPS: {narrative.market_bias_score ?? narrative.confidence_score ?? 0}/100</div>
          {/* No footer, no logs, no bearish counter-case */}
        </div>
      );
    }

    // Normal mode
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
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdversarial(!showAdversarial)}
              className={`text-xs px-2 py-1 rounded border ${showAdversarial ? 'border-rose-600 bg-rose-900/20 text-rose-200' : 'border-gray-600 bg-gray-800/20 text-gray-300'}`}
            >
              {showAdversarial ? 'Adversarial' : 'Primary'}
            </button>
            <span className="text-xs text-gray-500">{new Date(narrative.generated_at).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="prose prose-invert max-w-none">
          <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
            {showAdversarial && bearishCounterCase ? bearishCounterCase : primaryNarrative}
          </p>
        </div>

        {bearishCounterCase && (
          <div className="mt-3 rounded border border-rose-700/50 bg-rose-900/20 p-3">
            <div className="text-xs font-semibold text-rose-300 mb-1">🛡️ Bearish Counter-Case</div>
            <p className="text-xs text-rose-100/90 whitespace-pre-wrap font-mono">{bearishCounterCase}</p>
          </div>
        )}

        <div className="mt-3 text-xs text-gray-500 border-t border-gray-700 pt-3">
          💡 <span className="text-gray-400">Analysis generated by Gemini 1.5 Flash. Use as reference, not financial advice.</span>
        </div>
      </div>
    );
};
