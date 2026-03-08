'use client';

import React, { useEffect, useState } from 'react';

interface ServiceStatus {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  note?: string;
  lastChecked: number;
}

const ServiceHealth: React.FC = () => {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = (await res.json()) as { services: ServiceStatus[] };
        if (mounted) setServices(data.services || []);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const dotColor = (s: ServiceStatus['status']) =>
    s === 'ok' ? 'bg-green-400' : s === 'degraded' ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="p-3 bg-slate-900 border border-slate-700 rounded">
      <div className="text-sm font-semibold text-white">Service Health</div>
      <div className="mt-2 space-y-2">
        {loading && <div className="text-sm text-slate-400">Checking...</div>}
        {!loading && services.length === 0 && (
          <div className="text-sm text-slate-400">No health data available</div>
        )}
        {services.map((s) => (
          <div key={s.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${dotColor(s.status)}`} />
              <div className="text-slate-200">{s.name}</div>
            </div>
            <div className="text-slate-400">{s.note ?? new Date(s.lastChecked).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServiceHealth;
