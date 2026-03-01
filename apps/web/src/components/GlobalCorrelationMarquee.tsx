'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface GlobalMarketData {
  commodities: {
    [key: string]: {
      price: number;
      change: number;
      currency: string;
    };
  };
  indices: {
    [key: string]: {
      price: number;
      change: number;
      currency: string;
    };
  };
  forex: {
    [key: string]: {
      price: number;
      change: number;
      currency: string;
    };
  };
  correlation_strength: number;
  global_sentiment: string;
  timestamp: string;
}

interface MarketDataItem {
  label: string;
  price: number;
  change: number;
  currency: string;
}

export const GlobalCorrelationMarquee = () => {
  const [data, setData] = useState<GlobalMarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MarketDataItem[]>([]);

  useEffect(() => {
    const fetchGlobalData = async () => {
      try {
        const response = await fetch('/api/global-correlation');
        if (response.ok) {
          const data = await response.json();
          setData(data);

          // Convert to marquee items
          const marqueeItems: MarketDataItem[] = [];

          // Add indices
          if (data.indices) {
            marqueeItems.push(
              {
                label: 'IHSG',
                price: data.indices.ihsg?.price || 0,
                change: data.indices.ihsg?.change || 0,
                currency: 'points',
              },
              {
                label: 'DJI',
                price: data.indices.dji?.price || 0,
                change: data.indices.dji?.change || 0,
                currency: 'points',
              },
              {
                label: 'S&P500',
                price: data.indices.sp500?.price || 0,
                change: data.indices.sp500?.change || 0,
                currency: 'points',
              }
            );
          }

          // Add commodities
          if (data.commodities) {
            marqueeItems.push(
              {
                label: 'GOLD',
                price: data.commodities.gold?.price || 0,
                change: data.commodities.gold?.change || 0,
                currency: 'USD/oz',
              },
              {
                label: 'COAL',
                price: data.commodities.coal?.price || 0,
                change: data.commodities.coal?.change || 0,
                currency: 'USD/ton',
              },
              {
                label: 'NICKEL',
                price: data.commodities.nickel?.price || 0,
                change: data.commodities.nickel?.change || 0,
                currency: 'USD/lb',
              }
            );
          }

          setItems(marqueeItems);
        }
      } catch (error) {
        console.error('Error fetching global correlation:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalData();

    // Refresh every 5 minutes
    const interval = setInterval(fetchGlobalData, 300000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="relative flex overflow-hidden h-6 bg-gray-800/30 rounded px-2 items-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading market data...</div>
      </div>
    );
  }

  return (
    <div className="relative flex overflow-hidden h-6 bg-linear-to-r from-gray-900/50 to-gray-800/50 rounded px-2 items-center border border-gray-700/30">
      <style>{`
        @keyframes scroll-left {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .marquee-item {
          animation: scroll-left 30s linear infinite;
          display: inline-flex;
          white-space: nowrap;
          padding: 0 20px;
        }
        .marquee-item:hover {
          animation-play-state: paused;
        }
      `}</style>

      <div className="flex">
        {items.map((item, idx) => (
          <div key={`${item.label}-${idx}`} className="marquee-item flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-400">{item.label}:</span>
            <span className="text-xs text-white">{item.price.toFixed(2)}</span>
            <span className={`text-xs flex items-center gap-1 ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {item.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}%
            </span>
            {idx < items.length - 1 && <span className="text-gray-600">•</span>}
          </div>
        ))}

        {/* Duplicate for continuous scroll */}
        {items.map((item, idx) => (
          <div key={`${item.label}-dup-${idx}`} className="marquee-item flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-400">{item.label}:</span>
            <span className="text-xs text-white">{item.price.toFixed(2)}</span>
            <span className={`text-xs flex items-center gap-1 ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {item.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}%
            </span>
            {idx < items.length - 1 && <span className="text-gray-600">•</span>}
          </div>
        ))}
      </div>

      {/* Gradient overlays for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-gray-900/50 to-transparent pointer-events-none"></div>
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-gray-900/50 to-transparent pointer-events-none"></div>

      {/* Sentiment badge */}
      {data && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-800/80 px-2 py-1 rounded whitespace-nowrap border border-gray-700">
          <span className={data.global_sentiment === 'BULLISH' ? 'text-green-400' : 'text-red-400'}>
            {data.global_sentiment}
          </span>
        </div>
      )}
    </div>
  );
};
