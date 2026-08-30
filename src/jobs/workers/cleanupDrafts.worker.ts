import { Worker } from 'bullmq';
import { getRedis } from '../../config/redis';

export function createCleanupDraftsWorker() {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const worker = new Worker(
      'cronQueue',
      async (job) => {
        if (job.name !== 'cleanupDrafts') return;
        console.log('[worker:cleanupDrafts] running – no draftNotes table in memory, skipping');
        // In real DB, DELETE FROM draft_notes WHERE created_at < now() - interval '30 days'
        return { cleaned: 0 };
      },
      { connection: redis, concurrency: 1 }
    );
    return worker;
  } catch (e: any) {
    console.warn('[worker:cleanupDrafts] failed', e.message);
    return null;
  }
}
