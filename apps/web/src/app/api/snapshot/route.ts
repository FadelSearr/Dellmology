import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const fileName = `${Date.now()}-snapshot.json`

    // If Supabase is configured, attempt to persist snapshot to DB
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
        // Attempt insert into `snapshots` table. If table doesn't exist, this will error and we fall back to FS.
        const insert = await supabase.from('snapshots').insert({ name: fileName, payload: body }).select()
        if (insert.error) throw insert.error
        return NextResponse.json({ ok: true, persisted: 'db', row: insert.data?.[0] ?? null })
      } catch (dbErr) {
        // fall through to filesystem fallback
        console.error('Snapshot DB insert failed, falling back to filesystem:', dbErr)
      }
    }

    const snapshotsDir = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
    if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true })

    const filePath = path.join(snapshotsDir, fileName)
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8')

    return NextResponse.json({ ok: true, file: fileName, persisted: 'fs' })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
        const res = await supabase.from('snapshots').select('id, name, created_at').order('created_at', { ascending: false }).limit(20)
        if (!res.error) {
          return NextResponse.json({ snapshots: res.data ?? [] })
        }
        // else fall through to filesystem
        console.error('Snapshot DB select failed, falling back to filesystem:', res.error)
      } catch (e) {
        console.error('Snapshot DB query error, falling back to filesystem:', e)
      }
    }

    const snapshotsDir = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
    if (!fs.existsSync(snapshotsDir)) return NextResponse.json({ snapshots: [] })

    const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.json'))
    const recent = files.sort().slice(-20)
    return NextResponse.json({ snapshots: recent })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
