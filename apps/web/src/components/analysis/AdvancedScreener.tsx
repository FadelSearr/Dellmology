'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';

interface StockScore {
  symbol: string;
  score: number;
  rank: number;
  technical_score: number;
  flow_score: number;
  pressure_score: number;
  volatility_score: number;
  anomaly_score: number;
  current_price: number;
  volatility_percent: number;
  haka_ratio: number;
  broker_net_value: number;
  risk_reward_ratio: number;
  recommendation: string;
  reason: string;
  pattern_matches: string[];
  anomalies_detected: string[];
}

interface ScreeningStats {
  avg_score: number;
  max_score: number;
  min_score: number;
  bullish_count: number;
  bearish_count: number;
  avg_volatility: number;
  avg_rr_ratio: number;
}

type ScreenerMode = 'DAYTRADE' | 'SWING' | 'CUSTOM';

const getRecommendationColor = (recommendation: string) => {
  switch (recommendation) {
    case 'STRONG_BUY':
      return 'bg-green-500/20 border-green-500 text-green-300';
    case 'BUY':
      return 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
    case 'HOLD':
      return 'bg-yellow-500/20 border-yellow-500 text-yellow-300';
    case 'SELL':
      return 'bg-orange-500/20 border-orange-500 text-orange-300';
    case 'STRONG_SELL':
      return 'bg-red-500/20 border-red-500 text-red-300';
    default:
      return 'bg-gray-500/20 border-gray-500 text-gray-300';
  }
};

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-400';
  if (score >= 70) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
};

