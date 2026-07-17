/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Supabase Client & Data Access Layer
   ══════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Session / Token Management ───────────────────────────────

export async function getSessionValue(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('session')
    .select('value, is_valid, expires_at')
    .eq('key', key)
    .single();

  if (error || !data) return null;
  
  if (data.is_valid === false) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  
  return data.value;
}

export async function upsertSession(
  key: string,
  value: string,
  expiresAt?: Date
) {
  const { data, error } = await supabase
    .from('session')
    .upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
        expires_at: expiresAt?.toISOString() || null,
        is_valid: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    .select();

  if (error) throw error;
  return data;
}

export async function getTokenStatus() {
  const { data, error } = await supabase
    .from('session')
    .select('value, expires_at, last_used_at, is_valid, updated_at')
    .eq('key', 'stockbit_token')
    .single();

  if (error || !data) {
    return {
      exists: false,
      isValid: false,
      isExpiringSoon: false,
      isExpired: true,
    };
  }

  const now = new Date();
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < now : false;
  const hoursUntilExpiry = expiresAt
    ? (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
    : undefined;
  const isExpiringSoon =
    hoursUntilExpiry !== undefined && hoursUntilExpiry <= 1 && hoursUntilExpiry > 0;

  return {
    exists: true,
    isValid: data.is_valid !== false && !isExpired,
    token: data.value,
    expiresAt: data.expires_at,
    lastUsedAt: data.last_used_at,
    updatedAt: data.updated_at,
    isExpiringSoon,
    isExpired,
    hoursUntilExpiry,
  };
}

export async function updateTokenLastUsed() {
  await supabase
    .from('session')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key', 'stockbit_token');
}

export async function invalidateToken() {
  await supabase
    .from('session')
    .update({ is_valid: false })
    .eq('key', 'stockbit_token');
}
