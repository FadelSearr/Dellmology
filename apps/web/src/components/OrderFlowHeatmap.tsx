'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface HeatmapData {
  prices: number[];
  bidVolumes: number[];
  askVolumes: number[];
  netVolumes: number[];
  bidAskRatios: number[];
  intensities: number[];
}

interface MarketDepth {
  symbol: string;
  timestamp: string;
  bidLevels: Array<{ price: number; volume: number }>;
  askLevels: Array<{ price: number; volume: number }>;
  totalBidVolume: number;
  totalAskVolume: number;
  midPrice: number;
  bidAskSpread: number;
  spreadBps: number;
}

interface Anomaly {
  timestamp: string;
  type: string;
  price: number;
  volume: number;
  severity: string;
  description: string;
}

const getHeatmapColor = (intensity: number, bidAskRatio: number): string => {
  // Green for bid-heavy (bullish), red for ask-heavy (bearish)
  const hue = bidAskRatio > 1.5 ? 120 : bidAskRatio < 0.67 ? 0 : 60;
  const saturation = Math.min(100, intensity * 100);
  const lightness = Math.max(20, 70 - intensity * 50);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'HIGH':
      return 'bg-red-500/20 border-red-500';
    case 'MEDIUM':
      return 'bg-yellow-500/20 border-yellow-500';
    case 'LOW':
      return 'bg-blue-500/20 border-blue-500';
    default:
      return 'bg-gray-500/20 border-gray-500';
  }
};

