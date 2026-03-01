'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import TradingViewWidget from './TradingViewWidget';

interface MarketIntelligence {
  symbol: string;
  timeframe: string;
  metrics: {
    haka_volume: number;
    haki_volume: number;
    total_volume: number;
    haka_ratio: number;
    pressure_index: number;
  };
  volatility: {
    percentage: number;
    classification: string;
  };
  unified_power_score: {
    score: number;
    signal: string;
    components: {
      haka_strength: number;
      volume_momentum: number;
      price_strength: number;
      consistency: number;
    };
  };
  timestamp: string;
}

export const MarketIntelligenceCanvas = ({ symbol, timeframe = '1h' }: { symbol: string; timeframe?: string }) => {
  const [data, setData] = useState<MarketIntelligence | null>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketIntelligence = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/market-intelligence?symbol=${symbol}&timeframe=${timeframe}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch market intelligence');
        }

        const data = await response.json();
        setData(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching market intelligence:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    const fetchPrediction = async () => {
      try {
        const resp = await fetch(`/api/prediction?symbol=${symbol}`);
        if (resp.ok) {
          const json = await resp.json();
          if (json.success) {
            setPrediction(json.data);
          }
        }
      } catch (err) {
        console.error('Prediction fetch error', err);
      }
    };

    fetchMarketIntelligence();
    fetchPrediction();

    // Poll every 30 seconds
    const interval = setInterval(fetchMarketIntelligence, 30000);
    const interval2 = setInterval(fetchPrediction, 60000);
    return () => { clearInterval(interval); clearInterval(interval2); };
  }, [symbol, timeframe]);

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse">
        <div className="h-8 bg-gray-700 rounded mb-4 w-1/3"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-gray-800/50 border border-red-700 rounded-lg p-6 text-red-400">
        <p>Error: {error}</p>
      </div>
    );
  }

  const { metrics, volatility, unified_power_score: ups } = data;
  const hakaRatio = metrics.haka_ratio || 0;
  const pressure = metrics.pressure_index || 0;

  // send telegram alert when UPS threshold crossed
  useEffect(() => {
    if (!data) return;
    const score = ups.score;
    let signal: string | null = null;
    if (score >= 85) signal = 'STRONG_BUY';
    else if (score <= 30) signal = 'STRONG_SELL';

    if (signal) {
      // call backend alert endpoint
      fetch('/api/telegram-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trading',
          symbol,
          data: {
            signal,
            price: 0, // price not available here
            reason: `UPS score ${score}`,
            confidence: score,
          },
        }),
      }).catch((e) => console.error('Telegram alert failed', e));
    }
  }, [data, symbol, ups.score]);
  // Determine UPS color based on score
  const getUPSColor = (score: number) => {
    if (score > 70) return 'text-green-500 bg-green-500/10';
    if (score > 60) return 'text-lime-500 bg-lime-500/10';
    if (score < 40) return 'text-red-500 bg-red-500/10';
    if (score < 50) return 'text-orange-500 bg-orange-500/10';
    return 'text-yellow-500 bg-yellow-500/10';
  };

  const getPressureArrow = (pressure: number) => {
    if (pressure > 10) return <TrendingUp className="text-green-500" size={20} />;
    if (pressure < -10) return <TrendingDown className="text-red-500" size={20} />;
    return <Activity className="text-gray-400" size={20} />;
  };

  return (
    <div className="bg-linear-to-br from-gray-800/60 to-gray-900/60 border border-gray-700 rounded-lg p-6 space-y-6">
      {/* TradingView Chart */}
      <div className="w-full">
        <TradingViewWidget symbol={symbol} interval={timeframe} />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">{symbol}</h2>
          <p className="text-sm text-gray-400">
            {timeframe} Timeframe • Updated: {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              fetch(`/api/cnn`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'predict', symbol }),
              }).then(() => fetch(`/api/prediction?symbol=${symbol}`)).catch(console.error);
            }}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
          >
            🔄 Refresh CNN
          </button>
          <button
            onClick={() => {
              fetch(`/api/cnn`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'train', symbol }),
              }).then(() => alert('Training started')).catch(console.error);
            }}
            className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
          >
            ⚙️ Train CNN
          </button>
          <div className={`p-4 rounded-lg ${getUPSColor(ups.score)}`}>
            <div className="text-3xl font-bold">{ups.score}</div>
            <div className="text-xs mt-1">{ups.signal}</div>
          </div>
          {prediction && (
            <div className="ml-4 p-2 bg-gray-800/40 rounded-lg text-sm flex items-center">
              <span className="font-semibold">CNN:</span>
              <span className="ml-2">
                {prediction.prediction} ({(prediction.confidence_up*100).toFixed(1)}% up)
              </span>
            </div>
          )}
          <button
            onClick={async () => {
              // toggle simple fetch and show explanation below by updating state
              try {
                setLoading(true)
                const r = await fetch('/api/xai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbol, top_k: 8 }),
                })
                if (!r.ok) throw new Error('XAI request failed')
                const j = await r.json();
                // attach the explanation to data so we can render XAIReport inline
                (data as any).xai = j.explanation;
                setData({ ...(data as any) })
              } catch (e) {
                console.error('XAI fetch failed', e)
              } finally {
                setLoading(false)
              }
            }}
            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs"
          >
            🧭 Explain
          </button>
        </div>
      </div>

      {/* UPS Component Breakdown */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">HAKA Strength</div>
          <div className="text-2xl font-bold text-cyan-400">{ups.components.haka_strength.toFixed(1)}</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Volume Momentum</div>
          <div className="text-2xl font-bold text-blue-400">{ups.components.volume_momentum.toFixed(1)}</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Price Strength</div>
          <div className="text-2xl font-bold text-purple-400">{ups.components.price_strength.toFixed(1)}</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Consistency</div>
          <div className="text-2xl font-bold text-yellow-400">{ups.components.consistency.toFixed(1)}</div>
        </div>
      </div>

      {/* HAKA/HAKI Analysis */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">HAKA (Aggressive Buy)</span>
            <TrendingUp className="text-green-500" size={16} />
          </div>
          <div className="text-3xl font-bold text-green-500 mb-2">
            {((metrics.haka_volume / (metrics.total_volume || 1)) * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">
            {(metrics.haka_volume / 1e6).toFixed(1)}M lots
          </div>
          <div className="mt-2 w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full"
              style={{ width: hakaRatio > 0 ? `${Math.min(hakaRatio, 100)}%` : '0%' }}
            ></div>
          </div>
        </div>

        <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">HAKI (Aggressive Sell)</span>
            <TrendingDown className="text-red-500" size={16} />
          </div>
          <div className="text-3xl font-bold text-red-500 mb-2">
            {((metrics.haki_volume / (metrics.total_volume || 1)) * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">
            {(metrics.haki_volume / 1e6).toFixed(1)}M lots
          </div>
          <div className="mt-2 w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full"
              style={{ width: metrics.haki_volume > 0 ? `${Math.min((metrics.haki_volume / metrics.total_volume) * 100, 100)}%` : '0%' }}
            ></div>
          </div>
        </div>
      </div>

      {/* Pressure Index & Volatility */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Buy/Sell Pressure</span>
            {getPressureArrow(pressure)}
          </div>
          <div className={`text-2xl font-bold ${pressure > 0 ? 'text-green-500' : pressure < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {pressure > 0 ? '+' : ''}{pressure.toFixed(2)}%
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {pressure > 10 && 'Strong buying pressure'}
            {pressure < -10 && 'Strong selling pressure'}
            {pressure >= -10 && pressure <= 10 && 'Balanced pressure'}
          </p>
        </div>

        <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Volatility</span>
            <Zap className={volatility.classification === 'HIGH' ? 'text-red-500' : volatility.classification === 'MEDIUM' ? 'text-yellow-500' : 'text-green-500'} size={16} />
          </div>
          <div className={`text-2xl font-bold ${volatility.classification === 'HIGH' ? 'text-red-500' : volatility.classification === 'MEDIUM' ? 'text-yellow-500' : 'text-green-500'}`}>
            {volatility.percentage.toFixed(2)}%
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {volatility.classification} volatility
          </p>
        </div>
      </div>

      {/* Signal Interpretation */}
      <div className={`border rounded-lg p-4 ${
        ups.signal === 'STRONG_BUY' ? 'bg-green-500/10 border-green-500/30' :
        ups.signal === 'BUY' ? 'bg-lime-500/10 border-lime-500/30' :
        ups.signal === 'STRONG_SELL' ? 'bg-red-500/10 border-red-500/30' :
        ups.signal === 'SELL' ? 'bg-orange-500/10 border-orange-500/30' :
        'bg-gray-800/50 border-gray-700'
      }`}>
        <p className="text-sm text-gray-300">
          <strong>Signal:</strong> {ups.signal.replace(/_/g, ' ')}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          {ups.signal === 'STRONG_BUY' && '🟢 Akumulasi agresif terdeteksi. Entry point menarik.'}
          {ups.signal === 'BUY' && '🟢 Sentimen positif. Pertahankan posisi buy.'}
          {ups.signal === 'STRONG_SELL' && '🔴 Distribusi masif terdeteksi. Hindari entry.'}
          {ups.signal === 'SELL' && '🔴 Tekanan jual tinggi. Caution zone.'}
          {ups.signal === 'NEUTRAL' && '🟡 Pasar seimbang. Tunggu breakout.'}
        </p>
      </div>
      {/* XAI Explanation (if available) */}
      {data && (data as any).xai && (
        <div>
          <h3 className="text-sm text-gray-300 mb-2">Model Explainability</h3>
          <div className="grid grid-cols-1 gap-2">
            <div className="col-span-1">
              {/* Inline render of XAI summary */}
              <div className="bg-gray-900/40 border border-gray-700 rounded p-3 text-sm">
                <div className="flex justify-between mb-2">
                  <div className="font-medium">Top contributors</div>
                  <div className="text-xs text-gray-400">Up prob: {(data as any).xai.base_prob_up ? ((data as any).xai.base_prob_up*100).toFixed(1) : 'N/A'}%</div>
                </div>
                <ul className="text-xs space-y-1">
                  {(data as any).xai.top_features.map((t: any, i: number) => (
                    <li key={i} className="flex justify-between">
                      <span>{t.feature} (d-{t.day_index})</span>
                      <span className="font-mono">{t.importance.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
