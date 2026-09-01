import { store, genId, nowIso } from '../utils/store';

export const JOB_NAMES = ['dailyReset', 'expireOffers', 'invoiceReminder', 'searchIndexGC', 'cleanupDrafts'] as const;
export type JobName = (typeof JOB_NAMES)[number];

const JOB_META: Record<JobName, { schedule: string; purpose: string; workers: boolean }> = {
  dailyReset: { schedule: '0 0 * * * (Africa/Cairo)', purpose: 'Reset todayEarnings & todayOrdersCount for all technicians', workers: true },
  expireOffers: { schedule: 'Every 6 hours', purpose: 'Expire pending offers older than 48h', workers: true },
  invoiceReminder: { schedule: '0 9 * * * (Africa/Cairo)', purpose: 'Push reminder for unpaid invoices', workers: true },
  searchIndexGC: { schedule: 'Daily 03:00', purpose: 'Remove stale search_index entries', workers: false },
  cleanupDrafts: { schedule: 'Weekly (Mon 04:00)', purpose: 'Delete draftNotes older than 30 days', workers: false },
};

export function isJob(name: string): name is JobName {
  return (JOB_NAMES as readonly string[]).includes(name);
}

export function recordJobRun(name: string, status: string, detail?: any) {
  const prev = store.jobRuns[name] || {};
  store.jobRuns[name] = {
    name,
    lastRunAt: nowIso(),
    lastStatus: status,
    runs: (prev.runs || 0) + 1,
    lastDetail: detail || null,
  };
}

export function listJobStatus() {
  return JOB_NAMES.map((name) => ({
    name,
    schedule: JOB_META[name].schedule,
    purpose: JOB_META[name].purpose,
    workers: JOB_META[name].workers,
    lastRunAt: store.jobRuns[name]?.lastRunAt || null,
    lastStatus: store.jobRuns[name]?.lastStatus || 'never',
    runs: store.jobRuns[name]?.runs || 0,
    lastDetail: store.jobRuns[name]?.lastDetail || null,
  }));
}

export async function executeJob(name: JobName): Promise<{ executed: JobName; detail?: any }> {
  switch (name) {
    case 'dailyReset': {
      let count = 0;
      for (const tech of store.technicians.values()) {
        tech.todayEarnings = 0;
        tech.todayOrdersCount = 0;
        tech.updatedAt = nowIso();
        tech.updated_at = nowIso();
        store.technicians.set(tech.phone, tech);
        count++;
      }
      recordJobRun(name, 'ok', { resetTechnicians: count });
      return { executed: name, detail: { resetTechnicians: count } };
    }

    case 'expireOffers': {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      let expired = 0;
      for (const [id, offer] of store.offers.entries()) {
        const created = new Date(offer.createdAt || offer.created_at || 0).getTime();
        if (offer.status === 'pending' && created < cutoff) {
          offer.status = 'expired';
          offer.updatedAt = nowIso();
          offer.updated_at = nowIso();
          store.offers.set(id, offer);
          expired++;
        }
      }
      recordJobRun(name, 'ok', { expired });
      return { executed: name, detail: { expired } };
    }

    case 'invoiceReminder': {
      const unpaid = Array.from(store.serviceRequests.values()).filter((r: any) => r.status === 'completed' && !r.is_paid);
      let sent = 0;
      for (const r of unpaid) {
        const userId = r.userId || r.user_id;
        if (!userId) continue;
        const notif = {
          id: genId(),
          userId,
          userType: 'user',
          title: 'فاتورة معلقة',
          body: 'لديك فاتورة غير مدفوعة، يرجى إتمام الدفع.',
          type: 'invoice',
          data: { requestId: r.id },
          isRead: false,
          createdAt: nowIso(),
          created_at: nowIso(),
        };
        store.notifications.set(notif.id, notif);
        sent++;
      }
      recordJobRun(name, 'ok', { reminders: sent });
      return { executed: name, detail: { reminders: sent } };
    }

    case 'searchIndexGC': {
      let removed = 0;
      for (const [key, entry] of store.searchIndex.entries()) {
        try {
          const et = entry.entity_type || (key.split(':')[0] as string);
          const eid = entry.entity_id || (key.split(':')[1] as string);
          if (!eid) continue;
          if (et === 'technician') {
            if (!store.technicians.has(eid)) { store.searchIndex.delete(key); removed++; }
          } else if (et === 'service_request') {
            if (!store.serviceRequests.has(eid)) { store.searchIndex.delete(key); removed++; }
          }
        } catch { /* never let GC crash */ }
      }
      recordJobRun(name, 'ok', { removedStale: removed });
      return { executed: name, detail: { removedStale: removed } };
    }

    case 'cleanupDrafts':
      recordJobRun(name, 'ok', { note: 'no draft store tracked' });
      return { executed: name, detail: { note: 'no-op' } };
  }
}