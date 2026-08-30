import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';
import { getMessaging } from '../../config/firebase';

const router = Router();

// POST /push/send
router.post('/send', authMiddleware, async (req, res) => {
  const schema = z.object({
    userId: z.string(),
    userType: z.enum(['user', 'technician']).optional(),
    title: z.string(),
    body: z.string(),
    type: z.string().optional(),
    data: z.record(z.any()).optional(),
    topic: z.string().optional(),
    token: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid push data', parsed.error.errors);

  const id = genId();
  const now = nowIso();
  const notif = {
    id,
    userId: parsed.data.userId,
    userType: (parsed.data.userType as any) || 'user',
    title: parsed.data.title,
    body: parsed.data.body,
    type: (parsed.data.type as any) || 'system',
    data: parsed.data.data || {},
    isRead: false,
    createdAt: now,
    created_at: now,
  };
  store.notifications.set(id, notif);

  let fcmToken: string | null = null;
  const user = store.users.get(parsed.data.userId);
  const tech = store.technicians.get(parsed.data.userId);
  if (user?.fcmToken) fcmToken = user.fcmToken;
  if (tech?.fcmToken) fcmToken = tech.fcmToken;
  if (parsed.data.token) fcmToken = parsed.data.token;

  const messaging = getMessaging();
  if (messaging && fcmToken) {
    try {
      await messaging.send({
        token: fcmToken,
        notification: { title: parsed.data.title, body: parsed.data.body },
        data: parsed.data.data ? Object.fromEntries(Object.entries(parsed.data.data).map(([k, v]) => [k, String(v)])) : undefined,
      });
    } catch (e: any) {
      console.warn('[push] FCM failed', e.message);
    }
  } else if (messaging && parsed.data.topic) {
    try {
      await messaging.send({
        topic: parsed.data.topic,
        notification: { title: parsed.data.title, body: parsed.data.body },
        data: parsed.data.data ? Object.fromEntries(Object.entries(parsed.data.data).map(([k, v]) => [k, String(v)])) : undefined,
      });
    } catch (e: any) {
      console.warn('[push] FCM topic failed', e.message);
    }
  }

  try {
    const { getIo } = require('../../socket');
    const io = getIo();
    if (io) io.of('/notifications').to(`user:${parsed.data.userId}`).emit('notification', notif);
  } catch {}

  return sendSuccess(res, { notification: notif, sent: !!messaging });
});

export default router;
