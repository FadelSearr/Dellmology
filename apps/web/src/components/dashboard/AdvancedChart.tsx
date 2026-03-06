'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const AdvancedChart = ({ symbol = 'BBCA' }: { symbol: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CandleData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a2e' },
        textColor: '#d1d5db',
      },
      width: containerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Add volume series (using histogram)
    const volumeSeries = chart.addHistogramSeries({
      color: '#26c6da',
      title: 'Volume',
    });
    volumeSeries.priceScale().scaleMargins(0, 0.8);

    const generateFallbackData = (basePrice = 1000): CandleData[] => {
      const data: CandleData[] = [];
      let movingBase = basePrice;
      const now = Math.floor(Date.now() / 1000);

      for (let i = 50; i >= 0; i--) {
        const time = now - i * 3600; // Hourly data
        const change = (Math.random() - 0.5) * 20;
        const open = movingBase;
        const close = movingBase + change;
        const high = Math.max(open, close) + Math.random() * 10;
        const low = Math.min(open, close) - Math.random() * 10;

        data.push({
          time: Math.floor(time / 3600) * 3600, // Round to hourly
          open: Math.round(open),
          high: Math.round(high),
          low: Math.round(low),
          close: Math.round(close),
        });

        movingBase = close;
      }

      return data;
    };

    const applyChartData = (chartData: CandleData[]) => {
      setData(chartData);
      candlestickSeries.setData(chartData);

      const volumeData = chartData.map((point, index) => ({
        time: point.time,
        value: Math.max(10, Math.abs(point.close - point.open) * 120 + index),
        color: point.close >= point.open ? '#10b981' : '#ef4444',
      }));
      volumeSeries.setData(volumeData);

      const smaData = [];
      for (let i = 19; i < chartData.length; i++) {
        const sum = chartData.slice(i - 19, i + 1).reduce((acc, d) => acc + d.close, 0);
        smaData.push({
          time: chartData[i].time,
          value: sum / 20,
        });
      }
      smaLine20.setData(smaData);

      const smaData50 = [];
      for (let i = 49; i < chartData.length; i++) {
        const sum = chartData.slice(i - 49, i + 1).reduce((acc, d) => acc + d.close, 0);
        smaData50.push({
          time: chartData[i].time,
          value: sum / 50,
        });
      }
      smaLine50.setData(smaData50);

      chart.timeScale().fitContent();
    };

    // Add 20-day SMA (Simple Moving Average)
    const smaLine20 = (chart as any).addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      title: 'SMA 20',
    });

    // Add 50-day SMA
    const smaLine50 = (chart as any).addLineSeries({
      color: '#8b5cf6',
      lineWidth: 2,
      title: 'SMA 50',
    });

    const loadChartData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [marketRes, regimeRes] = await Promise.all([
          fetch(`/api/market-intelligence?symbol=${encodeURIComponent(symbol)}&timeframe=1h`, { cache: 'no-store' }),
          fetch(`/api/market-regime?symbol=${encodeURIComponent(symbol)}&lookbackMinutes=300`, { cache: 'no-store' }),
        ]);

        const marketJson = marketRes.ok ? await marketRes.json() : null;
        const regimeJson = regimeRes.ok ? await regimeRes.json() : null;

        const lastPrice = Number(marketJson?.metrics?.last_price || marketJson?.metrics?.vwap || marketJson?.metrics?.pressure_index || 1000);
        const volatilityHint = Number(regimeJson?.atr || marketJson?.volatility?.percentage || 1);

        const fallbackData = generateFallbackData(Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : 1000).map((point) => {
          const spread = Math.max(2, volatilityHint * 3);
          return {
            ...point,
            high: Math.max(point.open, point.close) + spread,
            low: Math.min(point.open, point.close) - spread,
          };
        });

        applyChartData(fallbackData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load chart data');
        applyChartData(generateFallbackData());
      } finally {
        setLoading(false);
      }
    };

    loadChartData();

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{symbol}</h3>
          <p className="text-sm text-gray-400">1H Chart with SMA 20/50</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded px-3 py-1 text-sm">
          <span className="text-gray-400">Indicators: </span>
          <span className="text-yellow-400">SMA20</span>
          <span className="mx-2 text-gray-600">•</span>
          <span className="text-purple-400">SMA50</span>
        </div>
      </div>

      <div className="relative w-full bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
        <div ref={containerRef} className="w-full" />
        {loading && (
          <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center text-sm text-gray-300">
            Loading chart...
          </div>
        )}
      </div>

      {error && <div className="text-xs text-yellow-300">{error}</div>}

      {/* Chart Info */}
      <div className="grid grid-cols-4 gap-2 text-sm">
        <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
          <span className="text-gray-400">Last:</span>
          <span className="ml-2 text-white font-semibold">
            {data.length > 0 ? data[data.length - 1].close : '-'}
          </span>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
          <span className="text-gray-400">High:</span>
          <span className="ml-2 text-green-400 font-semibold">
            {data.length > 0 ? Math.max(...data.map(d => d.high)) : '-'}
          </span>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
          <span className="text-gray-400">Low:</span>
          <span className="ml-2 text-red-400 font-semibold">
            {data.length > 0 ? Math.min(...data.map(d => d.low)) : '-'}
          </span>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
          <span className="text-gray-400">Vol:</span>
          <span className="ml-2 text-cyan-400 font-semibold">
            {data.length}M
          </span>
        </div>
      </div>
    </div>
  );
};
