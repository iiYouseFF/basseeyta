import { Worker } from 'bullmq';
import { getRedis } from '../../config/redis';

export function createInvoiceReminderWorker() {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const worker = new Worker(
      'cronQueue',
      async (job) => {
        if (job.name !== 'invoiceReminder') return;
        const { store, genId, nowIso } = require('../../utils/store');
        console.log('[worker:invoiceReminder] running');
        let sent = 0;
        for (const req of store.serviceRequests.values()) {
          if (req.status === 'completed' && !req.isPaid) {
            const notifId = genId();
            store.notifications.set(notifId, {
              id: notifId,
              userId: req.userId,
              userType: 'user' as const,
              title: 'تذكير بالدفع',
              body: `طلب ${req.title} بانتظار الدفع`,
              type: 'payment' as const,
              data: { requestId: req.id },
              isRead: false,
              createdAt: nowIso(),
              created_at: nowIso(),
            });
            sent++;
          }
        }
        return { sent };
      },
      { connection: redis, concurrency: 1 }
    );
    return worker;
  } catch (e: any) {
    console.warn('[worker:invoiceReminder] failed', e.message);
    return null;
  }
}
