    'use client';

import React, { useState } from 'react';
import { BarChart2, TreePine } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import BacktestRunner from '@/components/dashboard/BacktestRunner';
import RetrainStatusWidget from '@/components/monitoring/RetrainStatusWidget';
import EnhancedModelPerformanceMetrics from '@/components/metrics/EnhancedModelPerformanceMetrics';
import ModelMetricsHistory from '@/components/metrics/ModelMetricsHistory';
import ModelAlertThresholds from '@/components/metrics/ModelAlertThresholds';
import CompareModelMetrics from '@/components/metrics/CompareModelMetrics';

interface Section5Props {
  symbol: string;
  systemStatus?: {
    database: boolean;
    streamer: boolean;
    dataSync: boolean;
  };
  modelMetrics?: {
    tradesPerMin: number;
    latencyMs: number;
    uptime: string;
  };
}

/**
 * Section 5: Performance & Infrastructure Lab (Footer)
 * - System health status
 * - Backtesting rig with XAI
 * - Model performance metrics
 * - Infrastructure logs
 * - Model comparison tools
 */
export const Section5_Performance: React.FC<Section5Props> = ({
  symbol,
  systemStatus = {
    database: true,
    streamer: true,
    dataSync: true,
  },
  modelMetrics = {
    tradesPerMin: 342,
    latencyMs: 45,
    uptime: '99.8%',
  },
}) => {
  const [showBacktest, setShowBacktest] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-6 h-6 text-teal-400" />
        <h2 className="text-2xl font-bold text-white">📑 Performance & Infrastructure Lab</h2>
      </div>

      {/* Top Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System Status */}
        <Card title="🖥️ System Status" subtitle="Backend health indicators">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Database:</span>
              <StatusBadge
                status={systemStatus.database ? 'success' : 'critical'}
                label={systemStatus.database ? 'Connected' : 'Offline'}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Streamer:</span>
              <StatusBadge
                status={systemStatus.streamer ? 'success' : 'critical'}
                label={systemStatus.streamer ? 'Active' : 'Offline'}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Data Sync:</span>
              <StatusBadge
                status={systemStatus.dataSync ? 'success' : 'warning'}
                label={systemStatus.dataSync ? 'Live' : 'Lagging'}
                size="sm"
              />
            </div>
          </div>
        </Card>

        {/* Metrics */}
        <Card title="📊 Latest Metrics" subtitle="Real-time performance data">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Trades/min:</span>
              <span className="text-cyan-400 font-mono font-semibold">{modelMetrics.tradesPerMin}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Latency:</span>
              <span className="text-cyan-400 font-mono font-semibold">{modelMetrics.latencyMs}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Uptime:</span>
              <span className="text-green-400 font-mono font-semibold">{modelMetrics.uptime}</span>
            </div>
          </div>
        </Card>

        {/* Model Info */}
        <Card title="🤖 AI Analysis" subtitle="Current model status">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Model:</span>
              <span className="text-purple-400 font-semibold">Gemini 1.5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Narratives:</span>
              <StatusBadge status="success" label="Live" size="sm" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Last Update:</span>
              <span className="text-gray-400 text-xs">Now</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Model Performance Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <RetrainStatusWidget />
        </div>
        <div>
          <EnhancedModelPerformanceMetrics symbol={symbol} limit={30} />
        </div>
      </div>

      {/* Metrics History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelMetricsHistory symbol={symbol} limit={30} />
        <ModelAlertThresholds symbol={symbol} />
      </div>

      {/* Model Comparison */}
      <Card title="🔄 Model Comparison (Champion vs Challenger)" subtitle="A/B testing framework">
        <CompareModelMetrics />
      </Card>

      {/* Backtesting Section */}
      <Card title="🧪 Automated Backtesting Rig & XAI" subtitle="Historical strategy testing with explainability">
        {!showBacktest ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <TreePine className="w-12 h-12 text-teal-400 mb-4" />
            <p className="text-gray-400 mb-4">
              Test your trading strategy on historical data (2020-2024) with AI explanations
            </p>
            <button
              onClick={() => setShowBacktest(true)}
              className="px-6 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-white font-semibold transition-colors"
            >
              Launch Backtest
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setShowBacktest(false)}
              className="mb-4 px-4 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors"
            >
              ← Back
            </button>
            <BacktestRunner />
          </div>
        )}
      </Card>

      {/* Infrastructure Logs */}
      <Card title="📋 Infrastructure Logs" subtitle="Backend processing details">
        <div className="bg-gray-900/50 p-3 rounded font-mono text-xs text-gray-400 max-h-48 overflow-y-auto space-y-1">
          <div>
            <span className="text-gray-500">[2025-03-02 14:32:21.456]</span>{' '}
            <span className="text-green-400">✓</span> WebSocket connected to stockbit.com
          </div>
          <div>
            <span className="text-gray-500">[2025-03-02 14:32:22.123]</span>{' '}
            <span className="text-cyan-400">→</span> Streaming trades: BBCA (145 tx/s), ASII (98 tx/s)
          </div>
          <div>
            <span className="text-gray-500">[2025-03-02 14:32:45.789]</span>{' '}
            <span className="text-yellow-400">⚠</span> Z-Score spike detected on MSFT (+3.2σ)
          </div>
          <div>
            <span className="text-gray-500">[2025-03-02 14:33:00.012]</span>{' '}
            <span className="text-green-400">✓</span> CNN pattern: Double Bottom on GOOGL (confidence 0.94)
          </div>
          <div>
            <span className="text-gray-500">[2025-03-02 14:33:15.456]</span>{' '}
            <span className="text-blue-400">→</span> Gemini narrative generated for BBCA (512 tokens)
          </div>
          <div>
            <span className="text-gray-500">[2025-03-02 14:33:30.789]</span>{' '}
            <span className="text-green-400">✓</span> Database sync complete (892ms latency)
          </div>
        </div>
      </Card>
    </div>
  );
};
