import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, nowIso } from '../../utils/store';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const schema = z.object({
    userId: z.string(),
    name: z.string(),
    phone: z.string(),
    email: z.string().email().optional(),
    city: z.string().optional(),
    governorate: z.string().optional(),
    frontIdPath: z.string(),
    backIdPath: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid verification', parsed.error.errors);
  const now = nowIso();
  const doc = {
    userId: parsed.data.userId,
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email || '',
    city: parsed.data.city || '',
    governorate: parsed.data.governorate || '',
    frontIdPath: parsed.data.frontIdPath,
    backIdPath: parsed.data.backIdPath,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
  };
  store.verifications.set(parsed.data.userId, doc);
  return sendSuccess(res, doc, 'Verification submitted', 201);
});

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  const doc = store.verifications.get(userId);
  if (!doc) return sendError(res, 404, 'Verification not found');
  return sendSuccess(res, doc);
});

router.patch('/:userId', authMiddleware, async (req, res) => {
  const doc = store.verifications.get(req.params.userId);
  if (!doc) return sendError(res, 404, 'Verification not found');
  const schema = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
    reviewedAt: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid status', parsed.error.errors);
  doc.status = parsed.data.status;
  doc.reviewedAt = parsed.data.reviewedAt || nowIso();
  doc.updatedAt = nowIso();
  store.verifications.set(req.params.userId, doc);
  return sendSuccess(res, doc);
});

export default router;
