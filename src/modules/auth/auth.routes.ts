import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { normalizeEgyptPhone } from '../../utils/phone';
import { signJwt } from '../../utils/jwt';
import { redisIncr, redisSet } from '../../config/redis';
import { store, genId, nowIso } from '../../utils/store';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { otpRateLimit } from '../../middleware/rateLimit';
import { getAuth } from '../../config/firebase';
import { upload } from '../../middleware/upload';

const router = Router();

// In-memory OTP store for mock mode: phone -> { code, verificationId, expiresAt }
const otpStore = new Map<string, { code: string; verificationId: string; expiresAt: number }>();

// POST /auth/request-otp
router.post('/request-otp', otpRateLimit, async (req, res) => {
  const schema = z.object({ phone: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid phone', parsed.error.errors);

  let normalized: string;
  try {
    normalized = normalizeEgyptPhone(parsed.data.phone);
  } catch (e: any) {
    return sendError(res, 400, e.message);
  }

  // Rate limit via Redis counter (5 per 10min)
  const count = await redisIncr(`otp:${normalized}`, 600);
  if (count > 5) {
    return sendError(res, 429, 'Too many OTP requests, try again in 10 minutes');
  }

  if (env.USE_MOCK_OTP) {
    const verificationId = genId();
    const code = '123456'; // mock accepts any 6 digits, but we store this
    otpStore.set(normalized, { code, verificationId, expiresAt: Date.now() + 120000 });
    return sendSuccess(res, { verificationId, expiresIn: 120, mock: true }, 'OTP sent (mock)');
  }

  // Real Firebase flow: client should call Firebase directly; we just verify token elsewhere
  // For server-side mock, we still return placeholder
  const verificationId = genId();
  otpStore.set(normalized, { code: 'REAL', verificationId, expiresAt: Date.now() + 120000 });
  return sendSuccess(res, { verificationId, expiresIn: 120, mock: false }, 'OTP sent');
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const schema = z.object({
    phone: z.string(),
    code: z.string().min(4),
    verificationId: z.string().optional(),
    idToken: z.string().optional(), // Firebase idToken alternative
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid body', parsed.error.errors);

  let normalized: string;
  try {
    normalized = normalizeEgyptPhone(parsed.data.phone);
  } catch (e: any) {
    return sendError(res, 400, e.message);
  }

  // If idToken provided, verify via Firebase Admin
  if (parsed.data.idToken) {
    const auth = getAuth();
    if (auth) {
      try {
        const decoded = await auth.verifyIdToken(parsed.data.idToken);
        // Find or create user? For now return JWT
        const userId = decoded.uid || normalized;
        const existing = store.usersByPhone.get(normalized);
        const user = existing ? store.users.get(existing) : null;
        const { token } = signJwt({ sub: userId, phone: normalized, userType: user?.userType || 'user' });
        return sendSuccess(res, { token, user: user || { id: userId, phone: normalized, userType: 'user' } });
      } catch (e: any) {
        return sendError(res, 401, 'Invalid Firebase token');
      }
    }
  }

  if (env.USE_MOCK_OTP) {
    // Accept any 6-digit code in mock mode
    if (!/^\d{6}$/.test(parsed.data.code) && parsed.data.code !== '123456') {
      // Still accept any 6 digits per spec
      if (!/^\d{6}$/.test(parsed.data.code)) {
        return sendError(res, 400, 'Invalid code format');
      }
    }
    const stored = otpStore.get(normalized);
    if (stored && parsed.data.verificationId && stored.verificationId !== parsed.data.verificationId) {
      // In mock, ignore verificationId mismatch but log
    }
    // Find user by phone
    const userIdByPhone = store.usersByPhone.get(normalized);
    const tech = store.technicians.get(normalized);
    let user: any = null;
    let userType: 'user' | 'technician' = 'user';
    let sub = genId();
    if (userIdByPhone) {
      user = store.users.get(userIdByPhone);
      sub = user.id;
    } else if (tech) {
      user = tech;
      sub = tech.phone;
      userType = 'technician';
    } else {
      // Auto-create stub user id for verification response – client will register next
      sub = genId();
    }
    const { token } = signJwt({ sub, phone: normalized, userType });
    // Return user if exists
    return sendSuccess(res, { token, user: user || { id: sub, phone: normalized, userType } });
  }

  // Real mode: verify stored mock (in real prod you'd verify Firebase)
  const stored = otpStore.get(normalized);
  if (!stored || stored.code !== parsed.data.code) {
    return sendError(res, 401, 'Invalid OTP code');
  }
  if (Date.now() > stored.expiresAt) {
    return sendError(res, 401, 'OTP expired');
  }
  const userIdByPhone = store.usersByPhone.get(normalized);
  const user = userIdByPhone ? store.users.get(userIdByPhone) : null;
  const sub = user?.id || genId();
  const { token } = signJwt({ sub, phone: normalized, userType: 'user' });
  return sendSuccess(res, { token, user: user || { id: sub, phone: normalized, userType: 'user' } });
});

// POST /auth/verify-firebase-token
router.post('/verify-firebase-token', async (req, res) => {
  const schema = z.object({ idToken: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'idToken required', parsed.error.errors);
  const auth = getAuth();
  if (!auth) {
    // Mock fallback
    const { token } = signJwt({ sub: genId(), phone: '+201000000000', userType: 'user' });
    return sendSuccess(res, { token, user: { id: genId(), phone: '+201000000000', userType: 'user' } });
  }
  try {
    const decoded = await auth.verifyIdToken(parsed.data.idToken);
    const phone = (decoded.phone_number as string) || '+201000000000';
    let normalized: string;
    try {
      normalized = normalizeEgyptPhone(phone);
    } catch {
      normalized = phone;
    }
    const { token } = signJwt({ sub: decoded.uid, phone: normalized, userType: 'user' });
    return sendSuccess(res, { token, user: { id: decoded.uid, phone: normalized, userType: 'user' } });
  } catch {
    return sendError(res, 401, 'Invalid Firebase token');
  }
});

// POST /auth/register (customer)
router.post('/register', upload.single('profileImage'), async (req, res) => {
  // Supports both json and multipart
  const body = req.body;
  const schema = z.object({
    name: z.string().min(2),
    phone: z.string(),
    email: z.string().email().optional().or(z.literal('')),
    governorate: z.string().min(1),
    city: z.string().optional(),
    region: z.string().optional(),
    placeType: z.string().optional(),
    profileImageUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendError(res, 400, 'Invalid registration data', parsed.error.errors);

  let normalized: string;
  try {
    normalized = normalizeEgyptPhone(parsed.data.phone);
  } catch (e: any) {
    return sendError(res, 400, e.message);
  }

  if (store.usersByPhone.has(normalized)) {
    return sendError(res, 409, 'Phone already registered');
  }

  const id = genId();
  const now = nowIso();
  const user = {
    id,
    name: parsed.data.name,
    phone: normalized,
    email: parsed.data.email || '',
    governorate: parsed.data.governorate,
    city: parsed.data.city || '',
    region: parsed.data.region || '',
    placeType: parsed.data.placeType || '',
    profileImageUrl: parsed.data.profileImageUrl || '',
    profileImagePath: (req.file ? `profiles/${id}/${Date.now()}.${req.file.originalname.split('.').pop()}` : ''),
    userType: 'user' as const,
    createdAt: now,
    updatedAt: now,
  };
  store.users.set(id, user);
  store.usersByPhone.set(normalized, id);

  const { token } = signJwt({ sub: id, phone: normalized, userType: 'user' });
  return sendSuccess(res, { token, user }, 'Registered', 201);
});

// POST /auth/technicians/register
router.post('/technicians/register', upload.single('profileImage'), async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2),
    phone: z.string(),
    experience: z.string().optional(),
    specialty: z.string().optional(),
    governorate: z.string().min(1),
    area: z.string().optional(),
    profileImageUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid technician data', parsed.error.errors);

  let normalized: string;
  try {
    normalized = normalizeEgyptPhone(parsed.data.phone);
  } catch (e: any) {
    return sendError(res, 400, e.message);
  }

  // Check uniqueness via 2 queries (raw + normalized) – spec
  if (store.technicians.has(normalized) || store.usersByPhone.has(normalized)) {
    return sendError(res, 409, 'Phone already registered');
  }

  const now = nowIso();
  const tech = {
    phone: normalized,
    id: normalized,
    fullName: parsed.data.fullName,
    experience: parsed.data.experience || '',
    specialty: parsed.data.specialty || '',
    governorate: parsed.data.governorate,
    area: parsed.data.area || '',
    profileImageUrl: parsed.data.profileImageUrl || '',
    walletBalance: 0,
    totalEarnings: 0,
    todayEarnings: 0,
    todayOrdersCount: 0,
    rating: 0,
    completedOrdersCount: 0,
    userType: 'technician' as const,
    isVerified: false,
    createdAt: now,
    updatedAt: now,
  };
  store.technicians.set(normalized, tech);
  // Also allow phone lookup via usersByPhone for auth
  const { token } = signJwt({ sub: normalized, phone: normalized, userType: 'technician' });
  return sendSuccess(res, { token, technician: tech, user: tech }, 'Technician registered', 201);
});

// POST /auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  const jti = req.user!.jti;
  // Blacklist token for remaining TTL
  // Decode to get exp
  const token = req.headers.authorization!.slice(7);
  try {
    const decoded: any = require('jsonwebtoken').decode(token);
    const exp = decoded?.exp || Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await redisSet(`blacklist:${jti}`, '1', ttl);
  } catch {}
  return sendSuccess(res, { loggedOut: true });
});

router.delete('/session', authMiddleware, async (req, res) => {
  const jti = req.user!.jti;
  const token = req.headers.authorization!.slice(7);
  try {
    const decoded: any = require('jsonwebtoken').decode(token);
    const exp = decoded?.exp || Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await redisSet(`blacklist:${jti}`, '1', ttl);
  } catch {}
  return sendSuccess(res, { loggedOut: true });
});

export default router;
