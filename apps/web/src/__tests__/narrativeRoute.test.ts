jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/security/coolingOff', () => ({
  readCoolingOffLockState: jest.fn(async () => ({ active: false })),
}));

describe('Narrative API', () => {
  it('returns 200 with default message when data empty', async () => {
    const { POST } = await import('@/app/api/narrative/route');
    const req = {
      json: async () => ({ type: 'broker', symbol: 'TEST', data: {} }),
    } as unknown as Request;
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.narrative).toMatch(/narasi/i);
    expect(json.primary_narrative).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(json, 'bearish_counter_case')).toBe(true);
  });
});
