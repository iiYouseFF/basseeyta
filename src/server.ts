import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSocket } from './socket';
import { getPool } from './config/supabase';
import { getRedis } from './config/redis';
import { getCronQueue, scheduleInMemoryJobs } from './jobs/queue';
import { createDailyResetWorker } from './jobs/workers/dailyReset.worker';
import { createExpireOffersWorker } from './jobs/workers/expireOffers.worker';
import { createInvoiceReminderWorker } from './jobs/workers/invoiceReminder.worker';
import { createSearchIndexGCWorker } from './jobs/workers/searchIndexGC.worker';
import { createCleanupDraftsWorker } from './jobs/workers/cleanupDrafts.worker';
import { logger } from './utils/logger';

async function bootstrap() {
  const app = createApp();
  const httpServer = http.createServer(app);

  // Init socket.io
  initSocket(httpServer);

  // Test DB connection
  const pool = getPool();
  if (pool) {
    try {
      await pool.query('SELECT 1');
      logger.info('PostgreSQL connected');
    } catch (e: any) {
      logger.warn('PostgreSQL connection failed: ' + e.message);
    }
  } else {
    logger.info('PostgreSQL not configured – using in-memory store');
  }

  // Test Redis
  const redis = getRedis();
  if (redis) {
    // Redis will connect asynchronously; jobs will fallback if not available
    logger.info('Redis client created');
  }

  // Init BullMQ queues & workers if Redis available
  try {
    const queue = getCronQueue();
    if (queue) {
      // Schedule repeatable jobs
      await queue.add('dailyReset', {}, { repeat: { pattern: '0 0 * * *' }, jobId: 'dailyReset' }).catch(() => {});
      await queue.add('expireOffers', {}, { repeat: { pattern: '0 */6 * * *' }, jobId: 'expireOffers' }).catch(() => {});
      await queue.add('invoiceReminder', {}, { repeat: { pattern: '0 9 * * *' }, jobId: 'invoiceReminder' }).catch(() => {});
      await queue.add('searchIndexGC', {}, { repeat: { pattern: '0 2 * * *' }, jobId: 'searchIndexGC' }).catch(() => {});
      await queue.add('cleanupDrafts', {}, { repeat: { pattern: '0 3 * * 0' }, jobId: 'cleanupDrafts' }).catch(() => {});

      createDailyResetWorker();
      createExpireOffersWorker();
      createInvoiceReminderWorker();
      createSearchIndexGCWorker();
      createCleanupDraftsWorker();
      logger.info('BullMQ workers started');
    } else {
      scheduleInMemoryJobs();
    }
  } catch (e: any) {
    logger.warn('BullMQ init failed: ' + e.message);
    scheduleInMemoryJobs();
  }

  httpServer.listen(env.PORT, () => {
    logger.info(`Basita backend running on http://localhost:${env.PORT} (env: ${env.NODE_ENV})`);
    logger.info(`Health check: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    httpServer.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    httpServer.close(() => process.exit(0));
  });
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

export { bootstrap };
