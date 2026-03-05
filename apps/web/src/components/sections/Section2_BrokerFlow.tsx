'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingDown, AlertCircle } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { BrokerFlowTable } from '@/components/tables/BrokerFlowTable';
import { FlowEngine } from '@/components/dashboard/FlowEngine';
import { NegotiatedMarketMonitor } from '@/components/monitoring/NegotiatedMarketMonitor';
import { WhaleIdentityClustering } from '@/components/analysis/WhaleIdentityClustering';

interface Section2Props {
  symbol: string;
}


/**
 * Section 2: The Flow Engine (Bandarmology Hub)
 * - Broker flow control & filters
 * - Deep broker flow table with heatmap
 * - Net accumulation values
 * - Whale Z-Score detection
 * - Wash sale alerts
 */
export const Section2_BrokerFlow: React.FC<Section2Props> = ({
  symbol,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'SMART_MONEY' | 'WHALE' | 'RETAIL'>('ALL');
  const [timelineType, setTimelineType] = useState<'1D' | '7D' | '14D' | '21D'>('7D');
  const [brokerData, setBrokerData] = useState<any[]>([]);
  const [brokerStats, setBrokerStats] = useState<{
    wash_sale_score?: number;
    avg_net_value?: number;
    std_deviation?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const daysForTimeline = (t: string) => {
    switch (t) {
      case '1D': return 1;
      case '7D': return 7;
      case '14D': return 14;
      case '21D': return 21;
      default: return 7;
    }
  };

  // fetch broker flow whenever relevant params change
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const resp = await fetch(`/api/broker-flow?symbol=${encodeURIComponent(symbol)}&days=${daysForTimeline(timelineType)}&filter=${
          filterType === 'ALL' ? 'mix' : filterType.toLowerCase()
        }`);
        if (resp.ok) {
          const json = await resp.json();
          setBrokerData(json.brokers || []);
          setBrokerStats(json.stats || null);
        }
      } catch (err) {
        console.error('broker flow fetch error', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (symbol) load();
  }, [symbol, timelineType, filterType]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-6 h-6 text-cyan-400" />
        <h2 className="text-2xl font-bold text-white">🌊 Flow Engine - Bandarmology Hub</h2>
      </div>

      {/* Control Bar */}
      <Card className="space-y-4" noPadding>
        <div className="p-4 border-b border-gray-700">
          <div className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Broker Flow Controls</div>

          {/* Filter Buttons */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['ALL', 'SMART_MONEY', 'WHALE', 'RETAIL'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setFilterType(filter)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    filter === filterType
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/50'
                      : 'bg-gray-700/30 text-gray-400 hover:bg-gray-700/50'
                  }`}
                >
                  {filter === 'SMART_MONEY' ? '💰 Smart Money' : filter === 'WHALE' ? '🐋 Whale' : filter === 'RETAIL' ? '👥 Retail' : '🎯 All'}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex gap-2">
              {(['1D', '7D', '14D', '21D'] as const).map((timeline) => (
                <button
                  key={timeline}
                  onClick={() => setTimelineType(timeline)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    timeline === timelineType
                      ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-600/50'
                      : 'bg-gray-700/30 text-gray-400 hover:bg-gray-700/50'
                  }`}
                >
                  {timeline}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Flow Engine Visualization */}
        <div className="p-4">
          <FlowEngine symbol={symbol} />
        </div>
      </Card>

      {/* Broker Flow Table */}
      <Card title="📊 Deep Broker Flow Analysis" subtitle="Net buy/sell values with consistency scores">
        <BrokerFlowTable symbol={symbol} data={brokerData} filterType={filterType} />
      </Card>

      {/* Z-Score & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Whale Z-Score */}
        <Card title="📈 Whale Z-Score Detection" subtitle="Volume anomaly indicator">
          <div className="space-y-3">
            {(() => {
              const topBroker = (brokerData || [])
                .slice()
                .sort((a, b) => Math.abs(Number(b?.z_score || 0)) - Math.abs(Number(a?.z_score || 0)))[0];
              const topZ = Number(topBroker?.z_score || 0);
              const normalizedWidth = Math.min(100, Math.round((Math.abs(topZ) / 3) * 100));
              const directionTone = topZ >= 0 ? 'text-cyan-400' : 'text-orange-400';
              const signalLabel = Math.abs(topZ) >= 2 ? 'Anomaly detected' : 'Within normal range';

              return (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Current Z-Score:</span>
                    <span className={`text-xl font-bold ${directionTone}`}>
                      {topZ >= 0 ? '+' : ''}{topZ.toFixed(2)}σ
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${topZ >= 0 ? 'bg-cyan-500' : 'bg-orange-500'}`} style={{ width: `${normalizedWidth}%` }} />
                  </div>
                  <p className="text-xs text-gray-400">
                    {signalLabel}
                    {topBroker?.broker_id ? ` • Top broker: ${topBroker.broker_id}` : ''}
                  </p>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Wash Sale Alert */}
        <Card title="🚨 Wash Sale Detection" subtitle="Volume legitimacy check">
          <div className="space-y-3">
            {(() => {
              const washSaleScore = Number(brokerStats?.wash_sale_score || 0);
              const isRisky = washSaleScore >= 60;
              const ratioHint = `${washSaleScore.toFixed(1)}%`;

              return (
                <>
                  <StatusBadge
                    status={isRisky ? 'critical' : 'success'}
                    label={isRisky ? 'HIGH CHURN ALERT' : 'FLOW HEALTHY'}
                    icon={<AlertCircle className="w-3 h-3" />}
                  />
                  <p className="text-xs text-gray-400">
                    {isRisky
                      ? 'High turnover but low net accumulation - possible artificial activity.'
                      : 'No significant wash-sale pressure detected from broker-flow aggregate.'}
                  </p>
                  <div className="text-xs text-gray-500 mt-2">
                    <div>Wash Sale Score: {ratioHint}</div>
                    <div>Avg Net Value: {Number(brokerStats?.avg_net_value || 0).toLocaleString('id-ID')}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </Card>
      </div>
      {/* Negotiated Market Monitor Feed */}
      {/* Market-Wide Net Summary & Artificial Liquidity Warning */}
      <div className="mt-4">
        <Card title="🌐 Market-Wide Net Summary" subtitle="Concentration & liquidity health">
          {(() => {
            // Example logic, replace with real data
            const totalNetBuy = brokerData.reduce((sum, b) => sum + (Number(b?.net_value) || 0), 0);
            const topBrokerNet = brokerData.length > 0 ? Number(brokerData[0]?.net_value || 0) : 0;
            const concentrationRatio = brokerData.length > 1 ? topBrokerNet / Math.abs(totalNetBuy || 1) : 0;
            const isArtificialLiquidity = concentrationRatio > 0.7 && brokerData.length > 3;

            return (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Net Buy:</span>
                  <span className={totalNetBuy > 0 ? "text-green-400 font-bold" : "text-orange-400 font-bold"}>{totalNetBuy.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Concentration Ratio:</span>
                  <span className={isArtificialLiquidity ? "text-red-400 font-bold" : "text-cyan-400 font-mono"}>{(concentrationRatio * 100).toFixed(1)}%</span>
                </div>
                {isArtificialLiquidity && (
                  <div className="bg-red-900/60 border border-red-600 rounded-lg p-2 text-xs text-red-300 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Artificial Liquidity Warning: Accumulation dominated by one broker, low healthy participation.
                  </div>
                )}
                <p className="text-xs text-gray-400">Healthy accumulation should involve 2-3 major brokers. High concentration may indicate artificial liquidity.</p>
              </div>
            );
          })()}
        </Card>
        <div className="mt-4">
          <NegotiatedMarketMonitor />
          <div className="mt-4">
            <WhaleIdentityClustering symbol={symbol} />
          </div>
        </div>
      </div>
    </div>
  );
};