export const OrderFlowHeatmap = ({ symbol = 'BBCA' }: { symbol: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [marketDepth, setMarketDepth] = useState<MarketDepth | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [aggregate, setAggregate] = useState(false);

  useEffect(() => {
    const fetchOrderFlowData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/order-flow-heatmap?symbol=${symbol}&limit=100&aggregate=${aggregate}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch order flow data');
        }

        const data = await response.json();
        setHeatmapData(data.heatmap);
        setMarketDepth(data.marketDepth);
        setAnomalies(data.anomalies);
        setError(null);
      } catch (err) {
        console.error('Error fetching order flow data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderFlowData();

    // Poll every 30 seconds
    const interval = setInterval(fetchOrderFlowData, 30000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Draw heatmap on canvas
  useEffect(() => {
    if (!canvasRef.current || !heatmapData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 60;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Find min/max prices
    const minPrice = Math.min(...heatmapData.prices);
    const maxPrice = Math.max(...heatmapData.prices);
    const priceRange = maxPrice - minPrice || 1;

    const maxVolume = Math.max(
      ...heatmapData.bidVolumes,
      ...heatmapData.askVolumes
    );

    // Draw bid side (left, green)
    for (let i = 0; i < heatmapData.prices.length; i++) {
      const price = heatmapData.prices[i];
      const bidVol = heatmapData.bidVolumes[i];
      const askVol = heatmapData.askVolumes[i];
      const intensity = heatmapData.intensities[i];
      const bidAskRatio = heatmapData.bidAskRatios[i];

      const y = padding + ((maxPrice - price) / priceRange) * plotHeight;

      // Draw bid bar (left side)
      const bidBarWidth = (bidVol / maxVolume) * (plotWidth / 2);
      ctx.fillStyle = getHeatmapColor(intensity, bidAskRatio);
      ctx.fillRect(padding - bidBarWidth, y - 2, bidBarWidth, 4);

      // Draw ask bar (right side)
      const askBarWidth = (askVol / maxVolume) * (plotWidth / 2);
      ctx.fillStyle = getHeatmapColor(intensity, 1 / Math.max(bidAskRatio, 0.01));
      ctx.fillRect(padding, y - 2, askBarWidth, 4);
    }

    // Draw price axis
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw price labels
    ctx.fillStyle = '#999';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (priceRange * i) / 5;
      const y = padding + ((maxPrice - price) / priceRange) * plotHeight;
      ctx.fillText(price.toFixed(0), padding - 10, y + 4);
    }

    // Draw volume labels
    ctx.textAlign = 'center';
    for (let i = 0; i <= 3; i++) {
      const vol = (maxVolume * i) / 3;
      const x = padding + (plotWidth * i) / 6;
      ctx.fillText(vol.toFixed(0), x, height - padding + 20);
    }

    // Draw legend
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Order Flow Heatmap', padding + 10, 30);

    ctx.font = '12px monospace';
    ctx.fillText('← BID (Buy Pressure)', padding + 10, 50);
    ctx.fillText('ASK (Sell Pressure) →', padding + plotWidth / 2, 50);
  }, [heatmapData]);

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-800/50 border border-gray-700 rounded-lg flex items-center justify-center">
        <p className="text-gray-400">Loading order flow data...</p>
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

  return (
    <div className="w-full space-y-6 bg-gray-800/50 border border-gray-700 rounded-lg p-6">
      {/* Heatmap Canvas */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">Market Depth Heatmap</h3>
        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="w-full border border-gray-700 rounded bg-gray-900"
        />
        <p className="text-xs text-gray-400">
          Closer to zero = balanced, Left (Green) = Bullish Bid Pressure, Right (Red) = Bearish Ask Pressure
        </p>
      </div>

      {/* Market Depth Stats */}
      {marketDepth && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
            <p className="text-xs text-gray-500 mb-1">MID PRICE</p>
            <p className="text-xl font-bold text-white">
              {marketDepth.midPrice.toFixed(0)}
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
            <p className="text-xs text-gray-500 mb-1">BID/ASK SPREAD</p>
            <p className="text-xl font-bold text-white">
              {marketDepth.spreadBps} bps
            </p>
          </div>
          <div className="bg-green-900/20 border border-green-700 rounded p-4">
            <p className="text-xs text-green-400 mb-1">TOTAL BID VOLUME</p>
            <p className="text-xl font-bold text-green-400">
              {(marketDepth.totalBidVolume / 1000).toFixed(1)}K
            </p>
          </div>
          <div className="bg-red-900/20 border border-red-700 rounded p-4">
            <p className="text-xs text-red-400 mb-1">TOTAL ASK VOLUME</p>
            <p className="text-xl font-bold text-red-400">
              {(marketDepth.totalAskVolume / 1000).toFixed(1)}K
            </p>
          </div>
        </div>
      )}

      {/* Order Book Levels */}
      {marketDepth && (
        <div className="grid grid-cols-2 gap-4">
          {/* Bids (left) */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-green-400">Bid Levels</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {marketDepth.bidLevels.map((level, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-sm p-2 bg-gray-900/50 rounded hover:bg-green-900/30 cursor-pointer transition"
                  onClick={() => setSelectedPrice(level.price)}
                >
                  <span className="text-green-400">{level.price.toFixed(0)}</span>
                  <span className="text-gray-400">{(level.volume / 1000).toFixed(1)}K</span>
                </div>
              ))}
            </div>
          </div>

          {/* Asks (right) */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-red-400">Ask Levels</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {marketDepth.askLevels.map((level, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-sm p-2 bg-gray-900/50 rounded hover:bg-red-900/30 cursor-pointer transition"
                  onClick={() => setSelectedPrice(level.price)}
                >
                  <span className="text-red-400">{level.price.toFixed(0)}</span>
                  <span className="text-gray-400">{(level.volume / 1000).toFixed(1)}K</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <h4 className="text-sm font-semibold text-yellow-400">
              Order Flow Anomalies
            </h4>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {anomalies.map((anom, idx) => (
              <div
                key={idx}
                className={`border-l-4 p-3 rounded text-xs space-y-1 ${getSeverityColor(
                  anom.severity
                )}`}
              >
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">{anom.type}</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold ${
                      anom.severity === 'HIGH'
                        ? 'bg-red-500/50 text-red-200'
                        : anom.severity === 'MEDIUM'
                        ? 'bg-yellow-500/50 text-yellow-200'
                        : 'bg-blue-500/50 text-blue-200'
                    }`}
                  >
                    {anom.severity}
                  </span>
                </div>
                <p className="text-gray-300">{anom.description}</p>
                <div className="flex justify-between text-gray-400">
                  <span>Price: {anom.price.toFixed(0)}</span>
                  <span>Vol: {(anom.volume / 1000).toFixed(1)}K</span>
                  <span>{new Date(anom.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
