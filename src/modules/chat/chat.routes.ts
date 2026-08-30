import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

// POST /chat/rooms idempotent
router.post('/rooms', authMiddleware, async (req, res) => {
  const schema = z.object({
    clientId: z.string(),
    technicianId: z.string(),
    requestId: z.string(),
    serviceType: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid body', parsed.error.errors);

  // Check if room with requestId exists
  let existing = Array.from(store.chatRooms.values()).find((r) => r.requestId === parsed.data.requestId);
  if (existing) {
    // Update if needed
    if (parsed.data.technicianId && existing.technicianId !== parsed.data.technicianId) {
      existing.technicianId = parsed.data.technicianId;
      existing.updatedAt = nowIso();
      store.chatRooms.set(existing.id, existing);
    }
    return sendSuccess(res, existing);
  }

  const id = genId();
  const now = nowIso();
  const room = {
    id,
    clientId: parsed.data.clientId,
    technicianId: parsed.data.technicianId,
    requestId: parsed.data.requestId,
    serviceType: parsed.data.serviceType || '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  store.chatRooms.set(id, room);
  store.chatMessages.set(id, []);
  return sendSuccess(res, room, 'Room created', 201);
});

// GET /chat/rooms?userId={id}
router.get('/rooms', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  const rooms = Array.from(store.chatRooms.values())
    .filter((r) => r.clientId === userId || r.technicianId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return sendSuccess(res, rooms);
});

// GET /chat/rooms/:id/messages?limit=50
router.get('/rooms/:id/messages', authMiddleware, async (req, res) => {
  const room = store.chatRooms.get(req.params.id);
  if (!room) return sendError(res, 404, 'Room not found');
  const limit = parseInt(req.query.limit as string || '50', 10);
  const messages = (store.chatMessages.get(req.params.id) || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
  return sendSuccess(res, messages);
});

// POST /chat/rooms/:id/messages
router.post('/rooms/:id/messages', authMiddleware, async (req, res) => {
  const room = store.chatRooms.get(req.params.id);
  if (!room) return sendError(res, 404, 'Room not found');
  const schema = z.object({
    senderId: z.string(),
    senderType: z.enum(['user', 'technician']),
    message: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid message', parsed.error.errors);

  const id = genId();
  const now = nowIso();
  const msg = {
    id,
    roomId: req.params.id,
    senderId: parsed.data.senderId,
    senderType: parsed.data.senderType,
    message: parsed.data.message,
    isRead: false,
    createdAt: now,
    created_at: now,
  };
  const msgs = store.chatMessages.get(req.params.id) || [];
  msgs.push(msg);
  store.chatMessages.set(req.params.id, msgs);
  room.updatedAt = now;
  store.chatRooms.set(room.id, room);

  // Push notification to other party
  const otherUserId = parsed.data.senderType === 'user' ? room.technicianId : room.clientId;
  const otherType = parsed.data.senderType === 'user' ? 'technician' : 'user';
  const notifId = genId();
  store.notifications.set(notifId, {
    id: notifId,
    userId: otherUserId,
    userType: otherType as any,
    title: 'رسالة جديدة',
    body: parsed.data.message.slice(0, 50),
    type: 'chat' as const,
    data: { roomId: room.id, messageId: id, requestId: room.requestId },
    isRead: false,
    createdAt: now,
    created_at: now,
  });

  try {
    const { getIo } = require('../../socket');
    const io = getIo();
    if (io) {
      io.of('/chat').to(`room:${room.id}`).emit('new_message', msg);
      io.of('/notifications').to(`user:${otherUserId}`).emit('notification', { title: 'رسالة جديدة', message: msg });
    }
  } catch {}

  return sendSuccess(res, msg, 'Message sent', 201);
});

// PATCH /chat/rooms/:id/read
router.patch('/rooms/:id/read', authMiddleware, async (req, res) => {
  const room = store.chatRooms.get(req.params.id);
  if (!room) return sendError(res, 404, 'Room not found');
  const schema = z.object({ userId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'userId required', parsed.error.errors);
  const msgs = store.chatMessages.get(req.params.id) || [];
  let updatedCount = 0;
  for (const m of msgs) {
    if (m.senderId !== parsed.data.userId && !m.isRead) {
      m.isRead = true;
      updatedCount++;
    }
  }
  store.chatMessages.set(req.params.id, msgs);
  return sendSuccess(res, { updated: updatedCount });
});

// GET /chat/rooms/:id/unread?userId={id}
router.get('/rooms/:id/unread', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  const msgs = store.chatMessages.get(req.params.id) || [];
  const count = msgs.filter((m) => m.senderId !== userId && !m.isRead).length;
  return sendSuccess(res, { count });
});

export default router;
