import { Worker } from 'bullmq';
import { getRedis } from '../../config/redis';

export function createExpireOffersWorker() {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const worker = new Worker(
      'cronQueue',
      async (job) => {
        if (job.name !== 'expireOffers') return;
        const { store, nowIso } = require('../../utils/store');
        console.log('[worker:expireOffers] running');
        let expired = 0;
        const cutoff = Date.now() - 48 * 60 * 60 * 1000;
        for (const [id, offer] of store.offers.entries()) {
          if (offer.status === 'pending' && new Date(offer.createdAt).getTime() < cutoff) {
            offer.status = 'expired';
            offer.updatedAt = nowIso();
            store.offers.set(id, offer);
            expired++;
          }
        }
        try {
          const { getPool } = require('../../config/supabase');
          const pool = getPool();
          if (pool) await pool.query(`UPDATE offers SET status = 'expired' WHERE status = 'pending' AND created_at < now() - interval '48 hours'`);
        } catch {}
        return { expired };
      },
      { connection: redis, concurrency: 1 }
    );
    return worker;
  } catch (e: any) {
    console.warn('[worker:expireOffers] failed', e.message);
    return null;
  }
}
