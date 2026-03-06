import React from 'react'
import { useSSE } from '@/hooks/useSSE'

interface Broker {
  broker_id: string;
  whale_cluster?: string;
  consistency?: number;
  net_buy_value?: number;
  is_anomalous?: boolean;
}

const WhaleTable: React.FC = () => {
  const { lastEvent } = useSSE((process.env.NEXT_PUBLIC_STREAMER_URL || '') + '/stream/broker-analysis')

  const brokers: Broker[] = (lastEvent?.brokers as unknown as Broker[]) || []

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Whale Flow</h3>
      <div className="space-y-2 max-h-96 overflow-auto">
        {brokers.length === 0 && <div className="text-sm text-gray-400">No data</div>}
        {brokers.map((b) => (
          <div key={b.broker_id} className="p-2 bg-gray-800/30 rounded flex justify-between items-center">
            <div>
              <div className="font-medium">{b.broker_id}</div>
              <div className="text-sm text-gray-300">{b.whale_cluster} · Consistency {Math.round(b.consistency || 0)}%</div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{Math.round(b.net_buy_value || 0).toLocaleString()}</div>
              <div className={`text-sm ${Math.abs(b.net_buy_value || 0) > 0 ? 'text-green-300' : 'text-red-300'}`}>{b.is_anomalous ? 'ANOMALY' : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WhaleTable
