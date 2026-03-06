import React from 'react'
import { useSSE } from '@/hooks/useSSE'

const AINarrative: React.FC = () => {
  const { lastEvent } = useSSE((process.env.NEXT_PUBLIC_STREAMER_URL || '') + '/stream/broker-analysis')

  const summary = lastEvent?.stats ? `Brokers: ${lastEvent.stats.total_brokers} • Whales: ${lastEvent.stats.whales} • Anomalous: ${lastEvent.stats.anomalous}` : 'No narrative yet.'

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">AI Narrative (Placeholder)</h3>
      <div className="p-3 bg-gray-800/20 rounded">
        <div className="mb-2 text-sm text-gray-300">{summary}</div>
        <div className="text-sm text-gray-400">Gemini narrative will appear here once integrated. For now, this summarizes broker analysis stats.</div>
      </div>
    </div>
  )
}

export default AINarrative