export const AdvancedScreener = () => {
  const [mode, setMode] = useState<ScreenerMode>('DAYTRADE');
  const [results, setResults] = useState<StockScore[]>([]);
  const [stats, setStats] = useState<ScreeningStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockScore | null>(null);
  const [minScore, setMinScore] = useState(60);
  const [error, setError] = useState<string | null>(null);

  const runScreening = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/advanced-screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          minScore: minScore / 100,
        }),
      });

      if (!response.ok) {
        let message = 'Screening failed';
        try {
          const body = (await response.json()) as { error?: string };
          if (response.status === 423) {
            message = `Screener locked: ${body.error || 'cooling-off active'}`;
          } else if (body?.error) {
            message = body.error;
          }
        } catch {
          if (response.status === 423) {
            message = 'Screener locked: cooling-off active';
          }
        }
        throw new Error(message);
      }

      const data = await response.json();
      setResults(data.results);
      setStats(data.statistics);
      if (data.results.length > 0) {
        setSelectedStock(data.results[0]);
      }
    } catch (err) {
      console.error('Error running screening:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [mode, minScore]);

  // Auto-run screening on mode change
  useEffect(() => {
    runScreening();
  }, [runScreening]);

  return (
    <div className="w-full space-y-6 bg-gray-800/50 border border-gray-700 rounded-lg p-6">
      {/* Controls */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              SCREENER MODE
            </label>
            <div className="flex gap-2">
              {(['DAYTRADE', 'SWING'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded text-sm font-semibold transition ${
                    mode === m
                      ? 'bg-cyan-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Min Score Slider */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              MIN SCORE: {minScore}
            </label>
            <input
              type="range"
              min="30"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <button
              onClick={runScreening}
              disabled={loading}
              className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-600 text-white rounded font-semibold transition"
            >
              {loading ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded p-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
            <p className="text-xs text-gray-500 mb-1">AVG SCORE</p>
            <p className={`text-xl font-bold ${getScoreColor(stats.avg_score)}`}>
              {stats.avg_score.toFixed(0)}
            </p>
          </div>
          <div className="bg-green-900/20 border border-green-700 rounded p-3">
            <p className="text-xs text-green-400 mb-1">BULLISH</p>
            <p className="text-xl font-bold text-green-400">{stats.bullish_count}</p>
          </div>
          <div className="bg-red-900/20 border border-red-700 rounded p-3">
            <p className="text-xs text-red-400 mb-1">BEARISH</p>
            <p className="text-xl font-bold text-red-400">{stats.bearish_count}</p>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3">
            <p className="text-xs text-yellow-400 mb-1">AVG R:R</p>
            <p className="text-xl font-bold text-yellow-400">
              1:{stats.avg_rr_ratio.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stocks List */}
        <div className="lg:col-span-2 space-y-2">
          <h3 className="text-sm font-semibold text-white">
            TOP OPPORTUNITIES ({results.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.map((stock) => (
              <div
                key={stock.symbol}
                onClick={() => setSelectedStock(stock)}
                className={`p-3 rounded border-l-4 cursor-pointer transition ${
                  selectedStock?.symbol === stock.symbol
                    ? 'bg-gray-700/50 border-cyan-500'
                    : 'bg-gray-900/50 border-gray-700 hover:bg-gray-800/50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-white text-lg">
                      #{stock.rank} {stock.symbol}
                    </p>
                    <p className="text-xs text-gray-400">
                      Price: {stock.current_price.toFixed(0)} | Vol:{' '}
                      {stock.volatility_percent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${getScoreColor(stock.score)}`}>
                      {stock.score.toFixed(0)}
                    </p>
                    <p className="text-xs text-gray-400">SCORE</p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span
                    className={`text-xs px-2 py-1 rounded border font-semibold ${getRecommendationColor(
                      stock.recommendation
                    )}`}
                  >
                    {stock.recommendation}
                  </span>
                  <span className="text-xs text-gray-400">{stock.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Details */}
        {selectedStock && (
          <div className="space-y-4 bg-gray-900/50 border border-gray-700 rounded p-4 h-fit">
            <div>
              <h4 className="text-lg font-bold text-white mb-1">
                {selectedStock.symbol}
              </h4>
              <p className="text-xs text-gray-400 mb-3">{selectedStock.reason}</p>

              {/* Score Breakdown */}
              <div className="space-y-2 mb-4">
                <ScoreBar
                  label="Technical"
                  value={selectedStock.technical_score}
                />
                <ScoreBar label="Flow" value={selectedStock.flow_score} />
                <ScoreBar label="Pressure" value={selectedStock.pressure_score} />
                <ScoreBar
                  label="Volatility"
                  value={selectedStock.volatility_score}
                />
                <ScoreBar label="Anomaly" value={selectedStock.anomaly_score} />
              </div>

              {/* Key Metrics */}
              <div className="border-t border-gray-700 pt-3 space-y-2 text-xs">
                <MetricRow
                  label="Current Price"
                  value={`${selectedStock.current_price.toFixed(0)}`}
                />
                <MetricRow
                  label="Volatility"
                  value={`${selectedStock.volatility_percent.toFixed(1)}%`}
                />
                <MetricRow
                  label="HAKA Ratio"
                  value={`${(selectedStock.haka_ratio * 100).toFixed(0)}%`}
                />
                <MetricRow
                  label="Risk:Reward"
                  value={`1:${selectedStock.risk_reward_ratio.toFixed(2)}`}
                  color="text-cyan-400"
                />
              </div>

              {/* Patterns & Anomalies */}
              {selectedStock.pattern_matches.length > 0 && (
                <div className="mt-3 border-t border-gray-700 pt-3">
                  <p className="text-xs font-semibold text-green-400 mb-2">
                    PATTERNS
                  </p>
                  <div className="space-y-1">
                    {selectedStock.pattern_matches.map((p, i) => (
                      <p key={i} className="text-xs text-gray-300">
                        • {p}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {selectedStock.anomalies_detected.length > 0 && (
                <div className="mt-3 border-t border-gray-700 pt-3">
                  <p className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> ANOMALIES
                  </p>
                  <div className="space-y-1">
                    {selectedStock.anomalies_detected.map((a, i) => (
                      <p key={i} className="text-xs text-gray-300">
                        ⚠️ {a}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Components
const ScoreBar = ({ label, value }: { label: string; value: number }) => (
  <div>
    <div className="flex justify-between text-xs mb-1">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${getScoreColor(value)}`}>
        {value.toFixed(0)}
      </span>
    </div>
    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full ${value >= 70 ? 'bg-green-500' : 'bg-yellow-500'}`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

const MetricRow = ({
  label,
  value,
  color = 'text-gray-300',
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <div className="flex justify-between">
    <span className="text-gray-500">{label}:</span>
    <span className={color}>{value}</span>
  </div>
);
