import React, { useEffect, useRef } from 'react'
import { createChart, ISeriesApi } from 'lightweight-charts'

type Props = { symbol: string }

const ChartMain: React.FC<Props> = ({ symbol }) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chartRef.current = createChart(ref.current, { width: ref.current.clientWidth, height: 400, layout: { textColor: '#e5e7eb' } })
    seriesRef.current = (chartRef.current as any).addCandlestickSeries()

    // initialize with placeholder data
    const now = Math.floor(Date.now() / 1000)
    seriesRef.current?.setData([
      { time: now - 60 * 60, open: 100, high: 110, low: 95, close: 105 },
      { time: now - 30 * 60, open: 105, high: 115, low: 100, close: 110 },
      { time: now, open: 110, high: 120, low: 108, close: 115 },
    ] as any)

    const handleResize = () => {
      if (!ref.current || !chartRef.current) return
      chartRef.current.applyOptions({ width: ref.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    // symbol change can trigger data fetch; for now, update title
    if (!chartRef.current) return
    ;(chartRef.current as any).applyOptions({ watermark: { text: symbol, color: 'rgba(255,255,255,0.08)', visible: true } })
  }, [symbol])

  return <div ref={ref} className="w-full h-96" />
}

export default ChartMain
