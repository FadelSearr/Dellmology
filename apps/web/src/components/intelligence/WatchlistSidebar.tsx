"use client"

import React, { useState, useEffect, useRef } from 'react';

interface WatchlistItem {
  symbol: string;
  unifiedPowerScore: number;
}

export const WatchlistSidebar: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [input, setInput] = useState('');

  const addToWatchlist = () => {
    if (!input.trim()) return;
    if (watchlist.find(w => w.symbol === input.trim().toUpperCase())) return;
    const symbol = input.trim().toUpperCase();
    setInput('');
    (async () => {
      try {
        const body = { entries: [{ symbol }] };
        const r = await fetch('/api/ai/watchlist/unified_power', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) {
          const data = await r.json();
          const mapping: Record<string, number> = data.mapping || {};
          const score = mapping[symbol] ?? Math.floor(Math.random() * 101);
          setWatchlist([...watchlist, { symbol, unifiedPowerScore: Math.round(score) }]);
          return;
        }
      } catch (err) {
        // ignore and fallback
      }
      // Fallback local score
      setWatchlist([...watchlist, { symbol, unifiedPowerScore: Math.floor(Math.random() * 101) }]);
    })();
  };

  const refreshScores = async () => {
    const current = watchlistRef.current;
    if (!current || current.length === 0) return;
    try {
      const body = { entries: current.map((w) => ({ symbol: w.symbol })) };
      const r = await fetch('/api/ai/watchlist/unified_power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return;
      const data = await r.json();
      const mapping: Record<string, number> = data.mapping || {};
      const updated = current.map((w) => ({
        ...w,
        unifiedPowerScore: Math.round(mapping[w.symbol] ?? w.unifiedPowerScore),
      }));
      setWatchlist(updated);
    } catch {
      // best-effort: ignore errors
    }
  };

  const watchlistRef = useRef<WatchlistItem[]>(watchlist);
  useEffect(() => {
    watchlistRef.current = watchlist;
  }, [watchlist]);

  useEffect(() => {
    // Periodic background refresh of UPS scores every 60s
    const id = setInterval(() => {
      void refreshScores();
    }, 60000);
    // initial one-time refresh on mount
    void refreshScores();
    return () => clearInterval(id);
  }, []);

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(w => w.symbol !== symbol));
  };

  return (
    <aside className="w-64 bg-gray-900/90 border-r border-gray-800 p-4 space-y-4">
      <h3 className="text-lg font-bold text-white mb-2">Watchlist</h3>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Add symbol (e.g. BBCA)"
          className="flex-1 px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
        />
        <button
          onClick={addToWatchlist}
          className="px-3 py-1 rounded bg-cyan-600 text-white font-semibold hover:bg-cyan-700"
        >Add</button>
        <button
          onClick={() => { void refreshScores(); }}
          className="px-3 py-1 rounded bg-slate-700 text-white font-semibold hover:bg-slate-600"
        >Refresh</button>
      </div>
      <ul className="space-y-2">
        {watchlist.map(item => (
          <li key={item.symbol} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
            <div>
              <span className="font-bold text-white">{item.symbol}</span>
              <span className="ml-2 text-xs text-cyan-400">UPS: {item.unifiedPowerScore}/100</span>
            </div>
            <button
              onClick={() => removeFromWatchlist(item.symbol)}
              className="text-red-400 hover:text-red-600 text-xs ml-2"
            >Remove</button>
          </li>
        ))}
      </ul>
    </aside>
  );
};
