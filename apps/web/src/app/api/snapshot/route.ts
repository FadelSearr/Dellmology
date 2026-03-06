import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const snapshotsDir = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
    if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true })

    const fileName = `${Date.now()}-snapshot.json`
    const filePath = path.join(snapshotsDir, fileName)
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8')

    return NextResponse.json({ ok: true, file: fileName })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const snapshotsDir = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
    if (!fs.existsSync(snapshotsDir)) return NextResponse.json({ snapshots: [] })

    const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.json'))
    const recent = files.sort().slice(-20)
    return NextResponse.json({ snapshots: recent })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
