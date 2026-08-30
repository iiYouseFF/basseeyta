import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const schema = z.object({
    requestId: z.string(),
    reviewerId: z.string(),
    technicianId: z.string(),
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid review', parsed.error.errors);
  // Normalize technicianId if possible
  let techId = parsed.data.technicianId;
  try {
    const { normalizeEgyptPhone } = require('../../utils/phone');
    techId = normalizeEgyptPhone(techId);
  } catch {}
  const id = genId();
  const now = nowIso();
  const review = {
    id,
    requestId: parsed.data.requestId,
    reviewerId: parsed.data.reviewerId,
    technicianId: techId,
    rating: parsed.data.rating,
    comment: parsed.data.comment || '',
    createdAt: now,
    created_at: now,
  };
  store.reviews.set(id, review);
  // Recalculate technician rating
  const tech = store.technicians.get(techId);
  if (tech) {
    const techReviews = Array.from(store.reviews.values()).filter((r) => r.technicianId === techId);
    const avg = techReviews.reduce((sum, r) => sum + r.rating, 0) / techReviews.length;
    tech.rating = Math.round(avg * 10) / 10;
    tech.updatedAt = now;
    store.technicians.set(parsed.data.technicianId, tech);
  }
  return sendSuccess(res, review, 'Review created', 201);
});

router.get('/', async (req, res) => {
  const rawTechnicianId = req.query.technicianId as string;
  if (!rawTechnicianId) return sendError(res, 400, 'technicianId required');
  // Handle '+' decoded as space in query string
  let technicianId = rawTechnicianId;
  if (technicianId.startsWith(' ') && technicianId.trim().startsWith('201')) {
    technicianId = '+' + technicianId.trim();
  }
  // Try normalized variants
  let normalized: string | null = null;
  try {
    const { normalizeEgyptPhone, getPhoneVariants } = require('../../utils/phone');
    normalized = normalizeEgyptPhone(technicianId);
    const variants = getPhoneVariants(technicianId);
    const reviews = Array.from(store.reviews.values()).filter((r) => variants.includes(r.technicianId) || r.technicianId === technicianId || r.technicianId === normalized);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return sendSuccess(res, { reviews, avg: Math.round(avg * 10) / 10, count: reviews.length });
  } catch {
    const reviews = Array.from(store.reviews.values()).filter((r) => r.technicianId === technicianId);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return sendSuccess(res, { reviews, avg: Math.round(avg * 10) / 10, count: reviews.length });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const review = store.reviews.get(req.params.id);
  if (!review) return sendError(res, 404, 'Review not found');
  if (review.reviewerId !== req.user!.id && review.reviewerId !== req.user!.phone) return sendError(res, 403, 'Only reviewer can delete');
  store.reviews.delete(req.params.id);
  // Recalculate
  const tech = store.technicians.get(review.technicianId);
  if (tech) {
    const techReviews = Array.from(store.reviews.values()).filter((r) => r.technicianId === review.technicianId);
    const avg = techReviews.length ? techReviews.reduce((s, r) => s + r.rating, 0) / techReviews.length : 0;
    tech.rating = Math.round(avg * 10) / 10;
    store.technicians.set(review.technicianId, tech);
  }
  return sendSuccess(res, { deleted: true });
});

export default router;
