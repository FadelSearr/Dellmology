"use client";

import React, { useEffect, useState } from 'react';

interface BrokerAnalysisPayload {
  symbol?: string;
  summary?: Record<string, unknown>;
  ml_inference?: Record<string, unknown>;
}

const STREAM_URL = process.env.NEXT_PUBLIC_STREAMER_URL || 'http://127.0.0.1:8080/stream/broker-analysis';

export default function LiveBrokerAnalysis() {
  const [payload, setPayload] = useState<BrokerAnalysisPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(STREAM_URL, { withCredentials: false } as EventSourceInit);
      es.onopen = () => {
        setConnected(true);
        setError(null);
      };
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setPayload(data as BrokerAnalysisPayload);
        } catch (e) {
          console.error('failed to parse SSE payload', e);
        }
      };
      es.onerror = (e) => {
        console.warn('SSE error', e);
        setError('Stream disconnected');
        setConnected(false);
        if (es) {
          es.close();
        }
      };
    } catch (err) {
      console.error('failed to open SSE', err);
      // Defer state update to avoid synchronous setState inside effect
      setTimeout(() => setError(String(err)), 0);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  return (
    <div className="border rounded-lg p-3 bg-gray-800/30">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Live Broker Analysis</h3>
        <div className={`text-sm ${connected ? 'text-green-400' : 'text-yellow-400'}`}>{connected ? 'connected' : 'disconnected'}</div>
      </div>

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

      {!payload && (
        <div className="text-sm text-gray-300">Waiting for broker analysis events...</div>
      )}

      {payload && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">Symbol: {payload.symbol || 'N/A'}</div>
          <div className="text-xs text-gray-300">Summary snapshot:</div>
          <pre className="text-xs max-h-56 overflow-auto bg-gray-900 p-2 rounded text-green-200">{JSON.stringify(payload.summary || payload, null, 2)}</pre>
          {payload.ml_inference && (
            <div>
              <div className="text-xs font-semibold">ML Inference</div>
              <pre className="text-xs max-h-28 overflow-auto bg-gray-900 p-2 rounded text-yellow-200">{JSON.stringify(payload.ml_inference, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
