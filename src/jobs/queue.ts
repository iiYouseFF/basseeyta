import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { getRedis } from '../config/redis';

let cronQueue: Queue | null = null;
let notificationQueue: Queue | null = null;
let paymentQueue: Queue | null = null;

function getConnection() {
  // BullMQ needs ioredis instance; fallback to null (will use in-memory mock if redis not available)
  const redis = getRedis();
  if (!redis) return null;
  return redis;
}

export function getCronQueue(): Queue | null {
  if (cronQueue) return cronQueue;
  const conn = getConnection();
  if (!conn) {
    console.warn('[bullmq] Redis not available – jobs will run in-memory via setInterval fallback');
    return null;
  }
  try {
    cronQueue = new Queue('cronQueue', { connection: conn });
    notificationQueue = new Queue('notificationQueue', { connection: conn });
    paymentQueue = new Queue('paymentQueue', { connection: conn });
    return cronQueue;
  } catch (e: any) {
    console.warn('[bullmq] failed to create queues', e.message);
    return null;
  }
}

export function getNotificationQueue(): Queue | null {
  getCronQueue();
  return notificationQueue;
}

export function getPaymentQueue(): Queue | null {
  getCronQueue();
  return paymentQueue;
}

// In-memory fallback scheduler for dev without Redis
export function scheduleInMemoryJobs() {
  const { store, nowIso } = require('../utils/store');
  // Daily reset at midnight Cairo (UTC+2) -> 22:00 UTC, for dev we run every 24h
  setInterval(async () => {
    console.log('[jobs:memory] dailyReset');
    for (const tech of store.technicians.values()) {
      tech.todayEarnings = 0;
      tech.todayOrdersCount = 0;
      tech.updatedAt = nowIso();
      store.technicians.set(tech.phone, tech);
    }
  }, 24 * 60 * 60 * 1000);

  // Expire offers every 6 hours
  setInterval(async () => {
    console.log('[jobs:memory] expireOffers');
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (const [id, offer] of store.offers.entries()) {
      if (offer.status === 'pending' && new Date(offer.createdAt).getTime() < cutoff) {
        offer.status = 'expired';
        offer.updatedAt = nowIso();
        store.offers.set(id, offer);
      }
    }
  }, 6 * 60 * 60 * 1000);

  // Search GC daily
  setInterval(async () => {
    console.log('[jobs:memory] searchIndexGC');
    for (const [key, entry] of store.searchIndex.entries()) {
      // Remove if entity no longer exists
      if (entry.entity_type === 'service' && !store.serviceRequests.has(entry.entity_id)) {
        store.searchIndex.delete(key);
      }
      if (entry.entity_type === 'post' && !store.posts.has(entry.entity_id)) {
        store.searchIndex.delete(key);
      }
      if (entry.entity_type === 'technician' && !store.technicians.has(entry.entity_id)) {
        store.searchIndex.delete(key);
      }
    }
  }, 24 * 60 * 60 * 1000);

  console.log('[jobs] in-memory schedulers started');
}
