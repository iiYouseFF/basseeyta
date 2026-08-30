import { Worker } from 'bullmq';
import { getRedis } from '../../config/redis';

export function createDailyResetWorker() {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const worker = new Worker(
      'cronQueue',
      async (job) => {
        if (job.name !== 'dailyReset') return;
        const { store, nowIso } = require('../../utils/store');
        console.log('[worker:dailyReset] running');
        let count = 0;
        for (const tech of store.technicians.values()) {
          tech.todayEarnings = 0;
          tech.todayOrdersCount = 0;
          tech.updatedAt = nowIso();
          store.technicians.set(tech.phone, tech);
          count++;
        }
        // Also try pg if available
        try {
          const { getPool } = require('../../config/supabase');
          const pool = getPool();
          if (pool) await pool.query(`UPDATE technicians SET today_earnings = 0, today_orders_count = 0`);
        } catch {}
        return { reset: count };
      },
      { connection: redis, concurrency: 1 }
    );
    worker.on('completed', (job) => console.log(`[worker:dailyReset] completed ${job.id}`));
    worker.on('failed', (job, err) => console.error(`[worker:dailyReset] failed ${job?.id}`, err.message));
    return worker;
  } catch (e: any) {
    console.warn('[worker:dailyReset] failed', e.message);
    return null;
  }
}
