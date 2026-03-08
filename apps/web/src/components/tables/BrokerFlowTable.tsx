'use client';

import React from 'react';

interface BrokerEntry {
  broker_id: string;
  net_buy_value: number;
  active_days?: number;
  consistency_score?: number;
  avg_buy_price?: number;
  z_score?: number;
  is_whale?: boolean;
  is_retail?: boolean;
  daily_heatmap?: number[]; // array of net values ordered by day
}

interface BrokerFlowTableProps {
  data: BrokerEntry[];
  symbol: string;
  filterType?: 'ALL' | 'SMART_MONEY' | 'WHALE' | 'RETAIL';
}

/**
 * Broker Flow table showing daily heatmap and accumulation data
 */
// Helper: determine broker character profile
function getBrokerCharacterProfile(broker: BrokerEntry): string {
  if (broker.is_whale) {
    if ((broker.consistency_score || 0) > 0.8 && (broker.active_days || 0) > 5) return 'Aggressive Accumulator';
    if ((broker.consistency_score || 0) < 0.5) return 'Opportunistic Whale';
    return 'Strategic Whale';
  }
  if (broker.is_retail) {
    if ((broker.consistency_score || 0) > 0.7) return 'Disciplined Retail';
    return 'Speculative Retail';
  }
  if ((broker.consistency_score || 0) > 0.85) return 'Algorithmic Trader';
  if ((broker.net_buy_value || 0) > 0 && (broker.active_days || 0) > 6) return 'Long-Term Accumulator';
  if ((broker.net_buy_value || 0) < 0 && (broker.active_days || 0) < 3) return 'Short-Term Seller';
  return 'Mixed Strategy';
}

export const BrokerFlowTable: React.FC<BrokerFlowTableProps> = ({
  data,
  filterType = 'ALL',
}) => {
  // convert broker.daily_heatmap (numbers) into items with sentiment
  const buildPattern = (heatmap?: number[]) => {
    if (!heatmap || heatmap.length === 0) {
      return [];
    }
    return heatmap.map((net, idx) => ({
      day: `D-${heatmap.length - idx - 1}`,
      net,
      sentiment: net >= 0 ? 'up' : 'down',
    }));
  };


  const filteredData =
    filterType === 'WHALE' ? data.filter((b) => b.is_whale) : filterType === 'RETAIL' ? data.filter((b) => b.is_retail) : data;

  return (
    <div className="space-y-4">
      {/* Daily Heatmap (show first broker or static) */}
      <div className="bg-gray-900/30 p-3 rounded-lg border border-gray-700/30 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase">7-Day Accumulation Pattern</p>
        <div className="flex gap-1.5">
          {(() => {
            const sample = filteredData[0]?.daily_heatmap;
            const pattern = sample ? buildPattern(sample) : [
              { day: 'D-6', net: 0, sentiment: 'up' },
              { day: 'D-5', net: 0, sentiment: 'up' },
              { day: 'D-4', net: 0, sentiment: 'up' },
              { day: 'D-3', net: 0, sentiment: 'up' },
              { day: 'D-2', net: 0, sentiment: 'up' },
              { day: 'D-1', net: 0, sentiment: 'up' },
              { day: 'D0', net: 0, sentiment: 'up' },
            ];
            return pattern.map((day) => (
              <div key={day.day} className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    day.sentiment === 'up'
                      ? 'bg-green-900/40 border border-green-700 text-green-300'
                      : 'bg-red-900/40 border border-red-700 text-red-300'
                  }`}
                >
                  {day.sentiment === 'up' ? '+' : '-'}
                </div>
                <span className="text-xs text-gray-500">{day.day}</span>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400">BROKER</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400">NET VALUE</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-400">ACTIVE DAYS</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-400">CONSISTENCY</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400">AVG PRICE</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-400">Z-SCORE</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-400">TYPE</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.slice(0, 5).map((broker, idx) => {
              const netValue = broker.net_buy_value || 0;
              const isPositive = netValue >= 0;
              const character = getBrokerCharacterProfile(broker);

              return (
                <tr key={broker.broker_id || idx} className="border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-gray-300 font-semibold">{broker.broker_id}</span>
                      </div>
                      <span className="text-xs text-gray-400 italic">{character}</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2 font-mono">
                    <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
                      {isPositive ? '+' : ''}{(netValue / 1000).toFixed(0)}K
                    </span>
                  </td>
                  <td className="text-center px-3 py-2 text-gray-300">{broker.active_days || 5}/7</td>
                  <td className="text-center px-3 py-2">
                    <div className="inline-flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-blue-500 to-cyan-400"
                          style={{ width: `${(broker.consistency_score || 0.7) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{((broker.consistency_score || 0.7) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-cyan-400">
                    Rp {(broker.avg_buy_price || 15000).toLocaleString()}
                  </td>
                  <td className="text-center px-3 py-2">
                    <span className={`font-mono font-semibold ${broker.z_score && broker.z_score > 2 ? 'text-red-400' : 'text-gray-400'}`}>
                      {(broker.z_score || 0.5).toFixed(2)}σ
                    </span>
                  </td>
                  <td className="text-center px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        broker.is_whale
                          ? 'bg-orange-900/40 text-orange-300'
                          : broker.is_retail
                            ? 'bg-blue-900/40 text-blue-300'
                            : 'bg-purple-900/40 text-purple-300'
                      }`}
                    >
                      {broker.is_whale ? '🐋 Whale' : broker.is_retail ? '👥 Retail' : '💰 Smart'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-700">
        <div className="text-center">
          <div className="text-xs text-gray-400">Total Buyers</div>
          <div className="text-lg font-bold text-green-400">{filteredData.filter((b) => (b.net_buy_value || 0) > 0).length}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Total Sellers</div>
          <div className="text-lg font-bold text-red-400">{filteredData.filter((b) => (b.net_buy_value || 0) < 0).length}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Net Volume</div>
          <div className="text-lg font-bold text-cyan-400">
            {(filteredData.reduce((sum, b) => sum + (b.net_buy_value || 0), 0) / 1000).toFixed(0)}K
          </div>
        </div>
      </div>
    </div>
  );
};
