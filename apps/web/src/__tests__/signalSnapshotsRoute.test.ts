jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/db', () => ({
  db: {
    query: jest.fn(),
  },
}));

import { db } from '@/lib/db';

describe('Signal Snapshots API', () => {
  beforeEach(() => {
    (db.query as jest.Mock).mockReset();
    (db.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM signal_snapshots') && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [
            {
              id: 1,
              symbol: 'BBCA',
              timeframe: '15m',
              signal: 'BUY',
            },
          ],
        };
      }

      return { rows: [] };
    });
  });

  it('returns snapshots with default limit', async () => {
    const { GET } = await import('@/app/api/signal-snapshots/route');
    const req = { url: 'http://localhost/api/signal-snapshots' } as Request;

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(1);

    const selectCall = (db.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('FROM signal_snapshots') && String(sql).includes('ORDER BY created_at DESC'),
    );

    expect(selectCall).toBeDefined();
    expect(selectCall?.[1]).toEqual([20]);
  });

  it('applies rule-engine aware filters for post-mortem slicing', async () => {
    const { GET } = await import('@/app/api/signal-snapshots/route');
    const req = {
      url: 'http://localhost/api/signal-snapshots?limit=50&symbol=bbca&timeframe=15m&signal=buy&rule_engine_mode=custom&rule_engine_version=RE-DB-ABC123&config_drift=true',
    } as Request;

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(1);

    const selectCall = (db.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('FROM signal_snapshots') && String(sql).includes('ORDER BY created_at DESC'),
    );

    const sql = String(selectCall?.[0]);
    const params = selectCall?.[1] as unknown[];

    expect(sql).toContain("COALESCE(payload->'snapshot_context'->'rule_engine'->>'mode', payload->'rule_engine_versioning'->>'mode')");
    expect(sql).toContain("COALESCE(payload->'snapshot_context'->'rule_engine'->>'version', payload->'rule_engine_versioning'->>'version')");
    expect(sql).toContain("COALESCE((payload->'snapshot_context'->'rule_engine'->>'config_drift')::boolean, (payload->'rule_engine_versioning'->>'config_drift')::boolean)");
    expect(params).toEqual(['BBCA', '15m', 'BUY', 'CUSTOM', 'RE-DB-ABC123', true, 50]);
  });
});
