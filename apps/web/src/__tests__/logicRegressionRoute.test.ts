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

describe('Logic Regression API', () => {
  beforeEach(() => {
    (db.query as jest.Mock).mockReset();
  });

  it('supports snapshot_context votes and reports rule-engine mismatch health', async () => {
    (db.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          id: 1,
          symbol: 'BBCA',
          signal: 'BUY',
          payload: {
            snapshot_context: {
              consensus: {
                bullish_votes: 2,
                bearish_votes: 1,
                votes: {
                  technical: 'BUY',
                  bandarmology: 'BUY',
                  sentiment: 'SELL',
                },
              },
              rule_engine: {
                mode: 'CUSTOM',
                version: 'RE-DB-123',
              },
            },
          },
        },
        {
          id: 2,
          symbol: 'BBCA',
          signal: 'SELL',
          payload: {
            votes: {
              technical: 'BUY',
              bandarmology: 'BUY',
              sentiment: 'SELL',
              buy_votes: 2,
              sell_votes: 1,
            },
            rule_engine_versioning: {
              mode: 'BASELINE',
              version: 'RE-ENV-999',
            },
          },
        },
      ],
    });

    const { GET } = await import('@/app/api/logic-regression/route');
    const req = { url: 'http://localhost/api/logic-regression?symbol=BBCA&limit=100' } as Request;

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.checked_cases).toBe(2);
    expect(json.mismatches).toBe(1);
    expect(json.deployment_blocked).toBe(true);

    expect(Array.isArray(json.rule_engine_health)).toBe(true);
    expect(json.rule_engine_health).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'CUSTOM',
          version: 'RE-DB-123',
          checked_cases: 1,
          mismatches: 0,
          pass: true,
        }),
        expect.objectContaining({
          mode: 'BASELINE',
          version: 'RE-ENV-999',
          checked_cases: 1,
          mismatches: 1,
          pass: false,
        }),
      ]),
    );
  });
});
