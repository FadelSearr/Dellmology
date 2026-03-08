import React, { useMemo } from 'react'
import { useSSE } from '@/hooks/useSSE'

const AINarrative: React.FC = () => {
  const streamUrl = (process.env.NEXT_PUBLIC_STREAMER_URL || '') + '/stream/broker-analysis'
  const { events } = useSSE(streamUrl)

  const latestBrokerSummary = useMemo(() => {
    if (!events || events.length === 0) return null
    for (const ev of events) {
      if (!ev) continue
      const e = ev as any
      // broker analysis payloads typically include `brokers` or `stats`
      if (e.brokers || e.stats) return e
    }
    return null
  }, [events])

  let latestML: { symbol?: string; inference?: unknown; predictions?: unknown } | null = null;
  if (events && events.length > 0) {
    for (const evRaw of events) {
      if (!evRaw || typeof evRaw !== 'object') continue;
      const ev = evRaw as Record<string, unknown>;
      const evStats = ev.stats && typeof ev.stats === 'object' ? (ev.stats as Record<string, unknown>) : undefined;
      // prefer merged ml_inference field inside broker payload
      if ('ml_inference' in ev && ev.ml_inference) {
        const symbolFromStats = evStats && typeof evStats.symbol === 'string' ? evStats.symbol : undefined;
        const symbolField = typeof ev.symbol === 'string' ? ev.symbol : symbolFromStats;
        latestML = { symbol: symbolField, inference: ev.ml_inference };
        break;
      }
      if (ev.type === 'ml_inference') {
        latestML = {
          symbol: typeof ev.symbol === 'string' ? ev.symbol : undefined,
          inference: (ev.inference ?? ev.predictions) as unknown,
        };
        break;
      }
    }
  }

  const summary = (() => {
    if (!latestBrokerSummary) return 'No narrative yet.'
    const stats = latestBrokerSummary.stats && typeof latestBrokerSummary.stats === 'object' ? (latestBrokerSummary.stats as Record<string, unknown>) : undefined
    const totalBrokers = typeof stats?.total_brokers === 'number' ? stats!.total_brokers : Array.isArray(latestBrokerSummary.brokers) ? latestBrokerSummary.brokers.length : 'N/A'
    const whales = typeof stats?.whales === 'number' ? stats!.whales : 'N/A'
    const anomalous = typeof stats?.anomalous === 'number' ? stats!.anomalous : 'N/A'
    return `Brokers: ${totalBrokers} • Whales: ${whales} • Anomalous: ${anomalous}`
  })()

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">AI Narrative</h3>
      <div className="p-3 bg-gray-800/20 rounded">
        <div className="mb-2 text-sm text-gray-300">{summary}</div>
        {latestML ? (
          <div className="text-sm text-gray-200">
            <div className="font-medium">ML Inference ({latestML.symbol || '—'})</div>
            <pre className="mt-2 text-xs text-gray-100 bg-black/10 p-2 rounded">{JSON.stringify(latestML.inference ?? latestML.predictions ?? latestML, null, 2)}</pre>
          </div>
        ) : (
          <div className="text-sm text-gray-400">No ML inference yet. Runs periodically and appears here as it arrives.</div>
        )}
      </div>
    </div>
  )
}

export default AINarrative
