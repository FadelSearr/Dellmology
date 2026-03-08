import React from 'react'
import WhaleZScoreTable from '@/components/analysis/WhaleZScoreTable'

export default function Page() {
  return (
    <main>
      <h1>Whale Z-Score</h1>
      <p>Top brokers by z-score (net volume) for selected symbol.</p>
      <WhaleZScoreTable symbol="BBCA" />
    </main>
  )
}
