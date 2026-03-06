import React, { useMemo } from 'react'
import { useSSE } from '@/hooks/useSSE'

const AINarrative: React.FC = () => {
  const streamUrl = (process.env.NEXT_PUBLIC_STREAMER_URL || '') + '/stream/broker-analysis'
  const { lastEvent, events } = useSSE(streamUrl)

  const latestBrokerSummary = useMemo(() => {
    if (!events || events.length === 0) return null
    for (const ev of events) {
      if (!ev) continue
      // broker analysis payloads typically include `brokers` or `stats`
      if (ev.brokers || ev.stats) return ev
    }
    return null
  }, [events])

  const latestML = useMemo(() => {
    if (!events || events.length === 0) return null
    for (const ev of events) {
      if (ev && ev.type === 'ml_inference') return ev
    }
    return null
  }, [events])

  const summary = latestBrokerSummary ? `Brokers: ${latestBrokerSummary.stats?.total_brokers ?? (latestBrokerSummary.brokers ? latestBrokerSummary.brokers.length : 'N/A')} • Whales: ${latestBrokerSummary.stats?.whales ?? 'N/A'} • Anomalous: ${latestBrokerSummary.stats?.anomalous ?? 'N/A'}` : 'No narrative yet.'

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
