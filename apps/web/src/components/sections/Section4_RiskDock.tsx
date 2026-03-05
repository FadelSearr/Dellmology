'use client';

import React from 'react';
import { Shield, Send, Bell, Download } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { RealtimeTrades } from '@/components/monitoring/RealtimeTrades';
import { StatusBadge } from '@/components/common/StatusBadge';

interface Section4Props {
  symbol: string;
  trades?: any[];
  unrealizedPnL?: number;
  maxLot?: number;
  stopLossPercent?: number;
  volatilityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Section 4: Risk & Tactical Dock (Execution)
 * - Smart position sizing calculator
 * - Action dock (Telegram, alerts, PDF)
 * - Real-time trades feed
 * - Risk metrics dashboard
 */
export const Section4_RiskDock: React.FC<Section4Props> = ({
  symbol,
  trades = [],
  unrealizedPnL = 2500000,
  maxLot = 250,
  stopLossPercent = 2.5,
  volatilityLevel = 'HIGH',
}) => {
  const atrValue = 145.5;
  const accountRisk = 5000000; // 5M IDR

  // Example beta value, in real use this should come from props or context
  const portfolioBeta = 1.62;
  const betaThreshold = 1.5;
  const isHighBeta = portfolioBeta > betaThreshold;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-6 h-6 text-orange-400" />
        <h2 className="text-2xl font-bold text-white">🛡️ Risk & Tactical Dock</h2>
      </div>

      {/* Smart Position Sizing Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Position Calculator Card */}
        <Card title="💰 Smart Position Sizing" subtitle="ATR-based risk calculation">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Capital:</span>
              <span className="text-cyan-400 font-mono">Rp 5.00M</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">ATR (20):</span>
              <span className="text-yellow-400 font-mono">{atrValue}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Today&apos;s Vol:</span>
              <StatusBadge status="critical" label={volatilityLevel} size="sm" />
            </div>

            <div className="border-t border-gray-700 pt-3 mt-3">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400 font-semibold">Recommended:</span>
                <span className="text-2xl font-bold text-green-400">{maxLot}</span>
              </div>
              <p className="text-xs text-gray-400">Max lot @ 2.5% stop loss</p>
            </div>

            <button className="w-full mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-sm font-semibold transition-colors">
              Execute Trade
            </button>
          </div>
        </Card>

        {/* Metrics */}
        <Card title="📊 Current Metrics" subtitle="Unrealized P&L snapshot">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Unrealized P&L:</span>
              <span className="text-green-400 font-semibold font-mono">+Rp {(unrealizedPnL / 1000000).toFixed(2)}M</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Win Rate:</span>
              <span className="text-cyan-400 font-mono">68%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk/Reward:</span>
              <span className="text-yellow-400 font-mono">1:2.5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max Drawdown:</span>
              <span className="text-orange-400 font-mono">-8.5%</span>
            </div>
          </div>
        </Card>

        {/* Beta-Weighting Analysis */}
        <Card title="🧮 Beta-Weighting Analysis" subtitle="Systemic risk indicator">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Portfolio Beta:</span>
              <span className={isHighBeta ? "text-red-400 font-bold" : "text-cyan-400 font-mono"}>{portfolioBeta.toFixed(2)}</span>
            </div>
            {isHighBeta && (
              <div className="bg-red-900/60 border border-red-600 rounded-lg p-2 text-xs text-red-300 font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Systemic Risk High: Portfolio too sensitive to Market Crash.
              </div>
            )}
            <p className="text-xs text-gray-400">If beta &gt; 1.5, reduce position size to mitigate market-wide risk.</p>
          </div>
        </Card>

        {/* Action Dock */}
        <Card title="⚡ Action Dock" subtitle="Quick execution buttons">
          <div className="space-y-2">
            <button className="w-full px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-600 rounded-lg text-blue-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <Send className="w-4 h-4" /> Send to Telegram
            </button>
            <button className="w-full px-3 py-2 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-600 rounded-lg text-yellow-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <Bell className="w-4 h-4" /> Set Price Alert
            </button>
            <button className="w-full px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-600 rounded-lg text-purple-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Export PDF
            </button>
          </div>
        </Card>
      </div>

      {/* Real-time Trades Feed */}
      <Card title="📈 Real-time Trades" subtitle={`Live trades for ${symbol}`}>
        <RealtimeTrades trades={trades.filter((t) => t.symbol === symbol)} />
      </Card>
    </div>
  );
};
