import { NextRequest, NextResponse } from 'next/server';

// ══════════════════════════════════════════════════════════════
// /api/jobs — Async Job Queue (Redis-backed)
//
// Allows ZeroClaw to submit long-running tasks and poll for results.
// Uses Redis for job state persistence across requests.
//
// Endpoints:
//   POST /api/jobs         → Submit job, returns { jobId }
//   GET  /api/jobs?id=...  → Poll job status
// ══════════════════════════════════════════════════════════════

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';
const JOB_TTL   = 3600; // 1 hour

type JobStatus = 'pending' | 'running' | 'done' | 'error';

interface Job {
  id:         string;
  task:       string;
  params:     Record<string, any>;
  status:     JobStatus;
  result?:    any;
  error?:     string;
  createdAt:  string;
  updatedAt:  string;
}

function genId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function getRedis() {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  return client;
}

// ── POST: Submit a new job ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, params = {} } = body;

    const validTasks = ['oracle_refresh', 'screener_run', 'daily_briefing', 'whale_scan'];
    if (!task || !validTasks.includes(task)) {
      return NextResponse.json(
        { success: false, error: `Invalid task. Valid: ${validTasks.join(', ')}` },
        { status: 400 }
      );
    }

    const jobId = genId();
    const now   = new Date().toISOString();
    const job: Job = {
      id: jobId, task, params,
      status:    'pending',
      createdAt: now,
      updatedAt: now,
    };

    const redis = await getRedis();
    await redis.setEx(`job:${jobId}`, JOB_TTL, JSON.stringify(job));
    await redis.disconnect();

    // Fire-and-forget: execute the task async
    executeJob(jobId, task, params).catch(err =>
      console.error(`[JobQueue] Job ${jobId} failed:`, err)
    );

    return NextResponse.json({ success: true, jobId, status: 'pending' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── GET: Poll job status ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const jobId = new URL(request.url).searchParams.get('id');
  if (!jobId) {
    return NextResponse.json({ success: false, error: 'Missing ?id param' }, { status: 400 });
  }

  try {
    const redis = await getRedis();
    const raw   = await redis.get(`job:${jobId}`);
    await redis.disconnect();

    if (!raw) {
      return NextResponse.json({ success: false, error: 'Job not found or expired' }, { status: 404 });
    }

    const job: Job = JSON.parse(raw);
    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── Internal: Execute job and update Redis ────────────────────
async function executeJob(jobId: string, task: string, params: Record<string, any>) {
  const base = `http://localhost:${process.env.PORT || 3000}`;

  async function updateJob(patch: Partial<Job>) {
    const redis = await getRedis();
    const raw   = await redis.get(`job:${jobId}`);
    if (raw) {
      const job = { ...JSON.parse(raw), ...patch, updatedAt: new Date().toISOString() };
      await redis.setEx(`job:${jobId}`, JOB_TTL, JSON.stringify(job));
    }
    await redis.disconnect();
  }

  await updateJob({ status: 'running' });

  try {
    let result: any;

    switch (task) {
      case 'oracle_refresh':
        result = await fetch(`${base}/api/oracle?refresh=true`).then(r => r.json());
        break;

      case 'screener_run': {
        const mode    = params.mode || 'daytrade';
        const minPrice = params.minPrice || 0;
        const maxPrice = params.maxPrice || 999999;
        result = await fetch(
          `${base}/api/screener?mode=${mode}&minPrice=${minPrice}&maxPrice=${maxPrice}`
        ).then(r => r.json());
        break;
      }

      case 'daily_briefing':
        result = await fetch(`${base}/api/daily-summary?refresh=true`).then(r => r.json());
        break;

      case 'whale_scan':
        result = await fetch(`${base}/api/screener?mode=whale`).then(r => r.json());
        break;

      default:
        throw new Error(`Unknown task: ${task}`);
    }

    await updateJob({ status: 'done', result });
  } catch (err: any) {
    await updateJob({ status: 'error', error: err.message });
  }
}
