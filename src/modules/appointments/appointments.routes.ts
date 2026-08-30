import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

const createSchema = z.object({
  requestId: z.string(),
  clientId: z.string(),
  technicianId: z.string(),
  serviceType: z.string(),
  serviceName: z.string().optional(),
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().optional(),
  clientAddress: z.string().optional(),
  clientLatitude: z.number().optional(),
  clientLongitude: z.number().optional(),
  technicianLatitude: z.number().optional(),
  technicianLongitude: z.number().optional(),
  estimatedDuration: z.string().optional(),
  price: z.union([z.number(), z.string()]).optional().transform((v) => (v !== undefined ? Number(v) : undefined)),
  notes: z.string().optional(),
});

router.post('/', authMiddleware, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid appointment', parsed.error.errors);
  const id = genId();
  const now = nowIso();
  const appt = {
    id,
    requestId: parsed.data.requestId,
    clientId: parsed.data.clientId,
    technicianId: parsed.data.technicianId,
    serviceType: parsed.data.serviceType,
    serviceName: parsed.data.serviceName || '',
    appointmentDate: parsed.data.appointmentDate || new Date().toISOString().split('T')[0],
    appointmentTime: parsed.data.appointmentTime || '14:00',
    clientAddress: parsed.data.clientAddress || '',
    clientLatitude: parsed.data.clientLatitude,
    clientLongitude: parsed.data.clientLongitude,
    technicianLatitude: parsed.data.technicianLatitude,
    technicianLongitude: parsed.data.technicianLongitude,
    estimatedDuration: parsed.data.estimatedDuration || '2 ساعات',
    price: parsed.data.price || 0,
    notes: parsed.data.notes || '',
    status: 'scheduled' as const,
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now,
  };
  store.appointments.set(id, appt);
  return sendSuccess(res, appt, 'Appointment created', 201);
});

// POST /appointments/upsert-on-accept
router.post('/upsert-on-accept', authMiddleware, async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return sendError(res, 400, 'requestId required');
  const request = store.serviceRequests.get(requestId);
  if (!request) return sendError(res, 404, 'Request not found');
  let appt = Array.from(store.appointments.values()).find((a) => a.requestId === requestId);
  if (appt) {
    return sendSuccess(res, appt);
  }
  const id = genId();
  const now = nowIso();
  appt = {
    id,
    requestId,
    clientId: request.userId,
    technicianId: request.technicianId || 'unknown',
    serviceType: request.serviceType,
    serviceName: request.title,
    appointmentDate: request.scheduledDate && request.scheduledDate !== 'الآن' ? request.scheduledDate : new Date().toISOString().split('T')[0],
    appointmentTime: '14:00',
    clientAddress: request.userRegion || '',
    price: request.acceptedPrice || 0,
    status: 'scheduled' as const,
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now,
  };
  store.appointments.set(id, appt);
  return sendSuccess(res, appt, 'Appointment upserted', 201);
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return sendError(res, 404, 'Appointment not found');
  const { status } = req.body;
  if (!status) return sendError(res, 400, 'status required');
  appt.status = status;
  appt.updatedAt = nowIso();
  appt.updated_at = appt.updatedAt;
  store.appointments.set(req.params.id, appt);
  return sendSuccess(res, appt);
});

router.patch('/:id/location', authMiddleware, async (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return sendError(res, 404, 'Appointment not found');
  const { role, latitude, longitude } = req.body;
  if (!role || latitude === undefined || longitude === undefined) return sendError(res, 400, 'role, latitude, longitude required');
  if (role === 'technician') {
    appt.technicianLatitude = latitude;
    appt.technicianLongitude = longitude;
  } else {
    appt.clientLatitude = latitude;
    appt.clientLongitude = longitude;
  }
  appt.updatedAt = nowIso();
  store.appointments.set(req.params.id, appt);
  return sendSuccess(res, appt);
});

router.patch('/by-request/:requestId/complete', authMiddleware, async (req, res) => {
  const appt = Array.from(store.appointments.values()).find((a) => a.requestId === req.params.requestId);
  if (!appt) return sendError(res, 404, 'Appointment not found for request');
  const { technicianLatitude, technicianLongitude, clientLatitude, clientLongitude } = req.body;
  if (technicianLatitude !== undefined) appt.technicianLatitude = technicianLatitude;
  if (technicianLongitude !== undefined) appt.technicianLongitude = technicianLongitude;
  if (clientLatitude !== undefined) appt.clientLatitude = clientLatitude;
  if (clientLongitude !== undefined) appt.clientLongitude = clientLongitude;
  appt.status = 'completed';
  appt.updatedAt = nowIso();
  store.appointments.set(appt.id, appt);
  return sendSuccess(res, appt);
});

router.get('/', authMiddleware, async (req, res) => {
  const { userId, technicianId, requestId, clientId } = req.query as any;
  let list = Array.from(store.appointments.values());
  if (userId) list = list.filter((a) => a.clientId === userId || a.clientId === requestId);
  if (clientId) list = list.filter((a) => a.clientId === clientId);
  if (technicianId) list = list.filter((a) => a.technicianId === technicianId);
  if (requestId) list = list.filter((a) => a.requestId === requestId);
  // Also support ?userId={id} generic
  if (req.query.userId) {
    const uid = req.query.userId as string;
    list = Array.from(store.appointments.values()).filter((a) => a.clientId === uid || a.technicianId === uid);
  }
  return sendSuccess(res, list);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const appt = store.appointments.get(req.params.id);
  if (!appt) return sendError(res, 404, 'Appointment not found');
  return sendSuccess(res, appt);
});

export default router;
