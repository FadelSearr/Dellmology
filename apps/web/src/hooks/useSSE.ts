import { useEffect, useRef, useState } from 'react'

export function useSSE(url: string) {
  const [lastEvent, setLastEvent] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const evtSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!url) return
    const es = new EventSource(url)
    evtSourceRef.current = es
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setLastEvent(data)
        setEvents((s) => [data, ...s].slice(0, 50))
      } catch (err) {
        // ignore parse errors
      }
    }
    es.onerror = () => {
      // reconnect handled by browser; could add backoff
    }
    return () => {
      es.close()
      evtSourceRef.current = null
    }
  }, [url])

  return { lastEvent, events }
}
