import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimit } from './middleware/rateLimit';
import { requestIdMiddleware } from './middleware/requestId';
import { env } from './config/env';

dotenv.config();

// Route imports
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import techniciansRoutes from './modules/technicians/technicians.routes';
import serviceRequestsRoutes from './modules/service-requests/serviceRequests.routes';
import offersRoutes from './modules/offers/offers.routes';
import chatRoutes from './modules/chat/chat.routes';
import storageRoutes from './modules/storage/storage.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import communityRoutes from './modules/community/community.routes';
import searchRoutes from './modules/search/search.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import pushRoutes from './modules/notifications/push.routes';
import supportRoutes from './modules/support/support.routes';
import reviewsRoutes from './modules/reviews/reviews.routes';
import visitsRoutes from './modules/visits/visits.routes';
import appointmentsRoutes from './modules/appointments/appointments.routes';
import familyRoutes from './modules/family/family.routes';
import verificationRoutes from './modules/verification/verification.routes';
import aiRoutes from './modules/ai/ai.routes';
import docsRoutes from './modules/docs/docs.routes';

export function createApp() {
  const app = express();

  // Security & middleware
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(globalRateLimit);

  // Health check – must be before auth
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: 'connected',
      env: env.NODE_ENV,
    });
  });

  // Also support /api/health for compat
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  // API docs – must be before 404
  app.use('/', docsRoutes); // handles /, /api, /api-docs, /api-docs.json
  app.use('/api-docs', docsRoutes); // alias

  // Mount routes – order matters for overlapping prefixes
  // Family and offers/payment handle multiple top-level prefixes, mount at root
  app.use('/', familyRoutes); // handles /users/:uid/family-members and /families/*
  app.use('/', offersRoutes); // handles /service-requests/:id/offers and /offers/:id
  app.use('/', paymentsRoutes); // handles /payment-cards, /payments, /promo-codes, /payments/instapay

  // Standard prefixed routes
  app.use('/auth', authRoutes);
  app.use('/users', usersRoutes);
  app.use('/technicians', techniciansRoutes);
  app.use('/service-requests', serviceRequestsRoutes);
  app.use('/chat', chatRoutes);
  app.use('/storage', storageRoutes);
  app.use('/posts', communityRoutes);
  app.use('/search', searchRoutes);
  app.use('/notifications', notificationsRoutes);
  app.use('/push', pushRoutes);
  app.use('/support-tickets', supportRoutes);
  app.use('/reviews', reviewsRoutes);
  app.use('/visits', visitsRoutes);
  app.use('/appointments', appointmentsRoutes);
  app.use('/verification', verificationRoutes);
  app.use('/ai', aiRoutes);

  // Jobs cron endpoint – secure
  app.post('/jobs/:name', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, message: 'Unauthorized cron' });
    }
    const name = req.params.name;
    const allowed = ['dailyReset', 'expireOffers', 'invoiceReminder', 'searchIndexGC', 'cleanupDrafts'];
    if (!allowed.includes(name)) {
      return res.status(400).json({ success: false, message: `Unknown job ${name}` });
    }
    // Try BullMQ queue
    try {
      const { getCronQueue } = require('./jobs/queue');
      const queue = getCronQueue();
      if (queue) {
        await queue.add(name, {}, { delay: 0 });
        return res.json({ success: true, data: { queued: name } });
      }
    } catch {}
    // Fallback in-memory execution
    try {
      const { store, nowIso, genId } = require('./utils/store');
      if (name === 'dailyReset') {
        for (const tech of store.technicians.values()) {
          tech.todayEarnings = 0;
          tech.todayOrdersCount = 0;
          tech.updatedAt = nowIso();
          store.technicians.set(tech.phone, tech);
        }
      } else if (name === 'expireOffers') {
        const cutoff = Date.now() - 48 * 60 * 60 * 1000;
        for (const [id, offer] of store.offers.entries()) {
          if (offer.status === 'pending' && new Date(offer.createdAt).getTime() < cutoff) {
            offer.status = 'expired';
            offer.updatedAt = nowIso();
            store.offers.set(id, offer);
          }
        }
      } else if (name === 'invoiceReminder') {
        // handled via worker logic
      }
      return res.json({ success: true, data: { queued: name, executed: 'in-memory' } });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
