import React from 'react'
import Link from 'next/link'
import ChartMain from './ChartMain'
import { Section0_CommandBar } from '@/components/sections/Section0_CommandBar'
import WhaleTable from './WhaleTable'
import AINarrative from './AINarrative'
import LiveBrokerAnalysis from './LiveBrokerAnalysis'

const BentoGrid: React.FC = () => {
  const [symbol, setSymbol] = React.useState('BBCA')

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Section0_CommandBar onSymbolChange={(s: string) => setSymbol(s)} />
      <div className="max-w-screen-2xl mx-auto px-4 py-4 grid grid-cols-12 gap-4">
        <aside className="col-span-2 bg-gray-800/40 rounded p-3">
          <div className="text-sm font-semibold mb-2">Discovery & Intelligence</div>
          <nav className="space-y-2 text-xs">
            <Link href="/screener" className="block rounded px-2 py-1 bg-gray-700/40 hover:bg-gray-700/60">AI Screener</Link>
          </nav>
        </aside>
        <main className="col-span-7 bg-gray-800/20 rounded p-3">
          <div className="mb-3 font-semibold">Chart: {symbol}</div>
          <ChartMain symbol={symbol} />
        </main>
        <aside className="col-span-3 bg-gray-800/40 rounded p-3">
          <WhaleTable />
        </aside>

        <section className="col-span-8 bg-gray-800/20 rounded p-3 mt-2">
          <LiveBrokerAnalysis />
        </section>
        <section className="col-span-4 bg-gray-800/40 rounded p-3 mt-2">
          <AINarrative />
        </section>
      </div>
    </div>
  )
}

export default BentoGrid
