export type SourceProvider =
  | 'PRIMARY_DB'
  | 'PRIMARY_TRADES'
  | 'SUPABASE'
  | 'FALLBACK_DAILY_PRICES'
  | 'FALLBACK_EMPTY'
  | 'NONE';

export interface SourceAdapterMeta {
  provider: SourceProvider;
  degraded: boolean;
  reason: string | null;
  fallback_delay_minutes: number;
  diagnostics?: {
    primary_latency_ms: number | null;
    fallback_latency_ms: number | null;
    primary_error: string | null;
    selected_source: SourceProvider;
    checked_at: string;
  };
}

export function sourceMeta(input: {
  provider: SourceProvider;
  degraded?: boolean;
  reason?: string | null;
  fallbackDelayMinutes?: number;
  diagnostics?: {
    primary_latency_ms: number | null;
    fallback_latency_ms: number | null;
    primary_error: string | null;
    selected_source: SourceProvider;
    checked_at: string;
  };
}): SourceAdapterMeta {
  return {
    provider: input.provider,
    degraded: Boolean(input.degraded),
    reason: input.reason ?? null,
    fallback_delay_minutes: Number(input.fallbackDelayMinutes || 0),
    diagnostics: input.diagnostics,
  };
}

export function primaryDbMeta(): SourceAdapterMeta {
  return sourceMeta({
    provider: 'PRIMARY_DB',
    degraded: false,
    reason: null,
    fallbackDelayMinutes: 0,
  });
}

export function fallbackEmptyMeta(reason: string): SourceAdapterMeta {
  return sourceMeta({
    provider: 'FALLBACK_EMPTY',
    degraded: true,
    reason,
    fallbackDelayMinutes: 15,
  });
}
