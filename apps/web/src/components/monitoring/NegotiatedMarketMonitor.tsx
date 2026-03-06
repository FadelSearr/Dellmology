// NegotiatedMarketMonitor.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/common/Card';
import { Loader } from 'lucide-react';

interface NegotiatedTrade {
  time?: string;
  symbol: string;
  price: number;
  volume: number;
  buyer: string;
  seller: string;
  // optional fields provided by API
  timestamp?: string;
  tradeType?: string;
}

export const NegotiatedMarketMonitor: React.FC = () => {
  const [trades, setTrades] = useState<NegotiatedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNegotiatedTrades = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('http://localhost:8080/negotiated/latest');
        if (!response.ok) throw new Error('Failed to fetch negotiated trades');
        const data = await response.json();
        const items = Array.isArray(data?.items) ? data.items : []
        setTrades(
          items.map((t: unknown) => {
            const r = t && typeof t === 'object' ? (t as Record<string, unknown>) : {};
            return {
              symbol: String(r.symbol ?? ''),
              price: Number(r.price ?? 0),
              volume: Number(r.volume ?? 0),
              tradeType: String(r.tradeType ?? ''),
              timestamp: String(r.timestamp ?? ''),
              buyer: String(r.buyer ?? '-'),
              seller: String(r.seller ?? '-'),
            } as NegotiatedTrade;
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchNegotiatedTrades();
    const interval = setInterval(fetchNegotiatedTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card title="📝 Negotiated Market Monitor" subtitle="Transaksi pasar nego terbaru">
      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader className="animate-spin mr-2" /> Memuat data nego...
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          Error: {error}
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center text-gray-400 py-6">Tidak ada transaksi nego terbaru</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-400">
                <th className="px-2 py-1">Waktu</th>
                <th className="px-2 py-1">Emiten</th>
                <th className="px-2 py-1">Harga</th>
                <th className="px-2 py-1">Volume</th>
                <th className="px-2 py-1">Tipe</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, idx) => (
                <tr key={idx} className="border-b border-gray-700 hover:bg-gray-800/50">
                  <td className="px-2 py-1">{trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString('id-ID') : '-'}</td>
                  <td className="px-2 py-1 font-bold text-cyan-400">{trade.symbol}</td>
                  <td className="px-2 py-1 text-green-400">{trade.price?.toLocaleString('id-ID')}</td>
                  <td className="px-2 py-1">{trade.volume?.toLocaleString('id-ID')}</td>
                  <td className="px-2 py-1">{trade.tradeType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
