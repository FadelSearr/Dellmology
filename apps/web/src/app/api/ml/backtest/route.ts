import { NextResponse } from 'next/server'

export async function POST(req: Request){
  const body = await req.json()
  const incomingAuth = req.headers.get('authorization') || ''
  const token = incomingAuth || (process.env.NEXT_PUBLIC_ADMIN_TOKEN ? `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}` : '')
  const headers: Record<string,string> = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = token
  const res = await fetch(process.env.ML_ENGINE_URL ? `${process.env.ML_ENGINE_URL}/models/backtest` : `http://localhost:8000/models/backtest`, {
    method: 'POST', headers, body: JSON.stringify(body)
  })
  const data = await res.json()
  return NextResponse.json(data)
}
