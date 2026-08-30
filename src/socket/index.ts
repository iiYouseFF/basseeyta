import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(); // Allow unauth for dev, but attach no user
    try {
      const payload: any = jwt.verify(token, env.JWT_SECRET);
      (socket as any).data = { user: { id: payload.sub, phone: payload.phone, userType: payload.userType } };
      next();
    } catch (e: any) {
      // For dev, allow connection even if token invalid, but log
      console.warn('[socket] auth failed', e.message);
      next();
    }
  });

  // Chat namespace
  const chatNs = io.of('/chat');
  chatNs.on('connection', (socket) => {
    console.log(`[socket:/chat] connected ${socket.id}`);
    socket.on('join_room', (roomId: string) => {
      socket.join(`room:${roomId}`);
      console.log(`[socket:/chat] ${socket.id} joined room:${roomId}`);
    });
    socket.on('leave_room', (roomId: string) => {
      socket.leave(`room:${roomId}`);
    });
    socket.on('send_message', async (data: any) => {
      // Expect { roomId, senderId, senderType, message }
      try {
        // Save to store via direct logic (reuse chat route logic not imported to avoid circular)
        const { store, genId, nowIso } = require('../utils/store');
        const msg = {
          id: genId(),
          roomId: data.roomId,
          senderId: data.senderId,
          senderType: data.senderType,
          message: data.message,
          isRead: false,
          createdAt: nowIso(),
          created_at: nowIso(),
        };
        const msgs = store.chatMessages.get(data.roomId) || [];
        msgs.push(msg);
        store.chatMessages.set(data.roomId, msgs);
        const room = store.chatRooms.get(data.roomId);
        if (room) {
          room.updatedAt = nowIso();
          store.chatRooms.set(room.id, room);
        }
        chatNs.to(`room:${data.roomId}`).emit('new_message', msg);
      } catch (e: any) {
        console.error('[socket:/chat] send_message error', e.message);
      }
    });
    socket.on('disconnect', () => {
      console.log(`[socket:/chat] disconnected ${socket.id}`);
    });
  });

  // Notifications namespace
  const notifNs = io.of('/notifications');
  notifNs.on('connection', (socket) => {
    console.log(`[socket:/notifications] connected ${socket.id}`);
    socket.on('subscribe', (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`[socket:/notifications] ${socket.id} subscribed user:${userId}`);
    });
    socket.on('disconnect', () => {
      console.log(`[socket:/notifications] disconnected ${socket.id}`);
    });
  });

  // Requests namespace
  const reqNs = io.of('/requests');
  reqNs.on('connection', (socket) => {
    console.log(`[socket:/requests] connected ${socket.id}`);
    socket.on('subscribe_governorate', (gov: string) => {
      socket.join(`gov:${gov}`);
      console.log(`[socket:/requests] ${socket.id} subscribed gov:${gov}`);
    });
    socket.on('disconnect', () => {
      console.log(`[socket:/requests] disconnected ${socket.id}`);
    });
  });

  // Default namespace for generic
  io.on('connection', (socket) => {
    console.log(`[socket:/] connected ${socket.id}`);
  });

  console.log('[socket] initialized with namespaces /chat, /notifications, /requests');
  return io;
}

export function getIo(): Server | null {
  return io;
}
