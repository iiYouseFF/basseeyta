import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';
import { getMessaging } from '../../config/firebase';

const router = Router();

// GET /notifications?userId={id}&unreadOnly=true&limit=50
router.get('/', authMiddleware, async (req, res) => {
  let userId = req.query.userId as string;
  const unreadOnly = req.query.unreadOnly === 'true';
  const limit = parseInt((req.query.limit as string) || '50', 10);
  if (!userId) return sendError(res, 400, 'userId required');
  // Fix '+' decoded as space
  if (userId.startsWith(' ') && userId.trim().startsWith('201')) userId = '+' + userId.trim();
  // Try variants if phone-like
  let list: any[] = [];
  try {
    const { getPhoneVariants } = require('../../utils/phone');
    const variants = getPhoneVariants(userId);
    list = Array.from(store.notifications.values()).filter((n) => variants.includes(n.userId) || n.userId === userId);
  } catch {
    list = Array.from(store.notifications.values()).filter((n) => n.userId === userId);
  }
  if (unreadOnly) list = list.filter((n) => !n.isRead);
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sendSuccess(res, list.slice(0, limit));
});

// POST /notifications internal
router.post('/', authMiddleware, async (req, res) => {
  const schema = z.object({
    userId: z.string(),
    userType: z.enum(['user', 'technician']),
    title: z.string(),
    body: z.string(),
    type: z.enum(['request_update', 'payment', 'chat', 'system', 'promo', 'verification']),
    data: z.record(z.any()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid notification', parsed.error.errors);
  const id = genId();
  const now = nowIso();
  const notif = {
    id,
    userId: parsed.data.userId,
    userType: parsed.data.userType,
    title: parsed.data.title,
    body: parsed.data.body,
    type: parsed.data.type,
    data: parsed.data.data || {},
    isRead: false,
    createdAt: now,
    created_at: now,
  };
  store.notifications.set(id, notif);
  // Emit socket
  try {
    const { getIo } = require('../../socket');
    const io = getIo();
    if (io) io.of('/notifications').to(`user:${notif.userId}`).emit('notification', notif);
  } catch {}
  return sendSuccess(res, notif, 'Notification created', 201);
});

// PATCH /notifications/:id { isRead: true }
router.patch('/:id', authMiddleware, async (req, res) => {
  const notif = store.notifications.get(req.params.id);
  if (!notif) return sendError(res, 404, 'Notification not found');
  const { isRead } = req.body;
  if (typeof isRead === 'boolean') notif.isRead = isRead;
  notif.updatedAt = nowIso();
  store.notifications.set(req.params.id, notif);
  return sendSuccess(res, notif);
});

// POST /notifications/mark-all-read { userId }
router.post('/mark-all-read', authMiddleware, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return sendError(res, 400, 'userId required');
  let count = 0;
  for (const [id, n] of store.notifications.entries()) {
    if (n.userId === userId && !n.isRead) {
      n.isRead = true;
      n.updatedAt = nowIso();
      store.notifications.set(id, n);
      count++;
    }
  }
  return sendSuccess(res, { updated: count });
});

// GET /notifications/unread-count?userId={id}
router.get('/unread-count', authMiddleware, async (req, res) => {
  let userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  if (userId.startsWith(' ') && userId.trim().startsWith('201')) userId = '+' + userId.trim();
  let count = 0;
  try {
    const { getPhoneVariants } = require('../../utils/phone');
    const variants = getPhoneVariants(userId);
    count = Array.from(store.notifications.values()).filter((n) => (variants.includes(n.userId) || n.userId === userId) && !n.isRead).length;
  } catch {
    count = Array.from(store.notifications.values()).filter((n) => n.userId === userId && !n.isRead).length;
  }
  return sendSuccess(res, { count });
});

// Push endpoint moved to separate router at /push/send – handled in app.ts via pushRouter
// Keep export for backward compat but not used

export default router;
