'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView?: {
      widget?: new (opts: Record<string, unknown>) => unknown;
    };
  }
}

interface TradingViewWidgetProps {
  symbol: string;
  width?: string | number;
  height?: string | number;
  interval?: string;
}

const TradingViewWidget = ({ symbol, width = '100%', height = 400, interval = '60' }: TradingViewWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      try {
        const TV = window.TradingView as unknown as { widget?: new (opts: Record<string, unknown>) => unknown } | undefined;
        if (TV && TV.widget && containerRef.current) {
          new TV.widget({
            width,
            height,
            // TradingView uses EXCHANGE:SYMBOL format
            symbol: `IDX:${symbol}`,
            interval,
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            hide_side_toolbar: false,
            allow_symbol_change: true,
            container_id: containerRef.current.id,
          });
        }
      } catch {
        // fail silently — widget is optional
      }
    };

    containerRef.current.appendChild(script);

    return () => {
      try {
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch {
        // ignore
      }
    };
  }, [symbol, width, height, interval]);

  return <div id={`tradingview_${symbol}`} ref={containerRef} />;
};

export default TradingViewWidget;
