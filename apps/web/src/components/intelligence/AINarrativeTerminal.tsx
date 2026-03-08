 'use client'

import React, { useState } from 'react';
import { AINarrativeDisplay } from './AINarrativeDisplay';
import { useSSE } from '@/hooks/useSSE';

export const AINarrativeTerminal: React.FC = () => {
  const [symbol, setSymbol] = useState('BBCA');
  const [type, setType] = useState<'broker' | 'regime' | 'swot' | 'screener'>('broker');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [sending, setSending] = useState(false);
  const { lastEvent } = useSSE<{ narrative?: string }>(`/api/narrative/stream?symbol=${symbol}`);

  const handleSendTelegram = async () => {
    setSending(true);
    try {
      await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, text: lastEvent?.narrative || 'No narrative available' }),
      });
    } catch (err) {
      console.warn('Telegram send failed', err);
    } finally {
      setSending(false);
    }
  };

  const handleSnapshot = async () => {
    try {
      const res = await fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, snapshotAt: new Date().toISOString(), data: lastEvent || null }),
      });
      if (res.ok) {
        alert('Snapshot saved')
      } else {
        const j = await res.json().catch(() => ({}))
        alert('Snapshot failed: ' + (j.error || res.status))
      }
    } catch (err) {
      console.warn('snapshot failed', err)
      alert('Snapshot failed')
    }
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 z-40">
      <div className="max-w-screen-2xl mx-auto p-4">
        <div className="bg-gray-900/70 backdrop-blur border border-gray-800 rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="bg-gray-800 border border-gray-700 text-white text-sm px-2 py-1 rounded w-28"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mr-2">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'broker' | 'regime' | 'swot' | 'screener')} className="bg-gray-800 border border-gray-700 text-white text-sm px-2 py-1 rounded">
                <option value="broker">Broker</option>
                <option value="swot">SWOT</option>
                <option value="regime">Regime</option>
                <option value="screener">Screener</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-gray-400">Auto</label>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleSendTelegram} disabled={sending} className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm px-3 py-1 rounded">{sending ? 'Sending...' : 'Send → Telegram'}</button>
              <button onClick={handleSnapshot} className="bg-amber-700 hover:bg-amber-600 text-white text-sm px-3 py-1 rounded">Snapshot</button>
            </div>
          </div>

          <div>
            <AINarrativeDisplay symbol={symbol} type={type} autoRefresh={autoRefresh} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AINarrativeTerminal;
