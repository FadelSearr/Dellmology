jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
  NextRequest: class NextRequest {},
}));

import { POST as backtestPost } from '@/app/api/backtest/route';
import { GET as daytradeGet } from '@/app/api/screener/daytrade/route';
import { POST as deploymentGatePost } from '@/app/api/system-control/deployment-gate/route';
import { POST as updateTokenPost } from '@/app/api/update-token/route';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';
import { readCoolingOffLockState } from '@/lib/security/coolingOff';

jest.mock('@/lib/security/immutableAudit', () => ({
  verifyRuntimeConfigAuditChain: jest.fn(),
}));

jest.mock('@/lib/security/coolingOff', () => ({
  readCoolingOffLockState: jest.fn(),
}));

describe('Guardrail lock response consistency', () => {
  it('returns 423 immutable-audit lock payload for backtest route', async () => {
    const mockedVerify = verifyRuntimeConfigAuditChain as jest.MockedFunction<typeof verifyRuntimeConfigAuditChain>;
    mockedVerify.mockResolvedValueOnce({
      valid: false,
      checkedRows: 17,
      hashMismatches: 2,
      linkageMismatches: 1,
    });

    const req = {
      json: async () => ({}),
    } as Request;

    const response = await backtestPost(req);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toEqual({
      success: false,
      error: 'Immutable audit chain lock active; backtest blocked',
      lock: {
        checked_rows: 17,
        hash_mismatches: 2,
        linkage_mismatches: 1,
      },
    });
  });

  it('returns 423 cooling-off lock payload for daytrade screener route', async () => {
    const mockedCooling = readCoolingOffLockState as jest.MockedFunction<typeof readCoolingOffLockState>;
    mockedCooling.mockResolvedValueOnce({
      active: true,
      activeUntil: '2026-03-04T10:00:00.000Z',
      remainingSeconds: 600,
    });

    const req = {
      url: 'http://localhost/api/screener/daytrade?minutes=30&limit=12',
    } as unknown as Request;

    const response = await daytradeGet(req as never);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toEqual({
      success: false,
      error: 'Cooling-off active: screener temporarily locked',
      lock: {
        active_until: '2026-03-04T10:00:00.000Z',
        remaining_seconds: 600,
      },
    });
  });

  it('returns 423 immutable-audit lock payload for deployment-gate route', async () => {
    const mockedVerify = verifyRuntimeConfigAuditChain as jest.MockedFunction<typeof verifyRuntimeConfigAuditChain>;
    mockedVerify.mockResolvedValueOnce({
      valid: false,
      checkedRows: 9,
      hashMismatches: 1,
      linkageMismatches: 3,
    });

    const req = {
      json: async () => ({ action: 'evaluate' }),
    } as Request;

    const response = await deploymentGatePost(req);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toEqual({
      success: false,
      error: 'Runtime config audit chain verification failed',
      lock: {
        checked_rows: 9,
        hash_mismatches: 1,
        linkage_mismatches: 3,
      },
    });
  });

  it('returns 423 immutable-audit lock payload for update-token route', async () => {
    const mockedVerify = verifyRuntimeConfigAuditChain as jest.MockedFunction<typeof verifyRuntimeConfigAuditChain>;
    mockedVerify.mockResolvedValueOnce({
      valid: false,
      checkedRows: 4,
      hashMismatches: 2,
      linkageMismatches: 0,
    });

    const req = {
      json: async () => ({ token: 'dummy' }),
    } as unknown as Request;

    const response = await updateTokenPost(req as never);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toEqual({
      success: false,
      error: 'Immutable audit chain lock active; token update blocked',
      lock: {
        checked_rows: 4,
        hash_mismatches: 2,
        linkage_mismatches: 0,
      },
    });
  });
});
