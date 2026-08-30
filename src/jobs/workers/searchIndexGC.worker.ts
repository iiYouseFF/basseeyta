import { Worker } from 'bullmq';
import { getRedis } from '../../config/redis';

export function createSearchIndexGCWorker() {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const worker = new Worker(
      'cronQueue',
      async (job) => {
        if (job.name !== 'searchIndexGC') return;
        const { store } = require('../../utils/store');
        console.log('[worker:searchIndexGC] running');
        let removed = 0;
        for (const [key, entry] of Array.from(store.searchIndex.entries() as [string, any][])) {
          if (entry.entity_type === 'service' && !store.serviceRequests.has(entry.entity_id)) {
            store.searchIndex.delete(key);
            removed++;
          }
          if (entry.entity_type === 'post' && !store.posts.has(entry.entity_id)) {
            store.searchIndex.delete(key);
            removed++;
          }
          if (entry.entity_type === 'technician' && !store.technicians.has(entry.entity_id)) {
            store.searchIndex.delete(key);
            removed++;
          }
        }
        return { removed };
      },
      { connection: redis, concurrency: 1 }
    );
    return worker;
  } catch (e: any) {
    console.warn('[worker:searchIndexGC] failed', e.message);
    return null;
  }
}
