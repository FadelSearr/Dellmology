'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  Shield,
} from 'lucide-react';

interface CnnPattern {
  symbol: string;
  pattern_name: string;
  pattern_type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  start_date: string;
  end_date: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  pattern_description: string;
  technical_score: number;
}

interface CnnPatternsResponse {
  symbol: string;
  timestamp: string;
  detected_patterns: CnnPattern[];
  total_patterns: number;
  bullish_count: number;
  bearish_count: number;
  confidence_distribution: {
    high: number;
    medium: number;
    low: number;
  };
}

const getPatternIcon = (patternType: string) => {
  switch (patternType) {
    case 'BULLISH':
      return <TrendingUp className="w-5 h-5 text-green-400" />;
    case 'BEARISH':
      return <TrendingDown className="w-5 h-5 text-red-400" />;
    default:
      return <Zap className="w-5 h-5 text-yellow-400" />;
  }
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) {
    return 'bg-green-500/20 border-green-500 text-green-300';
  } else if (confidence >= 0.6) {
    return 'bg-yellow-500/20 border-yellow-500 text-yellow-300';
  } else {
    return 'bg-blue-500/20 border-blue-500 text-blue-300';
  }
};

const getConfidenceLabel = (confidence: number) => {
  if (confidence >= 0.8) return 'HIGH';
  if (confidence >= 0.6) return 'MEDIUM';
  return 'LOW';
};

export const CnnPatternDetector = ({ symbol = 'BBCA' }: { symbol: string }) => {
  const [patterns, setPatterns] = useState<CnnPatternsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<CnnPattern | null>(
    null
  );

  useEffect(() => {
    const fetchPatterns = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/cnn-patterns?symbol=${symbol}&lookback=100&min_confidence=0.6`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch patterns');
        }

        const data: CnnPatternsResponse = await response.json();
        setPatterns(data);
        if (data.detected_patterns.length > 0) {
          setSelectedPattern(data.detected_patterns[0]);
        }
        setError(null);
      } catch (err) {
        console.error('Error fetching patterns:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPatterns();

    // Poll every 60 seconds
    const interval = setInterval(fetchPatterns, 60000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-800/50 border border-gray-700 rounded-lg flex items-center justify-center">
        <p className="text-gray-400">Detecting patterns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 bg-red-900/20 border border-red-700 rounded-lg">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!patterns || patterns.detected_patterns.length === 0) {
    return (
      <div className="w-full p-6 bg-gray-800/50 border border-gray-700 rounded-lg">
        <p className="text-gray-400">No patterns detected for {symbol}</p>
      </div>
    );
  }

  const riskRewardRatio =
    selectedPattern &&
    (selectedPattern.target_price - selectedPattern.entry_price) /
      (selectedPattern.entry_price - selectedPattern.stop_loss);

  return (
    <div className="w-full space-y-6 bg-gray-800/50 border border-gray-700 rounded-lg p-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
          <p className="text-xs text-gray-500 mb-1">TOTAL PATTERNS</p>
          <p className="text-2xl font-bold text-white">
            {patterns.total_patterns}
          </p>
        </div>
        <div className="bg-green-900/20 border border-green-700 rounded p-4">
          <p className="text-xs text-green-400 mb-1">BULLISH</p>
          <p className="text-2xl font-bold text-green-400">
            {patterns.bullish_count}
          </p>
        </div>
        <div className="bg-red-900/20 border border-red-700 rounded p-4">
          <p className="text-xs text-red-400 mb-1">BEARISH</p>
          <p className="text-2xl font-bold text-red-400">
            {patterns.bearish_count}
          </p>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-700 rounded p-4">
          <p className="text-xs text-yellow-400 mb-1">CONFIDENCE DIST</p>
          <p className="text-xs text-yellow-300 mt-2">
            🟢 {patterns.confidence_distribution.high} | 🟡{' '}
            {patterns.confidence_distribution.medium} | 🔵{' '}
            {patterns.confidence_distribution.low}
          </p>
        </div>
      </div>

      {/* Patterns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Detected Patterns List */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white mb-3">
            Detected Patterns
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {patterns.detected_patterns.map((pattern, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border-l-4 cursor-pointer transition ${
                  selectedPattern?.pattern_name === pattern.pattern_name
                    ? 'bg-gray-700/50 border-gray-500'
                    : 'bg-gray-900/50 border-gray-700 hover:bg-gray-800/50'
                }`}
                onClick={() => setSelectedPattern(pattern)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getPatternIcon(pattern.pattern_type)}
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {pattern.pattern_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(pattern.end_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span
                    className={`text-xs px-2 py-1 rounded border ${getConfidenceColor(
                      pattern.confidence
                    )}`}
                  >
                    {getConfidenceLabel(pattern.confidence)}:{' '}
                    {(pattern.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-gray-400">
                    Score: {pattern.technical_score.toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pattern Details */}
        {selectedPattern && (
          <div className="space-y-4 bg-gray-900/50 border border-gray-700 rounded p-4">
            <div>
              <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                {getPatternIcon(selectedPattern.pattern_type)}
                {selectedPattern.pattern_name}
              </h4>
              <p className="text-xs text-gray-400 italic">
                {selectedPattern.pattern_description}
              </p>
            </div>

            {/* Trading Info */}
            <div className="space-y-3 border-t border-gray-700 pt-3">
              {/* Entry */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400">Entry Price</p>
                  <p className="text-lg font-bold text-cyan-400">
                    {selectedPattern.entry_price.toFixed(0)}
                  </p>
                </div>
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>

              {/* Target */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400">Target Price</p>
                  <p className="text-lg font-bold text-green-400">
                    {selectedPattern.target_price.toFixed(0)}
                  </p>
                </div>
                <Target className="w-4 h-4 text-green-400" />
              </div>

              {/* Stop Loss */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400">Stop Loss</p>
                  <p className="text-lg font-bold text-red-400">
                    {selectedPattern.stop_loss.toFixed(0)}
                  </p>
                </div>
                <Shield className="w-4 h-4 text-red-400" />
              </div>

              {/* Risk Reward */}
              {riskRewardRatio && (
                <div className="flex justify-between items-center bg-gray-800/50 rounded p-3">
                  <div>
                    <p className="text-xs text-gray-400">Risk:Reward Ratio</p>
                    <p
                      className={`text-lg font-bold ${
                        riskRewardRatio > 2
                          ? 'text-green-400'
                          : riskRewardRatio > 1
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }`}
                    >
                      1:{riskRewardRatio.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Potential Moves */}
              <div className="text-xs space-y-1 bg-gray-800/50 rounded p-3 border border-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-400">Potential Gain:</span>
                  <span className="text-green-400 font-semibold">
                    +
                    {(
                      ((selectedPattern.target_price -
                        selectedPattern.entry_price) /
                        selectedPattern.entry_price) *
                      100
                    ).toFixed(2)}
                    %
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Potential Loss:</span>
                  <span className="text-red-400 font-semibold">
                    -
                    {(
                      ((selectedPattern.entry_price -
                        selectedPattern.stop_loss) /
                        selectedPattern.entry_price) *
                      100
                    ).toFixed(2)}
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Confidence Badge */}
            <div
              className={`p-3 rounded border-l-4 ${getConfidenceColor(
                selectedPattern.confidence
              )}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold uppercase">
                  {getConfidenceLabel(selectedPattern.confidence)} Confidence
                </span>
                <span className="text-sm font-bold">
                  {(selectedPattern.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full ${
                    selectedPattern.confidence >= 0.8
                      ? 'bg-green-500'
                      : selectedPattern.confidence >= 0.6
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${selectedPattern.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
