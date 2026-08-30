import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

// POST /service-requests/:id/offers
router.post('/service-requests/:id/offers', authMiddleware, async (req, res) => {
  if (req.user!.userType !== 'technician') {
    return sendError(res, 403, 'Only technicians can create offers');
  }
  const request = store.serviceRequests.get(req.params.id);
  if (!request) return sendError(res, 404, 'Request not found');

  const schema = z.object({
    price: z.union([z.number(), z.string()]),
    technicianId: z.string().optional(),
    technicianName: z.string().optional(),
    name: z.string().optional(),
    rating: z.number().optional(),
    reviewsCount: z.number().optional(),
    experienceYears: z.number().optional(),
    arrivalTime: z.string().optional(),
    duration: z.string().optional(),
    imagePath: z.string().optional(),
    isVerified: z.boolean().optional(),
    hasGreenArrivalTag: z.boolean().optional(),
    warranty: z.string().optional(),
    message: z.string().optional(),
    provideMaterials: z.boolean().optional(),
    priceIncludesMaterials: z.boolean().optional(),
    status: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid offer data', parsed.error.errors);

  const id = genId();
  const now = nowIso();
  const offer = {
    id,
    requestId: req.params.id,
    technicianId: parsed.data.technicianId || req.user!.phone,
    technicianName: parsed.data.technicianName || parsed.data.name || 'Technician',
    name: parsed.data.name || parsed.data.technicianName || 'Technician',
    price: Number(parsed.data.price),
    rating: parsed.data.rating ?? 4.5,
    reviewsCount: parsed.data.reviewsCount ?? 0,
    experienceYears: parsed.data.experienceYears ?? 2,
    arrivalTime: parsed.data.arrivalTime || 'خلال 30 دقيقة',
    duration: parsed.data.duration || '2 ساعات',
    imagePath: parsed.data.imagePath || '',
    isVerified: parsed.data.isVerified ?? false,
    hasGreenArrivalTag: parsed.data.hasGreenArrivalTag ?? false,
    warranty: parsed.data.warranty || 'شهر',
    message: parsed.data.message || '',
    provideMaterials: parsed.data.provideMaterials ?? false,
    priceIncludesMaterials: parsed.data.priceIncludesMaterials ?? false,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now,
  };
  store.offers.set(id, offer);

  // Atomically update request
  request.hasOffers = true;
  request.lastOfferTime = now;
  request.updatedAt = now;
  request.updated_at = now;
  store.serviceRequests.set(req.params.id, request);

  // Notification to customer (in-memory)
  const notifId = genId();
  store.notifications.set(notifId, {
    id: notifId,
    userId: request.userId,
    userType: 'user' as const,
    title: 'عرض جديد',
    body: `تم استلام عرض جديد بسعر ${offer.price} ج.م`,
    type: 'request_update' as const,
    data: { requestId: request.id, offerId: id },
    isRead: false,
    createdAt: now,
    created_at: now,
  });

  // Emit via socket.io if available
  try {
    const { getIo } = require('../../socket');
    const io = getIo();
    if (io) {
      io.of('/requests').to(`gov:${request.userGovernorate}`).emit('new_offer', offer);
      io.of('/notifications').to(`user:${request.userId}`).emit('notification', { title: 'عرض جديد', offer });
    }
  } catch {}

  return sendSuccess(res, offer, 'Offer created', 201);
});

// GET /service-requests/:id/offers
router.get('/service-requests/:id/offers', async (req, res) => {
  const offers = Array.from(store.offers.values())
    .filter((o) => o.requestId === req.params.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sendSuccess(res, offers);
});

// PATCH /offers/:id { status: accepted|rejected }
router.patch('/offers/:id', authMiddleware, async (req, res) => {
  const offer = store.offers.get(req.params.id);
  if (!offer) return sendError(res, 404, 'Offer not found');
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) return sendError(res, 400, 'status must be accepted or rejected');

  if (status === 'rejected') {
    offer.status = 'rejected';
    offer.updatedAt = nowIso();
    offer.updated_at = offer.updatedAt;
    store.offers.set(offer.id, offer);
    return sendSuccess(res, offer);
  }

  // Accepted – transactional block
  // In real DB this would be BEGIN ... COMMIT; here we simulate atomic with try/catch
  try {
    const request = store.serviceRequests.get(offer.requestId);
    if (!request) return sendError(res, 404, 'Request not found for offer');

    // 1. Update offer -> accepted
    offer.status = 'accepted';
    offer.updatedAt = nowIso();
    offer.updated_at = offer.updatedAt;
    store.offers.set(offer.id, offer);

    // 2. Update service_requests
    request.status = 'accepted';
    request.technicianId = offer.technicianId;
    request.technicianName = offer.technicianName;
    request.acceptedPrice = offer.price;
    request.acceptedAt = nowIso();
    request.updatedAt = nowIso();
    request.updated_at = request.updatedAt;
    store.serviceRequests.set(request.id, request);

    // 3. Reject all other offers
    for (const [id, o] of store.offers.entries()) {
      if (o.requestId === offer.requestId && id !== offer.id && o.status === 'pending') {
        o.status = 'rejected';
        o.updatedAt = nowIso();
        o.updated_at = o.updatedAt;
        store.offers.set(id, o);
      }
    }

    // 4. Create/update chat_room
    let room = Array.from(store.chatRooms.values()).find((r) => r.requestId === request.id);
    if (!room) {
      const roomId = genId();
      room = {
        id: roomId,
        clientId: request.userId,
        technicianId: offer.technicianId,
        requestId: request.id,
        serviceType: request.serviceType,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.chatRooms.set(roomId, room);
      store.chatMessages.set(roomId, []);
    } else {
      room.technicianId = offer.technicianId;
      room.updatedAt = nowIso();
      store.chatRooms.set(room.id, room);
    }

    // 5. Create appointment (upsert)
    const existingAppt = Array.from(store.appointments.values()).find((a) => a.requestId === request.id);
    if (!existingAppt) {
      const apptId = genId();
      const appt = {
        id: apptId,
        requestId: request.id,
        clientId: request.userId,
        technicianId: offer.technicianId,
        serviceType: request.serviceType,
        serviceName: request.title,
        appointmentDate: request.scheduledDate && request.scheduledDate !== 'الآن' ? request.scheduledDate : new Date().toISOString().split('T')[0],
        appointmentTime: '14:00',
        clientAddress: request.userRegion || '',
        price: offer.price,
        status: 'scheduled',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.appointments.set(apptId, appt);
    }

    // 6. Push notification to technician
    const notifId = genId();
    store.notifications.set(notifId, {
      id: notifId,
      userId: offer.technicianId,
      userType: 'technician' as const,
      title: 'تم قبول عرضك',
      body: `تم قبول عرضك لطلب ${request.title}`,
      type: 'request_update' as const,
      data: { requestId: request.id, offerId: offer.id },
      isRead: false,
      createdAt: nowIso(),
      created_at: nowIso(),
    });

    try {
      const { getIo } = require('../../socket');
      const io = getIo();
      if (io) {
        io.of('/notifications').to(`user:${offer.technicianId}`).emit('notification', { title: 'تم قبول عرضك', requestId: request.id });
      }
    } catch {}

    return sendSuccess(res, { offer, request, chatRoom: room });
  } catch (e: any) {
    return sendError(res, 500, 'Transaction failed: ' + e.message);
  }
});

// Also mount PATCH /offers/:id via separate route file handling; expose for app.ts to mount directly
export default router;
