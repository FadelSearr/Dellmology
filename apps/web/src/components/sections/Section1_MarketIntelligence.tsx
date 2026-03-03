'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MarketIntelligenceCanvas } from '@/components/dashboard/MarketIntelligenceCanvas';
import { OrderFlowHeatmap } from '@/components/dashboard/OrderFlowHeatmap';
import { ExitWhaleTable } from '@/components/tables/ExitWhaleTable';

interface Section1Props {
  symbol: string;
  isLoading?: boolean;
  timeframe?: '5m' | '15m' | '1h' | '4h' | '1d';
  onTimeframeChange?: (timeframe: string) => void;
  unifiedPowerScore?: number;
}

/**
 * Section 1: Market Intelligence Canvas (Visual Analysis)
 * - Advanced chart with technical overlays
 * - CNN pattern detection
 * - Order flow heatmap
 * - Exit whale detection
 * - Unified Power Score indicator
 */
export const Section1_MarketIntelligence: React.FC<Section1Props> = ({
  symbol,
  isLoading = false,
  timeframe = '1h',
  onTimeframeChange,
  unifiedPowerScore = 75,
}) => {
  const timeframes = ['5m', '15m', '1h', '4h', '1d'];

  const scoreColor =
    unifiedPowerScore >= 80 ? 'text-green-400' : unifiedPowerScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSpinner label="Loading market data..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6" /> Market Intelligence Canvas - {symbol}
          </h2>
          <p className="text-sm text-gray-400 mt-1">Real-time chart analysis with CNN patterns & whale detection</p>
        </div>

        {/* Timeframe Selector */}
        <div className="flex gap-2 bg-gray-800/50 p-1 rounded-lg border border-gray-700">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange?.(tf)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                tf === timeframe
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Signal Rail */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-lg border border-gray-700 bg-linear-to-br from-gray-800/70 to-gray-900/70">
          <div className="text-xs text-gray-400 mb-1">Whale Pressure</div>
          <div className="text-xl font-semibold text-cyan-400">Accumulating</div>
          <div className="text-xs text-gray-500">Net buy climbing vs 7D baseline</div>
        </div>
        <div className="p-4 rounded-lg border border-gray-700 bg-linear-to-br from-gray-800/70 to-gray-900/70">
          <div className="text-xs text-gray-400 mb-1">Pattern Lens</div>
          <div className="text-xl font-semibold text-green-400">Double Bottom</div>
          <div className="text-xs text-gray-500">CNN confidence 0.86 • fresh</div>
        </div>
        <div className="p-4 rounded-lg border border-gray-700 bg-linear-to-br from-gray-800/70 to-gray-900/70">
          <div className="text-xs text-gray-400 mb-1">Risk Regime</div>
          <div className="text-xl font-semibold text-yellow-400">High Vol</div>
          <div className="text-xs text-gray-500">ATR expanding, tighten stops</div>
        </div>
        <div className="p-4 rounded-lg border border-gray-700 bg-linear-to-br from-gray-800/70 to-gray-900/70">
          <div className="text-xs text-gray-400 mb-1">AI Narrative</div>
          <div className="text-xl font-semibold text-purple-400">Caution</div>
          <div className="text-xs text-gray-500">Waiting for bullish follow-through</div>
        </div>
      </div>

      {/* Chart Area */}
      <Card className="space-y-4">
        <div className="h-96 bg-gray-900/50 rounded border border-gray-700 flex items-center justify-center">
          <MarketIntelligenceCanvas symbol={symbol} timeframe={timeframe} />
        </div>

        {/* Unified Power Score Bar */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">📊 Unified Power Score</span>
            <span className={`text-lg font-bold ${scoreColor}`}>{unifiedPowerScore}/100</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                unifiedPowerScore >= 80 ? 'bg-green-500' : unifiedPowerScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${unifiedPowerScore}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {unifiedPowerScore >= 80
              ? '✅ Strong Buy Signal - High Confluence'
              : unifiedPowerScore >= 60
                ? '⚠️ Moderate Signal - Proceed with Caution'
                : '❌ Weak Signal - Hold Position'}
          </p>
        </div>
      </Card>

      {/* Exit Whale Alerts */}
      <Card title="🐋 Exit Whale & Liquidity Hunt" subtitle="Detecting institutional distribution...">
        <ExitWhaleTable symbol={symbol} />
      </Card>

      {/* Order Flow Heatmap */}
      <Card title="💧 Order Flow Heatmap" subtitle="Bid/Ask wall analysis with dark pool detection">
        <OrderFlowHeatmap symbol={symbol} />
      </Card>
    </div>
  );
};
