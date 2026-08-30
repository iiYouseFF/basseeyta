import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY === '...' || env.SUPABASE_SERVICE_ROLE_KEY === 'test_key') {
    // In test/CI, return null to use memory fallback and avoid WebSocket requirement
    return null;
  }
  try {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return supabase;
  } catch (e: any) {
    console.warn('[supabase] Failed to create client, using fallback:', e.message);
    return null;
  }
}

// For direct pg pool
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (pool) return pool;
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('...')) {
    console.warn('[pg] DATABASE_URL not set – using in-memory fallback');
    return null;
  }
  try {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: env.DATABASE_URL.includes('supabase.co') ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (err) => console.error('[pg] pool error', err.message));
    return pool;
  } catch (e: any) {
    console.warn('[pg] Failed to create pool', e.message);
    return null;
  }
}
