"use client"

import React, { useEffect, useState } from 'react'

type MLStatus = {
	champion?: string
	challenger?: string
	metrics?: Record<string, number>
	last_backtest?: string
}

export default function PromotionPage(){
	const [status, setStatus] = useState<MLStatus | null>(null)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState('')

	async function fetchStatus(){
		try{
			const res = await fetch('/api/ml/status')
			const j = await res.json()
			setStatus(j)
		}catch(e){ setMessage('Failed to fetch status') }
	}

	useEffect(()=>{ fetchStatus() }, [])

	async function runBacktest(){
		if(!status?.challenger) return
		setLoading(true)
		setMessage('Running backtest...')
		try{
			const res = await fetch('/api/ml/backtest', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({model_name: status.challenger})})
			const j = await res.json()
			setMessage('Backtest finished: ' + JSON.stringify(j.backtest || j))
		}catch(e){ setMessage('Backtest failed') }
		setLoading(false)
		fetchStatus()
	}

	async function promote(){
		if(!status?.challenger) return
		setLoading(true)
		setMessage('Promoting challenger...')
		try{
			const res = await fetch('/api/ml/promote', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({require_backtest: false})})
			const j = await res.json()
			setMessage('Promote result: ' + JSON.stringify(j))
		}catch(e){ setMessage('Promote failed') }
		setLoading(false)
		fetchStatus()
	}

	async function applyCheckpoint(){
		const name = prompt('Checkpoint name to apply as challenger:')
		if(!name) return
		setLoading(true)
		try{
			const res = await fetch('/api/ml/apply_checkpoint', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name})})
			const j = await res.json()
			setMessage('Apply checkpoint: ' + JSON.stringify(j))
		}catch(e){ setMessage('Apply failed') }
		setLoading(false)
		fetchStatus()
	}

	return (
		<div className="p-6 max-w-3xl">
			<h1 className="text-2xl font-bold mb-4">Model Promotion</h1>
			<div className="mb-2"><strong>Champion:</strong> {status?.champion || '—'}</div>
			<div className="mb-4"><strong>Challenger:</strong> {status?.challenger || '—'}</div>
			{status?.last_backtest && <div className="text-xs text-gray-400 mb-3">Last backtest: {new Date(status.last_backtest).toLocaleString()}</div>}
			<div className="flex gap-2 mb-4">
				<button onClick={runBacktest} disabled={loading || !status?.challenger} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-white">Backtest Challenger</button>
				<button onClick={promote} disabled={loading || !status?.challenger} className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-white">Promote Challenger</button>
				<button onClick={applyCheckpoint} disabled={loading} className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-white">Apply Checkpoint</button>
			</div>
			<div>{message && <em className="text-sm text-gray-300">{message}</em>}</div>
		</div>
	)
}


