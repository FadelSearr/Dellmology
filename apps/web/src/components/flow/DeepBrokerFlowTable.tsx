"use client";

import React, { useEffect, useState } from 'react';

type BrokerRow = {
  broker: string;
  identity: 'Whale' | 'Retail' | 'Unknown';
  netValue: number; // net buy - sell
  consistency: number; // 0-100
  heatmap: number[]; // small array for spark-bars
};

export const DeepBrokerFlowTable: React.FC<{ symbol?: string }> = ({ symbol = 'BBCA' }) => {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/broker-flow?symbol=${encodeURIComponent(symbol)}`);
        if (!mounted) return;
        if (!resp.ok) {
          // fallback to mock data
          setRows(mockRows());
        } else {
          const json = await resp.json();
          // defensive parsing
          const parsed = Array.isArray(json) ? json.map((r: { [key: string]: unknown }) => ({
            broker: String(r.broker || r.name || 'UNK'),
            identity: (r.identity === 'Whale' || r.identity === 'Retail') ? (r.identity as 'Whale' | 'Retail') : 'Unknown',
            netValue: Number((r.netValue ?? r.net) || 0),
            consistency: Number((r.consistency ?? r.cons) || 0),
            heatmap: Array.isArray(r.heatmap) ? (r.heatmap as unknown[]).map((n) => Number(n ?? 0)) : [0,0,0,0,0]
          })) : mockRows();
          setRows(parsed as BrokerRow[]);
        }
      } catch {
        setRows(mockRows());
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    const intv = setInterval(fetchData, 30_000);
    return () => { mounted = false; clearInterval(intv); };
  }, [symbol]);

  return (
    <section className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Deep Broker Flow — {symbol}</h3>
        <div className="text-sm text-gray-300">{loading ? 'Loading…' : `${rows.length} brokers`}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="text-left text-gray-300 text-xs uppercase">
              <th className="pb-2">Broker</th>
              <th className="pb-2">Identity</th>
              <th className="pb-2">Net Value</th>
              <th className="pb-2">Consistency</th>
              <th className="pb-2">Daily Heatmap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.broker + i} className="border-t border-gray-800/60">
                <td className="py-2 text-white font-medium">{r.broker}</td>
                <td className="py-2 text-gray-200">{r.identity}</td>
                <td className={`py-2 ${r.netValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.netValue.toLocaleString()}</td>
                <td className="py-2 text-gray-200">{Math.round(r.consistency)}%</td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    {r.heatmap.slice(0,8).map((v, idx) => (
                      <div key={idx} title={`${v}`} className="w-6 h-4 bg-gradient-to-t from-gray-700 to-gray-500" style={{height: `${Math.min(100, Math.max(6, v))}%`}} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

function mockRows(): BrokerRow[] {
  return [
    { broker: 'Broker A', identity: 'Whale', netValue: 125000, consistency: 92, heatmap: [5,20,30,60,80,40,20,10] },
    { broker: 'Broker B', identity: 'Retail', netValue: -32000, consistency: 25, heatmap: [10,5,8,12,4,2,1,0] },
    { broker: 'Broker C', identity: 'Whale', netValue: 78000, consistency: 67, heatmap: [2,10,20,40,60,30,10,5] }
  ];
}

export default DeepBrokerFlowTable;
