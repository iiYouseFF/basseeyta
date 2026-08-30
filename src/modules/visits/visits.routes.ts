import { Router } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store } from '../../utils/store';

const router = Router();

// GET /visits?userId={id}&status=completed
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  const status = (req.query.status as string) || 'completed';
  if (!userId) return sendError(res, 400, 'userId required');

  // Join service_requests and appointments
  let visits = Array.from(store.serviceRequests.values()).filter((r) => r.userId === userId && r.status === status);

  // Enrich with appointment if exists
  visits = visits.map((v) => {
    const appt = Array.from(store.appointments.values()).find((a) => a.requestId === v.id);
    return {
      id: v.id,
      requestId: v.id,
      userId: v.userId,
      technicianId: v.technicianId,
      serviceName: v.title,
      status: v.status,
      amount: v.paidAmount || v.acceptedPrice || v.budget,
      visitDate: v.updatedAt,
      completedAt: v.updatedAt,
      appointment: appt || null,
      request: v,
    };
  });

  // Sort completed desc
  visits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  return sendSuccess(res, visits);
});

export default router;
