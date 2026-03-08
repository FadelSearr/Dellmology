// WhaleIdentityClustering.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/common/Card';
import { Loader } from 'lucide-react';

interface WhaleCluster {
  broker: string;
  clusterType: string;
  avgPrice: number;
  totalVolume: number;
  sessionBias: string;
  correlation: string;
}

export const WhaleIdentityClustering: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [clusters, setClusters] = useState<WhaleCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClusters = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/whale-clustering?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) throw new Error('Failed to fetch whale clusters');
        const data = await response.json();
        setClusters(data.clusters || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchClusters();
  }, [symbol]);

  return (
    <Card title="🐋 Whale Identity Clustering" subtitle="Profil dan korelasi broker institusi">
      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader className="animate-spin mr-2" /> Memuat data cluster...
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          Error: {error}
        </div>
      ) : clusters.length === 0 ? (
        <div className="text-center text-gray-400 py-6">Tidak ada cluster whale terdeteksi</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-400">
                <th className="px-2 py-1">Broker</th>
                <th className="px-2 py-1">Cluster Type</th>
                <th className="px-2 py-1">Avg Price</th>
                <th className="px-2 py-1">Total Volume</th>
                <th className="px-2 py-1">Session Bias</th>
                <th className="px-2 py-1">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((cluster, idx) => (
                <tr key={idx} className="border-b border-gray-700 hover:bg-gray-800/50">
                  <td className="px-2 py-1 font-bold text-cyan-400">{cluster.broker}</td>
                  <td className="px-2 py-1">{cluster.clusterType}</td>
                  <td className="px-2 py-1 text-green-400">{cluster.avgPrice.toLocaleString('id-ID')}</td>
                  <td className="px-2 py-1">{cluster.totalVolume.toLocaleString('id-ID')}</td>
                  <td className="px-2 py-1">{cluster.sessionBias}</td>
                  <td className="px-2 py-1">{cluster.correlation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
