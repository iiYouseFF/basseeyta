import IORedis from 'ioredis';
import { env } from './env';

let redis: IORedis | null = null;
let redisAvailable = false;

export function getRedis(): IORedis | null {
  if (redis) return redisAvailable ? redis : null;
  if (!env.REDIS_URL) return null;
  try {
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on('connect', () => {
      redisAvailable = true;
      console.log('[redis] connected');
    });
    redis.on('error', (err) => {
      redisAvailable = false;
      console.warn('[redis] error', err.message);
    });
    // Try connect but don't block
    redis.connect().catch(() => {
      redisAvailable = false;
      console.warn('[redis] not available – using in-memory fallback');
    });
    return redis;
  } catch (e: any) {
    console.warn('[redis] failed', e.message);
    return null;
  }
}

// In-memory fallback for blacklist/counters
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (r && redisAvailable) {
    try {
      await r.set(key, value, 'EX', ttlSeconds);
      return;
    } catch {}
  }
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (r && redisAvailable) {
    try {
      const v = await r.get(key);
      if (v !== null) return v;
    } catch {}
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

export async function redisExists(key: string): Promise<boolean> {
  return (await redisGet(key)) !== null;
}

export async function redisIncr(key: string, ttlSeconds: number): Promise<number> {
  const r = getRedis();
  if (r && redisAvailable) {
    try {
      const val = await r.incr(key);
      if (val === 1) await r.expire(key, ttlSeconds);
      return val;
    } catch {}
  }
  const entry = memoryStore.get(key);
  let current = 0;
  if (entry && Date.now() <= entry.expiresAt) {
    current = parseInt(entry.value, 10) || 0;
  }
  current += 1;
  const expiresAt = entry && Date.now() <= entry.expiresAt ? entry.expiresAt : Date.now() + ttlSeconds * 1000;
  memoryStore.set(key, { value: String(current), expiresAt });
  return current;
}

export async function redisDel(key: string): Promise<void> {
  const r = getRedis();
  if (r && redisAvailable) {
    try {
      await r.del(key);
    } catch {}
  }
  memoryStore.delete(key);
}
