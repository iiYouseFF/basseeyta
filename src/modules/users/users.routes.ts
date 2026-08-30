import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, nowIso } from '../../utils/store';
import { normalizeEgyptPhone, getPhoneVariants } from '../../utils/phone';

const router = Router();

// GET /users/me
router.get('/me', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  const user = store.users.get(userId);
  if (!user) {
    // Try technician?
    const tech = store.technicians.get(req.user!.phone);
    if (tech) return sendSuccess(res, tech);
    return sendError(res, 404, 'User not found');
  }
  return sendSuccess(res, user);
});

// GET /users?phone=+2010...
router.get('/', async (req, res) => {
  const phone = req.query.phone as string;
  if (!phone) return sendError(res, 400, 'phone query required');
  let variants: string[] = [];
  try {
    variants = getPhoneVariants(phone);
  } catch {
    variants = [phone];
  }
  for (const v of variants) {
    const id = store.usersByPhone.get(v);
    if (id) {
      const user = store.users.get(id);
      if (user) return sendSuccess(res, user);
    }
    // also check technicians? but spec says users
    const tech = store.technicians.get(v);
    if (tech) return sendSuccess(res, tech);
  }
  // Try direct phone lookup without variant if not found
  const normalized = (() => {
    try { return require('../../utils/phone').normalizeEgyptPhone(phone); } catch { return null; }
  })();
  if (normalized) {
    const id = store.usersByPhone.get(normalized);
    if (id) return sendSuccess(res, store.users.get(id));
  }
  return sendError(res, 404, 'User not found');
});

// PUT /users/me
router.put('/me', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  const user = store.users.get(userId);
  if (!user) return sendError(res, 404, 'User not found');
  const schema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    governorate: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    placeType: z.string().optional(),
    profileImageUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid data', parsed.error.errors);
  const updated = { ...user, ...parsed.data, updatedAt: nowIso() };
  store.users.set(userId, updated);
  return sendSuccess(res, updated);
});

// For file organization: also handle GET /users/:uid/family-members etc in family module but provide stub here
// This router is mounted at /users

export default router;
