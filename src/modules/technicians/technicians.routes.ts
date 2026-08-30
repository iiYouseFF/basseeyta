import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, nowIso } from '../../utils/store';
import { normalizeEgyptPhone, getPhoneVariants } from '../../utils/phone';

const router = Router();

// GET /technicians?phone=+2010...
router.get('/', async (req, res) => {
  const phone = req.query.phone as string;
  if (phone) {
    let variants: string[] = [];
    try {
      variants = getPhoneVariants(phone);
    } catch { variants = [phone]; }
    for (const v of variants) {
      const tech = store.technicians.get(v);
      if (tech) return sendSuccess(res, tech);
    }
    return sendError(res, 404, 'Technician not found');
  }
  // If no phone, list all? For search compat
  const all = Array.from(store.technicians.values());
  return sendSuccess(res, all);
});

// GET /technicians/:phone
router.get('/:phone', async (req, res) => {
  const raw = req.params.phone;
  let normalized: string;
  try {
    normalized = normalizeEgyptPhone(raw);
  } catch {
    normalized = raw;
  }
  const tech = store.technicians.get(normalized) || store.technicians.get(raw);
  if (!tech) return sendError(res, 404, 'Technician not found');
  return sendSuccess(res, tech);
});

// PUT /technicians/:phone - owner check
router.put('/:phone', authMiddleware, async (req, res) => {
  const raw = req.params.phone;
  let normalized: string;
  try { normalized = normalizeEgyptPhone(raw); } catch { normalized = raw; }
  if (req.user!.phone !== normalized && req.user!.phone !== raw) {
    return sendError(res, 403, 'Forbidden: phone ownership required');
  }
  const tech = store.technicians.get(normalized) || store.technicians.get(raw);
  if (!tech) return sendError(res, 404, 'Technician not found');
  const schema = z.object({
    fullName: z.string().optional(),
    experience: z.string().optional(),
    specialty: z.string().optional(),
    governorate: z.string().optional(),
    area: z.string().optional(),
    profileImageUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid data', parsed.error.errors);
  const updated = { ...tech, ...parsed.data, updatedAt: nowIso() };
  store.technicians.set(tech.phone, updated);
  return sendSuccess(res, updated);
});

// GET /technicians/:phone/wallet
router.get('/:phone/wallet', authMiddleware, async (req, res) => {
  const raw = req.params.phone;
  let normalized: string;
  try { normalized = normalizeEgyptPhone(raw); } catch { normalized = raw; }
  const tech = store.technicians.get(normalized) || store.technicians.get(raw);
  if (!tech) return sendError(res, 404, 'Technician not found');
  const wallet = {
    walletBalance: tech.walletBalance || 0,
    totalEarnings: tech.totalEarnings || 0,
    todayEarnings: tech.todayEarnings || 0,
    todayOrdersCount: tech.todayOrdersCount || 0,
    rating: tech.rating || 0,
    completedOrdersCount: tech.completedOrdersCount || 0,
  };
  return sendSuccess(res, wallet);
});

export default router;
