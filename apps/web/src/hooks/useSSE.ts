import { useEffect, useRef, useState } from 'react'

export function useSSE<T = unknown>(url: string) {
  const [lastEvent, setLastEvent] = useState<T | null>(null)
  const [events, setEvents] = useState<T[]>([])
  const evtSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!url) return
    const es = new EventSource(url)
    evtSourceRef.current = es
    es.onmessage = (e) => {
      try {
        const parsed: unknown = JSON.parse(e.data)
        const data = parsed as T
        setLastEvent(data)
        setEvents((s) => [data, ...s].slice(0, 50))
      } catch {
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
