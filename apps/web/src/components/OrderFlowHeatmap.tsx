'use client';

import React, { useEffect, useState } from 'react';

interface HeatmapBin {
  price: number;
  timestamp: string;
  bid: number;
  ask: number;
  ratio: number;
  intensity: number;
}

interface MarketDepth {
  time: string;
  symbol: string;
  bid_levels: Record<string, number>;
  ask_levels: Record<string, number>;
  total_bid_volume: number;
  total_ask_volume: number;
  mid_price: number;
  bid_ask_spread: number;
  spread_bps: number;
}

interface Anomaly {
  time: string;
  symbol: string;
  anomaly_type: string;
  price: number;
  volume: number;
  severity: string;
  description: string;
}

interface OrderFlowHeatmapProps {
  symbol: string;
  minutes?: number;
  showAnomalies?: boolean;
  height?: number;
}

export function OrderFlowHeatmap({
  symbol,
  minutes = 60,
  showAnomalies = true,
  height = 500,
}: OrderFlowHeatmapProps) {
  const [data, setData] = useState<HeatmapBin[]>([]);
  const [marketDepth, setMarketDepth] = useState<MarketDepth | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/order-flow-heatmap?symbol=${symbol}&minutes=${minutes}&anomalies=${showAnomalies}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch heatmap data');
        }

        const result = await response.json();
        setData(result.heatmap || []);
        setMarketDepth(result.marketDepth);
        setAnomalies(result.anomalies || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [symbol, minutes, showAnomalies]);

  if (loading) {
    return (
      <div className="border border-gray-700 rounded-lg p-4">
        <div className="font-bold text-lg mb-4">{symbol} Order Flow Heatmap</div>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-700 rounded-lg p-4">
        <div className="text-red-400 font-bold">Error loading heatmap</div>
        <div className="text-sm text-gray-400 mt-2">{error}</div>
      </div>
    );
  }

  // price bounds computed but not currently used in UI

  const HeatmapCell = ({ bin }: { bin: HeatmapBin }) => {
    const intensity = bin.intensity || 0;
    const hue = bin.bid > bin.ask ? 120 : 0; // Green for bid heavy, red for ask heavy
    const saturation = intensity * 100;
    const lightness = 50 - intensity * 30;

    return (
      <div
        className="relative group cursor-pointer transition-all hover:opacity-100"
        style={{
          backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
          opacity: 0.7 + intensity * 0.3,
          height: '100%',
        }}
        title={`Price: ${bin.price.toFixed(2)} | Bid: ${bin.bid} | Ask: ${bin.ask} | Ratio: ${bin.ratio.toFixed(2)}`}
      >
        {intensity > 0.6 && (
          <span className="text-xs text-white font-semibold absolute inset-0 flex items-center justify-center">
            {Math.round(intensity * 100)}
          </span>
        )}
        <div className="absolute -top-8 left-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
          {bin.price.toFixed(2)}: {bin.bid}/{bin.ask}
        </div>
      </div>
    );
  };

  return (
    <div className="border border-gray-700 rounded-lg p-4 space-y-4">
      <div>
        <div className="font-bold text-lg">{symbol} Order Flow Heatmap</div>
        <div className="text-sm text-gray-400">
          Real-time order flow visualization (Last {minutes} minutes)
        </div>
      </div>
      <div>
        <div className="space-y-6">
          {/* Main Heatmap */}
          <div className="border rounded-lg overflow-hidden bg-gray-50">
            <div
              className="grid gap-0 p-4"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))',
                height: `${height}px`,
              }}
            >
              {data.map((bin, idx) => (
                <HeatmapCell key={`${bin.price}-${idx}`} bin={bin} />
              ))}
            </div>
          </div>

          {/* Market Depth Stats */}
          {marketDepth && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-600">Mid Price</div>
                <div className="text-lg font-bold text-black">
                  {marketDepth.mid_price.toFixed(2)}
                </div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-600">Spread (bps)</div>
                <div className="text-lg font-bold text-red-600">{marketDepth.spread_bps}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-600">Total Bid Vol</div>
                <div className="text-lg font-bold text-blue-600">
                  {(marketDepth.total_bid_volume / 1e6).toFixed(1)}M
                </div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-600">Total Ask Vol</div>
                <div className="text-lg font-bold text-green-600">
                  {(marketDepth.total_ask_volume / 1e6).toFixed(1)}M
                </div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-600">Bid/Ask Ratio</div>
                <div className="text-lg font-bold text-orange-600">
                  {(marketDepth.total_bid_volume / Math.max(marketDepth.total_ask_volume, 1)).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Anomalies */}
          {showAnomalies && anomalies.length > 0 && (
            <div className="border rounded-lg p-4 bg-orange-50">
              <h3 className="font-semibold mb-2 text-orange-900">⚠️ Detected Anomalies</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {anomalies.slice(0, 10).map((anomaly, idx) => (
                  <div
                    key={idx}
                    className={`text-xs p-2 rounded ${
                      anomaly.severity === 'HIGH'
                        ? 'bg-red-100 border-l-4 border-red-500'
                        : anomaly.severity === 'MEDIUM'
                        ? 'bg-yellow-100 border-l-4 border-yellow-500'
                        : 'bg-blue-100 border-l-4 border-blue-500'
                    }`}
                  >
                    <span className="font-semibold">{anomaly.anomaly_type}</span>
                    <span className="ml-2 text-gray-700">{anomaly.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs border-t pt-4">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: 'hsl(120, 100%, 20%)' }}
              />
              <span>High Bid Pressure</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: 'hsl(0, 100%, 50%)' }}
              />
              <span>High Ask Pressure</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: 'hsl(0, 0%, 80%)' }}
              />
              <span>Low Activity</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderFlowHeatmap;
