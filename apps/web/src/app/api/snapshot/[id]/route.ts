import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  try {
    const id = ctx?.params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
        // try by uuid id first
        let res = await supabase.from('snapshots').select('id, name, payload').eq('id', id).maybeSingle()
        if (res && !res.error && res.data) {
          return NextResponse.json({ id: res.data.id, name: res.data.name, payload: res.data.payload })
        }
        // try by filename
        res = await supabase.from('snapshots').select('id, name, payload').eq('name', id).maybeSingle()
        if (res && !res.error && res.data) {
          return NextResponse.json({ id: res.data.id, name: res.data.name, payload: res.data.payload })
        }
        // fall through to filesystem fallback
      } catch (dbErr) {
        console.error('Snapshot DB read failed, falling back to filesystem:', dbErr)
      }
    }

    const snapshotsDir = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
    const filePath = path.join(snapshotsDir, id)
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    const raw = fs.readFileSync(filePath, 'utf-8')
    try {
      const payload = JSON.parse(raw)
      return NextResponse.json({ name: id, payload })
    } catch (e) {
      // return raw if not JSON
      return NextResponse.json({ name: id, payload: raw })
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  try {
    const id = ctx?.params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // simple auth: require x-admin-key header to match env var
    const adminKey = process.env.SNAPSHOT_ADMIN_KEY
    const headers = req.headers
    const provided = headers.get ? headers.get('x-admin-key') : null
    if (!adminKey || !provided || provided !== adminKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
        // try delete by id
        let res = await supabase.from('snapshots').delete().eq('id', id)
        if (!res.error && res.count && res.count > 0) {
          return NextResponse.json({ ok: true, deleted: { by: 'id', count: res.count } })
        }
        // try delete by name
        res = await supabase.from('snapshots').delete().eq('name', id)
        if (!res.error && res.count && res.count > 0) {
          return NextResponse.json({ ok: true, deleted: { by: 'name', count: res.count } })
        }
        // fall through to filesystem
      } catch (dbErr) {
        console.error('Snapshot DB delete failed, falling back to filesystem:', dbErr)
      }
    }

    const snapshotsDir = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
    const filePath = path.join(snapshotsDir, id)
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }
    fs.unlinkSync(filePath)
    return NextResponse.json({ ok: true, deleted: { by: 'fs', name: id } })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
