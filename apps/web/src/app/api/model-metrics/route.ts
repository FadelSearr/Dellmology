import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
        const res = await supabase.from('model_metrics').select('id, name, metrics, created_at').order('created_at', { ascending: false }).limit(1)
        if (!res.error && Array.isArray(res.data) && res.data.length > 0) return NextResponse.json({ latest: res.data[0] })
      } catch (e) {
        console.error('Model metrics DB read failed:', e)
      }
    }

    const dataPath = path.join(process.cwd(), 'apps', 'ml-engine', 'model_metrics.json')
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf-8')
      const payload = JSON.parse(raw)
      return NextResponse.json({ latest: { name: 'local-file', metrics: payload } })
    }

    return NextResponse.json({ latest: null })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const adminKey = process.env.MODEL_METRICS_ADMIN_KEY
    const provided = req.headers.get('x-admin-key')
    if (!adminKey || !provided || provided !== adminKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
        const insert = await supabase.from('model_metrics').insert({ name: body.name || 'ci-metrics', metrics: body.metrics }).select()
        if (!insert.error) return NextResponse.json({ ok: true, persisted: 'db', row: insert.data?.[0] ?? null })
      } catch (e) {
        console.error('Model metrics DB write failed, falling back to FS:', e)
      }
    }

    const outDir = path.join(process.cwd(), 'apps', 'ml-engine')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'model_metrics.json')
    fs.writeFileSync(outPath, JSON.stringify(body.metrics ?? body, null, 2), 'utf-8')
    return NextResponse.json({ ok: true, persisted: 'fs', path: outPath })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
