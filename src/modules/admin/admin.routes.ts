import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware, requireAdmin } from '../../middleware/auth';
import { signJwt } from '../../utils/jwt';
import { store, genId, nowIso } from '../../utils/store';
import { env } from '../../config/env';
import { getPool, getSupabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { isJob, executeJob, recordJobRun, listJobStatus } from '../../jobs/runner';
import { listStorageFiles, removeStorageFile, ALLOWED_BUCKETS } from '../storage/storage.routes';
import { getMessaging } from '../../config/firebase';

const router = Router();

// ---------- Helpers ----------
function parsePagination(req: any) {
  let page = parseInt(req.query.page as string, 10) || 1;
  let limit = parseInt(req.query.limit as string, 10) || 20;
  if (page < 1) page = 1;
  if (limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginate<T>(arr: T[], page: number, limit: number) {
  const offset = (page - 1) * limit;
  const total = arr.length;
  const data = arr.slice(offset, offset + limit);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function addAuditLog(req: any, action: string, tableName?: string, recordId?: string, diff?: any) {
  const admin = (req as any).user;
  const adminEmail = admin?.email || admin?.phone || 'unknown';
  const adminId = admin?.id || null;
  const entry = {
    id: genId(),
    admin_id: adminId,
    admin_email: adminEmail,
    action,
    table_name: tableName || null,
    record_id: recordId || null,
    diff: diff ? JSON.stringify(diff) : null,
    diff_obj: diff || null,
    ip_address: req.ip || req.headers['x-forwarded-for'] || null,
    user_agent: req.headers['user-agent'] || null,
    created_at: nowIso(),
    createdAt: nowIso(),
  };
  // In-memory
  store.adminAuditLogs.unshift(entry);
  if (store.adminAuditLogs.length > 5000) store.adminAuditLogs.length = 5000;
  // Try DB
  try {
    const pool = getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, table_name, record_id, diff, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [entry.id, adminId, adminEmail, action, tableName || null, recordId || null, diff ? JSON.stringify(diff) : null, entry.ip_address, entry.user_agent]
      );
    }
  } catch (e: any) {
    logger.warn('[admin-audit] DB log failed: ' + e.message);
  }
  return entry;
}

// Per-field whitelist — admin can only edit these keys (prevents accidental id/phone/type tampering)
const WHITELIST: Record<string, string[]> = {
  users: ['name', 'email', 'governorate', 'city', 'region', 'placeType', 'place_type', 'profileImageUrl', 'profile_image_url', 'is_admin', 'role'],
  technicians: ['fullName', 'full_name', 'experience', 'specialty', 'governorate', 'area', 'is_verified', 'isVerified', 'walletBalance', 'wallet_balance', 'rating', 'profileImageUrl', 'profile_image_url'],
  service_requests: ['title', 'description', 'budget', 'serviceType', 'service_type', 'status', 'has_offers', 'hasOffers', 'is_paid', 'isPaid', 'technician_id', 'technicianId', 'technician_name', 'accepted_price', 'final_price', 'governorate', 'user_governorate'],
  offers: ['price', 'status', 'message', 'arrival_time', 'arrivalTime', 'duration', 'warranty', 'provide_materials', 'price_includes_materials'],
  payment_cards: ['is_default', 'isDefault', 'card_holder', 'cardHolder', 'expiry_date', 'expiryDate', 'card_type', 'cardType'],
  promo_codes: ['code', 'discount_type', 'discountType', 'discount_value', 'discountValue', 'min_order_amount', 'minOrderAmount', 'max_uses', 'maxUses', 'valid_from', 'validFrom', 'valid_until', 'validUntil', 'is_active', 'isActive'],
  posts: ['title', 'content', 'category', 'is_question', 'isQuestion', 'image_path', 'imagePath'],
  notifications: ['is_read', 'isRead', 'title', 'body'],
  support_tickets: ['status', 'priority', 'admin_reply', 'adminReply'],
  reviews: ['rating', 'comment'],
  appointments: ['status', 'appointment_date', 'appointmentDate', 'appointment_time', 'appointmentTime', 'price', 'notes', 'client_address', 'clientAddress'],
  verifications: ['status'],
  family_members: ['member_name', 'memberName', 'member_phone', 'memberPhone', 'relationship', 'role'],
  families: ['members', 'invitees'],
  chat_rooms: ['is_active', 'isActive'],
  chat_messages: ['message', 'is_read', 'isRead'],
};

function filterWhitelist(table: string, body: any) {
  const allowed = WHITELIST[table];
  if (!allowed) return { filtered: {}, rejected: Object.keys(body) };
  const filtered: any = {};
  const rejected: string[] = [];
  for (const k of Object.keys(body)) {
    if (allowed.includes(k)) filtered[k] = body[k];
    else rejected.push(k);
  }
  return { filtered, rejected };
}

function normalizeUserPayload(body: any) {
  // Map camelCase → snake or store shape
  const map: Record<string, string> = {
    placeType: 'place_type', place_type: 'place_type',
    profileImageUrl: 'profile_image_url', profile_image_url: 'profile_image_url',
    fullName: 'full_name', full_name: 'full_name',
    walletBalance: 'wallet_balance', wallet_balance: 'wallet_balance',
    isVerified: 'is_verified', is_verified: 'is_verified',
    isActive: 'is_active', is_active: 'is_active',
    isAdmin: 'is_admin', is_admin: 'is_admin',
  };
  const out: any = {};
  for (const [k, v] of Object.entries(body)) {
    const nk = map[k] || k;
    out[nk] = v;
    // keep also camel for in-memory convenience
    if (map[k]) out[k] = v;
  }
  return out;
}

// Rate-limit admin login: 5 attempts per 15 min per IP+email (brute-force protection) — relaxed in test for CI
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `${req.ip || req.headers['x-forwarded-for'] || 'unknown'}:${(req.body?.email || '').toLowerCase()}`,
  handler: (_req, res) => {
    res.status(429).json({ success: false, message: 'Too many login attempts. Please try again in 15 minutes.' });
  },
});

// ---------- Public: Admin Login ----------
router.post('/auth/login', adminLoginLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid body', parsed.error.errors);
  const { email, password } = parsed.data;
  const lower = email.toLowerCase();

  // 1) Try in-memory
  let admin: any = null;
  const id = store.adminsByEmail.get(lower);
  if (id) admin = store.admins.get(id);

  // 2) Try DB if not found
  if (!admin) {
    try {
      const pool = getPool();
      if (pool) {
        const r = await pool.query('SELECT * FROM admins WHERE lower(email)=lower($1) LIMIT 1', [email]);
        if (r.rows.length) {
          admin = r.rows[0];
          admin.id = admin.id; admin.email = admin.email; admin.password_hash = admin.password_hash;
        }
      }
    } catch (e: any) {
      logger.warn('[admin-login] DB fallback failed: ' + e.message);
    }
  }

  if (!admin) {
    // Audit failed attempt without leaking existence
    try {
      const failEntry = {
        id: genId(),
        admin_id: null,
        admin_email: lower,
        action: 'login',
        table_name: 'admins',
        record_id: null,
        diff: JSON.stringify({ failed: true, reason: 'unknown_email' }),
        diff_obj: { failed: true, reason: 'unknown_email' },
        ip_address: (req.ip || req.headers['x-forwarded-for'] || null) as any,
        user_agent: req.headers['user-agent'] || null,
        created_at: nowIso(),
        createdAt: nowIso(),
      };
      store.adminAuditLogs.unshift(failEntry);
      if (store.adminAuditLogs.length > 5000) store.adminAuditLogs.length = 5000;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
    return sendError(res, 401, 'Invalid email or password');
  }
  if (admin.is_active === false) {
    try {
      (req as any).user = { id: admin.id, phone: admin.email, email: admin.email, userType: 'admin', jti: 'inactive', isAdmin: true };
      await addAuditLog(req, 'login', 'admins', admin.id, { failed: true, reason: 'deactivated' });
    } catch {}
    return sendError(res, 403, 'Admin deactivated');
  }

  const ok = await bcrypt.compare(password, admin.password_hash || admin.passwordHash || '');
  if (!ok) {
    try {
      (req as any).user = { id: admin.id, phone: admin.email, email: admin.email, userType: 'admin', jti: 'failed', isAdmin: true };
      await addAuditLog(req, 'login', 'admins', admin.id, { failed: true, reason: 'bad_password' });
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    return sendError(res, 401, 'Invalid email or password');
  }

  const { token, jti } = signJwt({ sub: admin.id, phone: admin.email, userType: 'admin' as any, email: admin.email, isAdmin: true } as any);

  // Audit (no auth yet, use temp req.user)
  (req as any).user = { id: admin.id, phone: admin.email, email: admin.email, userType: 'admin', jti, isAdmin: true };
  await addAuditLog(req, 'login', 'admins', admin.id, { email });

  const safe = { id: admin.id, email: admin.email, name: admin.name, is_superadmin: admin.is_superadmin ?? admin.isSuperadmin, is_active: admin.is_active ?? true, created_at: admin.created_at || admin.createdAt };
  return sendSuccess(res, { token, admin: safe, jti });
});

// Public register — create new admin account (sign up) — rate-limited, audited
router.post('/auth/register', adminLoginLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(64),
    name: z.string().min(2).max(50).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid body', parsed.error.errors);
  const { email, password, name } = parsed.data;
  const lower = email.toLowerCase();
  if (store.adminsByEmail.has(lower)) return sendError(res, 409, 'Admin with this email already exists');
  try {
    const pool = getPool();
    if (pool) {
      const r = await pool.query('SELECT id FROM admins WHERE lower(email)=lower($1) LIMIT 1', [email]);
      if (r.rows.length) return sendError(res, 409, 'Admin with this email already exists');
    }
  } catch {}
  const id = genId();
  const hash = await bcrypt.hash(password, 10);
  const now = nowIso();
  const admin: any = {
    id,
    email,
    password_hash: hash,
    name: name || email.split('@')[0],
    is_superadmin: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    createdAt: now,
    updatedAt: now,
  };
  store.admins.set(id, admin);
  store.adminsByEmail.set(lower, id);
  try {
    const pool = getPool();
    if (pool) await pool.query('INSERT INTO admins (id,email,password_hash,name,is_superadmin,is_active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, email, hash, admin.name, false, true, now, now]);
  } catch (e: any) { logger.warn('[admin-register] DB insert failed: ' + e.message); }
  // Audit as anonymous (no auth) — log with email
  try {
    const failEntry: any = {
      id: genId(),
      admin_id: id,
      admin_email: lower,
      action: 'create',
      table_name: 'admins',
      record_id: id,
      diff: JSON.stringify({ email, name: admin.name, via: 'public_register' }),
      diff_obj: { email, name: admin.name, via: 'public_register' },
      ip_address: (req.ip || req.headers['x-forwarded-for'] || null) as any,
      user_agent: req.headers['user-agent'] || null,
      created_at: now,
      createdAt: now,
    };
    store.adminAuditLogs.unshift(failEntry);
    if (store.adminAuditLogs.length > 5000) store.adminAuditLogs.length = 5000;
  } catch {}
  const { token, jti } = signJwt({ sub: admin.id, phone: admin.email, userType: 'admin' as any, email: admin.email, isAdmin: true } as any);
  const safe = { id, email, name: admin.name, is_superadmin: false, is_active: true, created_at: now };
  return sendSuccess(res, { token, admin: safe, jti }, 'Admin created', 201);
});

// Me
router.get('/auth/me', authMiddleware, requireAdmin as any, async (req: any, res) => {
  const uid = req.user.id;
  let admin = store.admins.get(uid);
  if (!admin) {
    try {
      const pool = getPool();
      if (pool) {
        const r = await pool.query('SELECT id,email,name,is_superadmin,is_active,created_at FROM admins WHERE id=$1', [uid]);
        if (r.rows.length) admin = r.rows[0];
      }
    } catch {}
  }
  if (!admin) return sendError(res, 404, 'Admin not found');
  const safe = { id: admin.id, email: admin.email, name: admin.name || admin.name, is_superadmin: admin.is_superadmin, is_active: admin.is_active, created_at: admin.created_at || admin.createdAt };
  return sendSuccess(res, safe);
});

// ---------- Protected admin routes ----------
router.use(authMiddleware as any, requireAdmin as any);

// Audit logs list
router.get('/audit-logs', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const tableName = (req.query.table as string) || '';
  const adminEmail = (req.query.adminEmail as string) || '';
  const action = (req.query.action as string) || '';
  // Try DB first
  try {
    const pool = getPool();
    if (pool) {
      const conds: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (tableName) { conds.push(`table_name=$${idx++}`); vals.push(tableName); }
      if (adminEmail) { conds.push(`admin_email ILIKE $${idx++}`); vals.push(`%${adminEmail}%`); }
      if (action) { conds.push(`action=$${idx++}`); vals.push(action); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const countQ = await pool.query(`SELECT COUNT(*) FROM admin_audit_logs ${where}`, vals);
      const total = parseInt(countQ.rows[0].count, 10);
      const offset = (page - 1) * limit;
      vals.push(limit, offset);
      const q = await pool.query(`SELECT * FROM admin_audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, vals);
      return res.json({ success: true, data: q.rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    }
  } catch (e: any) {
    logger.warn('[admin-audit] DB read failed, fallback to store: ' + e.message);
  }
  let arr = [...store.adminAuditLogs];
  if (tableName) arr = arr.filter((a) => a.table_name === tableName);
  if (adminEmail) arr = arr.filter((a) => (a.admin_email || '').toLowerCase().includes(adminEmail.toLowerCase()));
  if (action) arr = arr.filter((a) => a.action === action);
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});

// Stats
router.get('/stats', async (_req: any, res) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const completedPayments = Array.from(store.paymentLogs.values()).filter((p: any) => p.status === 'completed');
  const payDate = (p: any) => p.createdAt || p.created_at || p.paid_at || p.paidAt || '';
  const revenueToday = completedPayments.filter((p: any) => payDate(p).startsWith(todayKey)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const revenueMonth = completedPayments.filter((p: any) => payDate(p).startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const todayActiveRequests = Array.from(store.serviceRequests.values()).filter(
    (r: any) => (r.createdAt || r.created_at || '').startsWith(todayKey) && ['accepted', 'in_progress', 'offer_submitted'].includes(r.status)
  ).length;
  const aiUsageToday = store.aiUsage.filter((a: any) => (a.createdAt || '').startsWith(todayKey)).length;
  const aiUsageMonth = store.aiUsage.filter((a: any) => (a.createdAt || '').startsWith(monthKey)).length;
  const aiUsageTotal = store.aiUsage.length;
  // Prefer store counts (always available) — DB as supplement if pool exists we still use store for consistency unless DB wanted
  try {
    const pool = getPool();
    if (pool) {
      // Try to get real counts from DB, fallback silently to store
      const queries: Record<string, string> = {
        users: 'SELECT COUNT(*) FROM users',
        technicians: 'SELECT COUNT(*) FROM technicians',
        service_requests: 'SELECT COUNT(*) FROM service_requests',
        offers: 'SELECT COUNT(*) FROM offers',
        payment_logs: 'SELECT COUNT(*) FROM payment_logs',
        posts: 'SELECT COUNT(*) FROM posts',
        verifications_pending: "SELECT COUNT(*) FROM verifications WHERE status='pending'",
        support_open: "SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_progress')",
        chat_rooms: 'SELECT COUNT(*) FROM chat_rooms',
        appointments: 'SELECT COUNT(*) FROM appointments',
      };
      const counts: any = {};
      for (const [k, sql] of Object.entries(queries)) {
        try {
          const r = await pool.query(sql);
          counts[k] = parseInt(r.rows[0].count, 10);
        } catch { counts[k] = null; }
      }
      // Merge with store for missing and derive extra
      const stats = {
        users: counts.users ?? store.users.size,
        technicians: counts.technicians ?? store.technicians.size,
        serviceRequests: counts.service_requests ?? store.serviceRequests.size,
        offers: counts.offers ?? store.offers.size,
        paymentLogs: counts.payment_logs ?? store.paymentLogs.size,
        posts: counts.posts ?? store.posts.size,
        verificationsPending: counts.verifications_pending ?? Array.from(store.verifications.values()).filter((v: any) => v.status === 'pending').length,
        supportOpen: counts.support_open ?? Array.from(store.supportTickets.values()).filter((t: any) => ['open', 'in_progress'].includes(t.status)).length,
        chatRooms: counts.chat_rooms ?? store.chatRooms.size,
        chatMessages: Array.from(store.chatMessages.values()).reduce((n, a: any) => n + a.length, 0),
        appointments: counts.appointments ?? store.appointments.size,
        promoCodes: store.promoCodes.size,
        notifications: store.notifications.size,
        reviews: store.reviews.size,
        transactions: store.transactions.size,
        pendingPayments: Array.from(store.paymentLogs.values()).filter((p: any) => p.status === 'pending').length,
        totalEarnings: Array.from(store.paymentLogs.values()).filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
        todayRequests: Array.from(store.serviceRequests.values()).filter((r: any) => (r.createdAt || r.created_at || '').startsWith(new Date().toISOString().slice(0, 10))).length,
        todayActiveRequests,
        revenueToday,
        revenueMonth,
        aiUsageToday,
        aiUsageMonth,
        aiUsageTotal,
      };
      // Status breakdown for requests
      const byStatus: Record<string, number> = {};
      for (const r of store.serviceRequests.values()) {
        const s = (r as any).status || 'pending';
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      (stats as any).requestsByStatus = byStatus;
      await addAuditLog(_req, 'view', 'stats', undefined, { at: nowIso() });
      return sendSuccess(res, stats);
    }
  } catch {}
  const byStatus: Record<string, number> = {};
  for (const r of store.serviceRequests.values()) {
    const s = (r as any).status || 'pending';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const stats = {
    users: store.users.size,
    technicians: store.technicians.size,
    serviceRequests: store.serviceRequests.size,
    offers: store.offers.size,
    paymentLogs: store.paymentLogs.size,
    posts: store.posts.size,
    verificationsPending: Array.from(store.verifications.values()).filter((v: any) => v.status === 'pending').length,
    supportOpen: Array.from(store.supportTickets.values()).filter((t: any) => ['open', 'in_progress'].includes(t.status)).length,
    chatRooms: store.chatRooms.size,
    chatMessages: Array.from(store.chatMessages.values()).reduce((n, a: any) => n + a.length, 0),
    appointments: store.appointments.size,
    promoCodes: store.promoCodes.size,
    notifications: store.notifications.size,
    reviews: store.reviews.size,
    transactions: store.transactions.size,
    pendingPayments: Array.from(store.paymentLogs.values()).filter((p: any) => p.status === 'pending').length,
    totalEarnings: Array.from(store.paymentLogs.values()).filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
    todayRequests: Array.from(store.serviceRequests.values()).filter((r: any) => (r.createdAt || r.created_at || '').startsWith(new Date().toISOString().slice(0, 10))).length,
    todayActiveRequests,
    revenueToday,
    revenueMonth,
    aiUsageToday,
    aiUsageMonth,
    aiUsageTotal,
    requestsByStatus: byStatus,
  };
  await addAuditLog(_req, 'view', 'stats', undefined, { at: nowIso() });
  return sendSuccess(res, stats);
});

// ---------- Admins management (sign up) ----------
router.get('/admins', async (_req: any, res) => {
  let arr = Array.from(store.admins.values()).map((a: any) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    is_superadmin: a.is_superadmin ?? a.isSuperadmin,
    is_active: a.is_active ?? true,
    created_at: a.created_at || a.createdAt,
  }));
  arr.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  await addAuditLog(_req, 'view', 'admins', undefined, { count: arr.length });
  return res.json({ success: true, data: arr, total: arr.length });
});

router.post('/admins', async (req: any, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(64),
    name: z.string().min(2).max(50).optional(),
    is_superadmin: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid body', parsed.error.errors);
  const { email, password, name, is_superadmin } = parsed.data;
  const lower = email.toLowerCase();
  if (store.adminsByEmail.has(lower)) return sendError(res, 409, 'Admin with this email already exists');
  // Check DB duplicate
  try {
    const pool = getPool();
    if (pool) {
      const r = await pool.query('SELECT id FROM admins WHERE lower(email)=lower($1) LIMIT 1', [email]);
      if (r.rows.length) return sendError(res, 409, 'Admin with this email already exists');
    }
  } catch {}
  const id = genId();
  const hash = await bcrypt.hash(password, 10);
  const now = nowIso();
  const admin: any = {
    id,
    email,
    password_hash: hash,
    name: name || email.split('@')[0],
    is_superadmin: !!is_superadmin,
    is_active: true,
    created_at: now,
    updated_at: now,
    createdAt: now,
    updatedAt: now,
  };
  store.admins.set(id, admin);
  store.adminsByEmail.set(lower, id);
  // Try DB
  try {
    const pool = getPool();
    if (pool) await pool.query('INSERT INTO admins (id,email,password_hash,name,is_superadmin,is_active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, email, hash, admin.name, !!is_superadmin, true, now, now]);
  } catch (e: any) { logger.warn('[admin-create] DB insert failed: ' + e.message); }
  await addAuditLog(req, 'create', 'admins', id, { email, is_superadmin: !!is_superadmin });
  const safe = { id, email, name: admin.name, is_superadmin: !!is_superadmin, is_active: true, created_at: now };
  return sendSuccess(res, safe, 'Admin created', 201);
});

router.delete('/admins/:id', async (req: any, res) => {
  const id = req.params.id;
  const admin = store.admins.get(id);
  if (!admin) return sendError(res, 404, 'Admin not found');
  // Prevent self-delete
  if ((req as any).user?.id === id) return sendError(res, 400, 'Cannot delete your own account');
  // Prevent deleting last superadmin
  const superCount = Array.from(store.admins.values()).filter((a: any) => a.is_superadmin).length;
  if (admin.is_superadmin && superCount <= 1) return sendError(res, 400, 'Cannot delete the last superadmin');
  store.admins.delete(id);
  store.adminsByEmail.delete(admin.email.toLowerCase());
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM admins WHERE id=$1', [id]); } catch {}
  await addAuditLog(req, 'delete', 'admins', id, { email: admin.email });
  return sendSuccess(res, { deleted: id });
});

// ---------- Generic list helpers ----------
function applySearch<T>(arr: T[], q: string, fields: (keyof T)[]) {
  if (!q) return arr;
  const s = q.toLowerCase();
  return arr.filter((o: any) => fields.some((f) => String(o[f as string] || '').toLowerCase().includes(s)));
}

// Users
router.get('/users', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  const governorate = (req.query.governorate as string) || '';
  let arr = Array.from(store.users.values());
  if (governorate) arr = arr.filter((u: any) => (u.governorate || u.governorate) === governorate);
  arr = applySearch(arr, search, ['name', 'phone', 'email', 'governorate', 'city'] as any);
  // sort newest
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  await addAuditLog(req, 'view', 'users', undefined, { page, limit, search, governorate });
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/users/:id', async (req: any, res) => {
  const u = store.users.get(req.params.id);
  if (!u) return sendError(res, 404, 'User not found');
  return sendSuccess(res, u);
});
router.patch('/users/:id', async (req: any, res) => {
  const u = store.users.get(req.params.id);
  if (!u) return sendError(res, 404, 'User not found');
  const { filtered, rejected } = filterWhitelist('users', req.body);
  if (Object.keys(filtered).length === 0) return sendError(res, 400, `No allowed fields. Allowed: ${WHITELIST.users.join(',')}. Rejected: ${rejected.join(',')}`);
  const before = { ...u };
  const mapped = normalizeUserPayload(filtered);
  // Handle is_admin / role mapping to both snake and camel
  if (mapped.is_admin !== undefined) { (u as any).is_admin = !!mapped.is_admin; (u as any).isAdmin = !!mapped.is_admin; }
  if (mapped.role !== undefined) { (u as any).role = mapped.role; if (mapped.role === 'admin') (u as any).is_admin = true; }
  if (mapped.name !== undefined) u.name = mapped.name;
  if (mapped.email !== undefined) u.email = mapped.email;
  if (mapped.governorate !== undefined) u.governorate = mapped.governorate;
  if (mapped.city !== undefined) u.city = mapped.city;
  if (mapped.region !== undefined) u.region = mapped.region;
  if (mapped.place_type !== undefined) { u.place_type = mapped.place_type; u.placeType = mapped.place_type; }
  if (mapped.profile_image_url !== undefined) { u.profile_image_url = mapped.profile_image_url; u.profileImageUrl = mapped.profile_image_url; }
  u.updatedAt = nowIso(); u.updated_at = nowIso();
  store.users.set(u.id, u);
  await addAuditLog(req, 'update', 'users', u.id, { before: { name: before.name, governorate: before.governorate }, after: filtered, rejected });
  // Try DB
  try {
    const pool = getPool();
    if (pool) {
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      if (mapped.name !== undefined) { sets.push(`name=$${i++}`); vals.push(mapped.name); }
      if (mapped.email !== undefined) { sets.push(`email=$${i++}`); vals.push(mapped.email); }
      if (mapped.governorate !== undefined) { sets.push(`governorate=$${i++}`); vals.push(mapped.governorate); }
      if (mapped.city !== undefined) { sets.push(`city=$${i++}`); vals.push(mapped.city); }
      if (mapped.is_admin !== undefined) { sets.push(`is_admin=$${i++}`); vals.push(!!mapped.is_admin); }
      if (mapped.role !== undefined) { sets.push(`role=$${i++}`); vals.push(mapped.role); }
      if (sets.length) { vals.push(u.id); await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at=now() WHERE id=$${i}`, vals); }
    }
  } catch (e: any) { logger.warn('[admin] users DB update failed: ' + e.message); }
  return sendSuccess(res, u);
});
router.delete('/users/:id', async (req: any, res) => {
  const u = store.users.get(req.params.id);
  if (!u) return sendError(res, 404, 'User not found');
  store.users.delete(req.params.id);
  // also clean phone index
  for (const [phone, id] of store.usersByPhone.entries()) if (id === req.params.id) store.usersByPhone.delete(phone);
  await addAuditLog(req, 'delete', 'users', req.params.id, { name: u.name, phone: u.phone });
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Technicians
router.get('/technicians', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  const governorate = (req.query.governorate as string) || '';
  const specialty = (req.query.specialty as string) || '';
  let arr = Array.from(store.technicians.values());
  if (governorate) arr = arr.filter((t: any) => t.governorate === governorate);
  if (specialty) arr = arr.filter((t: any) => t.specialty === specialty);
  arr = applySearch(arr, search, ['fullName', 'full_name', 'phone', 'governorate', 'specialty'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  await addAuditLog(req, 'view', 'technicians', undefined, { search, governorate });
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/technicians/:phone', async (req: any, res) => {
  const t = store.technicians.get(req.params.phone);
  if (!t) return sendError(res, 404, 'Technician not found');
  return sendSuccess(res, t);
});
router.patch('/technicians/:phone', async (req: any, res) => {
  const t = store.technicians.get(req.params.phone);
  if (!t) return sendError(res, 404, 'Technician not found');
  const { filtered, rejected } = filterWhitelist('technicians', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `No allowed fields. Allowed: ${WHITELIST.technicians.join(',')}`);
  const mapped = normalizeUserPayload(filtered);
  const before = { ...t };
  if (mapped.full_name !== undefined) { t.full_name = mapped.full_name; t.fullName = mapped.full_name; }
  if (mapped.experience !== undefined) t.experience = mapped.experience;
  if (mapped.specialty !== undefined) t.specialty = mapped.specialty;
  if (mapped.governorate !== undefined) t.governorate = mapped.governorate;
  if (mapped.area !== undefined) t.area = mapped.area;
  if (mapped.is_verified !== undefined) { t.is_verified = !!mapped.is_verified; t.isVerified = !!mapped.is_verified; }
  if (mapped.wallet_balance !== undefined) { t.wallet_balance = Number(mapped.wallet_balance); t.walletBalance = Number(mapped.wallet_balance); }
  if (mapped.rating !== undefined) t.rating = Number(mapped.rating);
  if (mapped.profile_image_url !== undefined) { t.profile_image_url = mapped.profile_image_url; t.profileImageUrl = mapped.profile_image_url; }
  t.updatedAt = nowIso(); t.updated_at = nowIso();
  store.technicians.set(t.phone, t);
  await addAuditLog(req, 'update', 'technicians', t.phone, { before: { full_name: before.full_name, is_verified: before.is_verified }, after: filtered, rejected });
  try {
    const pool = getPool();
    if (pool) {
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      if (mapped.full_name !== undefined) { sets.push(`full_name=$${i++}`); vals.push(mapped.full_name); }
      if (mapped.is_verified !== undefined) { sets.push(`is_verified=$${i++}`); vals.push(!!mapped.is_verified); }
      if (mapped.wallet_balance !== undefined) { sets.push(`wallet_balance=$${i++}`); vals.push(Number(mapped.wallet_balance)); }
      if (mapped.specialty !== undefined) { sets.push(`specialty=$${i++}`); vals.push(mapped.specialty); }
      if (mapped.governorate !== undefined) { sets.push(`governorate=$${i++}`); vals.push(mapped.governorate); }
      if (sets.length) { vals.push(t.phone); await pool.query(`UPDATE technicians SET ${sets.join(', ')}, updated_at=now() WHERE phone=$${i}`, vals); }
    }
  } catch (e: any) { logger.warn('[admin] tech DB update failed: ' + e.message); }
  return sendSuccess(res, t);
});
router.delete('/technicians/:phone', async (req: any, res) => {
  const t = store.technicians.get(req.params.phone);
  if (!t) return sendError(res, 404, 'Technician not found');
  store.technicians.delete(req.params.phone);
  await addAuditLog(req, 'delete', 'technicians', req.params.phone, { full_name: t.full_name });
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM technicians WHERE phone=$1', [req.params.phone]); } catch {}
  return sendSuccess(res, { deleted: req.params.phone });
});

// Service Requests
router.get('/service-requests', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  const status = (req.query.status as string) || '';
  const governorate = (req.query.governorate as string) || '';
  const serviceType = (req.query.serviceType as string) || (req.query.service_type as string) || '';
  let arr = Array.from(store.serviceRequests.values());
  if (status) arr = arr.filter((r: any) => r.status === status);
  if (governorate) arr = arr.filter((r: any) => (r.userGovernorate || r.user_governorate) === governorate);
  if (serviceType) arr = arr.filter((r: any) => (r.serviceType || r.service_type) === serviceType);
  arr = applySearch(arr, search, ['title', 'description', 'userName', 'user_name', 'userPhone', 'user_phone'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  await addAuditLog(req, 'view', 'service_requests', undefined, { search, status });
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/service-requests/:id', async (req: any, res) => {
  const r = store.serviceRequests.get(req.params.id);
  if (!r) return sendError(res, 404, 'Request not found');
  return sendSuccess(res, r);
});
router.patch('/service-requests/:id', async (req: any, res) => {
  const r = store.serviceRequests.get(req.params.id);
  if (!r) return sendError(res, 404, 'Request not found');
  const { filtered, rejected } = filterWhitelist('service_requests', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `No allowed fields. Allowed: ${WHITELIST.service_requests.join(',')}`);
  const before = { status: r.status, is_paid: r.is_paid };
  if (filtered.title !== undefined) r.title = filtered.title;
  if (filtered.description !== undefined) r.description = filtered.description;
  if (filtered.budget !== undefined) r.budget = filtered.budget;
  if (filtered.service_type !== undefined) { r.service_type = filtered.service_type; r.serviceType = filtered.service_type; }
  if (filtered.serviceType !== undefined) { r.service_type = filtered.serviceType; r.serviceType = filtered.serviceType; }
  if (filtered.status !== undefined) r.status = filtered.status;
  if (filtered.has_offers !== undefined) { r.has_offers = !!filtered.has_offers; r.hasOffers = !!filtered.has_offers; }
  if (filtered.hasOffers !== undefined) { r.has_offers = !!filtered.hasOffers; r.hasOffers = !!filtered.hasOffers; }
  if (filtered.is_paid !== undefined) { r.is_paid = !!filtered.is_paid; r.isPaid = !!filtered.is_paid; }
  if (filtered.isPaid !== undefined) { r.is_paid = !!filtered.isPaid; r.isPaid = !!filtered.isPaid; }
  if (filtered.technician_id !== undefined) { r.technician_id = filtered.technician_id; r.technicianId = filtered.technician_id; }
  if (filtered.technicianId !== undefined) { r.technician_id = filtered.technicianId; r.technicianId = filtered.technicianId; }
  if (filtered.accepted_price !== undefined) r.accepted_price = filtered.accepted_price;
  if (filtered.final_price !== undefined) r.final_price = filtered.final_price;
  r.updatedAt = nowIso(); r.updated_at = nowIso();
  store.serviceRequests.set(r.id, r);
  await addAuditLog(req, 'update', 'service_requests', r.id, { before, after: filtered, rejected });
  try {
    const pool = getPool();
    if (pool) {
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      if (filtered.status !== undefined) { sets.push(`status=$${i++}`); vals.push(filtered.status); }
      if (filtered.title !== undefined) { sets.push(`title=$${i++}`); vals.push(filtered.title); }
      if (filtered.is_paid !== undefined || filtered.isPaid !== undefined) { sets.push(`is_paid=$${i++}`); vals.push(!!(filtered.is_paid ?? filtered.isPaid)); }
      if (sets.length) { vals.push(r.id); await pool.query(`UPDATE service_requests SET ${sets.join(', ')}, updated_at=now() WHERE id=$${i}`, vals); }
    }
  } catch (e: any) { logger.warn('[admin] request DB update failed: ' + e.message); }
  return sendSuccess(res, r);
});
router.delete('/service-requests/:id', async (req: any, res) => {
  const r = store.serviceRequests.get(req.params.id);
  if (!r) return sendError(res, 404, 'Request not found');
  store.serviceRequests.delete(req.params.id);
  await addAuditLog(req, 'delete', 'service_requests', req.params.id, { title: r.title });
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM service_requests WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Offers
router.get('/offers', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const status = (req.query.status as string) || '';
  const requestId = (req.query.requestId as string) || '';
  let arr = Array.from(store.offers.values());
  if (status) arr = arr.filter((o: any) => o.status === status);
  if (requestId) arr = arr.filter((o: any) => o.request_id === requestId || o.requestId === requestId);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/offers/:id', async (req: any, res) => {
  const o = store.offers.get(req.params.id);
  if (!o) return sendError(res, 404, 'Offer not found');
  return sendSuccess(res, o);
});
router.patch('/offers/:id', async (req: any, res) => {
  const o = store.offers.get(req.params.id);
  if (!o) return sendError(res, 404, 'Offer not found');
  const { filtered, rejected } = filterWhitelist('offers', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `Allowed: ${WHITELIST.offers.join(',')}`);
  const before = { status: o.status, price: o.price };
  if (filtered.price !== undefined) o.price = Number(filtered.price);
  if (filtered.status !== undefined) o.status = filtered.status;
  if (filtered.message !== undefined) o.message = filtered.message;
  if (filtered.warranty !== undefined) o.warranty = filtered.warranty;
  if (filtered.arrival_time !== undefined) { o.arrival_time = filtered.arrival_time; o.arrivalTime = filtered.arrival_time; }
  if (filtered.arrivalTime !== undefined) { o.arrival_time = filtered.arrivalTime; o.arrivalTime = filtered.arrivalTime; }
  o.updatedAt = nowIso(); o.updated_at = nowIso();
  store.offers.set(o.id, o);
  await addAuditLog(req, 'update', 'offers', o.id, { before, after: filtered, rejected });
  return sendSuccess(res, o);
});
router.delete('/offers/:id', async (req: any, res) => {
  const o = store.offers.get(req.params.id);
  if (!o) return sendError(res, 404, 'Offer not found');
  store.offers.delete(req.params.id);
  await addAuditLog(req, 'delete', 'offers', req.params.id, {});
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM offers WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Payments & transactions
router.get('/payment-logs', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const status = (req.query.status as string) || '';
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.paymentLogs.values());
  if (status) arr = arr.filter((p: any) => p.status === status);
  arr = applySearch(arr, search, ['user_id', 'userId', 'technician_id', 'technicianId', 'payment_method', 'paymentMethod'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/transactions', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  let arr = Array.from(store.transactions.values());
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/instapay', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const status = (req.query.status as string) || '';
  let arr = Array.from(store.instapay.values());
  if (status) arr = arr.filter((r: any) => r.status === status);
  arr = arr.map((r: any) => {
    const request = r.requestId ? store.serviceRequests.get(r.requestId) : undefined;
    const orderTotal = request ? Number(request.final_price ?? request.finalPrice ?? request.accepted_price ?? request.budget ?? 0) : 0;
    const tech = r.technicianId ? store.technicians.get(r.technicianId) : undefined;
    const user = store.users.get(r.userId);
    return {
      ...r,
      technicianName: tech?.full_name || tech?.fullName || tech?.name || '',
      userName: user?.name || '',
      orderTotal,
      expectedCommission: Math.round(orderTotal * 0.075 * 100) / 100,
      mismatch: orderTotal > 0 && Math.abs(Number(r.amount || 0) - Math.round(orderTotal * 0.075 * 100) / 100) > 1,
    };
  });
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  // Only expose verification_code to admins (already admin-only), pending/closed split for dashboard
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.post('/instapay/:id/confirm', async (req: any, res) => {
  const record = store.instapay.get(req.params.id);
  if (!record) return sendError(res, 404, 'InstaPay transaction not found');
  if (record.status === 'verified') return sendError(res, 409, 'Already verified');
  const now = nowIso();
  record.status = 'verified';
  record.verifiedAt = now;
  record.verified_at = now;
  record.verifiedBy = (req as any).user?.email || '';
  record.closedAt = now;
  record.closed_at = now;
  store.instapay.set(req.params.id, record);
  await addAuditLog(req, 'confirm', 'instapay', record.id, { amount: record.amount, technicianId: record.technicianId, cause: 'admin_received_commission' });
  try {
    const pool = getPool();
    if (pool) await pool.query(`UPDATE instapay SET status=$1, verified_at=now(), closed_at=now() WHERE id=$2`, ['verified', record.id]);
  } catch {}
  return sendSuccess(res, record);
});
router.get('/payment-cards', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.paymentCards.values());
  arr = applySearch(arr, search, ['user_id', 'userId', 'card_last4'] as any);
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});

// Promo codes
router.get('/promo-codes', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.promoCodes.values());
  arr = applySearch(arr, search, ['code', 'discount_type'] as any);
  arr.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.post('/promo-codes', async (req: any, res) => {
  const schema = z.object({
    code: z.string().min(2).max(20),
    discount_type: z.enum(['percentage', 'fixed']).optional(),
    discountType: z.enum(['percentage', 'fixed']).optional(),
    discount_value: z.number().min(1).optional(),
    discountValue: z.number().min(1).optional(),
    min_order_amount: z.number().optional(),
    max_uses: z.number().optional(),
    valid_from: z.string().optional(),
    valid_until: z.string().optional(),
    is_active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid body', parsed.error.errors);
  const p = parsed.data as any;
  const code = p.code.toUpperCase();
  if (store.promoCodes.has(code)) return sendError(res, 409, 'Code exists');
  const id = genId();
  const now = nowIso();
  const promo = {
    id, code,
    discount_type: p.discount_type || p.discountType || 'percentage',
    discount_value: p.discount_value ?? p.discountValue ?? 10,
    min_order_amount: p.min_order_amount ?? 0,
    max_uses: p.max_uses ?? 100,
    used_count: 0,
    valid_from: p.valid_from || new Date(Date.now() - 86400000).toISOString(),
    valid_until: p.valid_until || new Date(Date.now() + 30 * 86400000).toISOString(),
    is_active: p.is_active ?? true,
    created_at: now, createdAt: now,
  };
  store.promoCodes.set(code, promo); store.promoById.set(id, promo);
  await addAuditLog(req, 'create', 'promo_codes', id, { code });
  try { const pool = getPool(); if (pool) await pool.query(`INSERT INTO promo_codes (id,code,discount_type,discount_value,min_order_amount,max_uses,used_count,valid_from,valid_until,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, code, promo.discount_type, promo.discount_value, promo.min_order_amount, promo.max_uses, 0, promo.valid_from, promo.valid_until, promo.is_active]); } catch {}
  return sendSuccess(res, promo, 'Created', 201);
});
router.patch('/promo-codes/:id', async (req: any, res) => {
  const promo = store.promoById.get(req.params.id) || Array.from(store.promoCodes.values()).find((p: any) => p.id === req.params.id);
  if (!promo) return sendError(res, 404, 'Promo not found');
  const { filtered } = filterWhitelist('promo_codes', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `Allowed: ${WHITELIST.promo_codes.join(',')}`);
  // map
  if (filtered.code !== undefined) {
    const newCode = String(filtered.code).toUpperCase();
    if (newCode !== promo.code && store.promoCodes.has(newCode)) return sendError(res, 409, 'Code exists');
    store.promoCodes.delete(promo.code); promo.code = newCode; store.promoCodes.set(newCode, promo);
  }
  if (filtered.discount_type !== undefined) promo.discount_type = filtered.discount_type;
  if (filtered.discountType !== undefined) promo.discount_type = filtered.discountType;
  if (filtered.discount_value !== undefined) promo.discount_value = Number(filtered.discount_value);
  if (filtered.discountValue !== undefined) promo.discount_value = Number(filtered.discountValue);
  if (filtered.is_active !== undefined) promo.is_active = !!filtered.is_active;
  if (filtered.isActive !== undefined) promo.is_active = !!filtered.isActive;
  if (filtered.max_uses !== undefined) promo.max_uses = Number(filtered.max_uses);
  if (filtered.valid_until !== undefined) promo.valid_until = filtered.valid_until;
  if (filtered.valid_from !== undefined) promo.valid_from = filtered.valid_from;
  await addAuditLog(req, 'update', 'promo_codes', promo.id, filtered);
  return sendSuccess(res, promo);
});
router.delete('/promo-codes/:id', async (req: any, res) => {
  const promo = store.promoById.get(req.params.id);
  if (!promo) return sendError(res, 404, 'Promo not found');
  store.promoById.delete(req.params.id); store.promoCodes.delete(promo.code);
  await addAuditLog(req, 'delete', 'promo_codes', req.params.id, { code: promo.code });
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM promo_codes WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Posts / Community
router.get('/posts', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  const category = (req.query.category as string) || '';
  let arr = Array.from(store.posts.values());
  if (category) arr = arr.filter((p: any) => p.category === category);
  arr = applySearch(arr, search, ['title', 'content', 'author_name', 'authorName'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/posts/:id', async (req: any, res) => {
  const p = store.posts.get(req.params.id);
  if (!p) return sendError(res, 404, 'Post not found');
  return sendSuccess(res, p);
});
router.patch('/posts/:id', async (req: any, res) => {
  const p = store.posts.get(req.params.id);
  if (!p) return sendError(res, 404, 'Post not found');
  const { filtered } = filterWhitelist('posts', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `Allowed: ${WHITELIST.posts.join(',')}`);
  if (filtered.title !== undefined) p.title = filtered.title;
  if (filtered.content !== undefined) p.content = filtered.content;
  if (filtered.category !== undefined) p.category = filtered.category;
  p.updatedAt = nowIso(); p.updated_at = nowIso();
  store.posts.set(p.id, p);
  await addAuditLog(req, 'update', 'posts', p.id, filtered);
  return sendSuccess(res, p);
});
router.delete('/posts/:id', async (req: any, res) => {
  const p = store.posts.get(req.params.id);
  if (!p) return sendError(res, 404, 'Post not found');
  store.posts.delete(req.params.id);
  await addAuditLog(req, 'delete', 'posts', req.params.id, { title: p.title });
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Verifications
router.get('/verifications', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const status = (req.query.status as string) || '';
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.verifications.values());
  if (status) arr = arr.filter((v: any) => v.status === status);
  arr = applySearch(arr, search, ['name', 'phone', 'email', 'governorate'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/verifications/:userId', async (req: any, res) => {
  const v = store.verifications.get(req.params.userId);
  if (!v) return sendError(res, 404, 'Verification not found');
  return sendSuccess(res, v);
});
router.patch('/verifications/:userId', async (req: any, res) => {
  const v = store.verifications.get(req.params.userId);
  if (!v) return sendError(res, 404, 'Verification not found');
  const schema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid status', parsed.error.errors);
  const before = v.status;
  v.status = parsed.data.status;
  v.reviewed_at = nowIso(); v.reviewedAt = nowIso(); v.updated_at = nowIso(); v.updatedAt = nowIso();
  store.verifications.set(req.params.userId, v);
  await addAuditLog(req, parsed.data.status === 'approved' ? 'approve' : 'reject', 'verifications', req.params.userId, { before, after: v.status });
  try { const pool = getPool(); if (pool) await pool.query(`UPDATE verifications SET status=$1, reviewed_at=now(), updated_at=now() WHERE user_id=$2`, [v.status, req.params.userId]); } catch {}
  return sendSuccess(res, v);
});

// Support tickets
router.get('/support-tickets', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const status = (req.query.status as string) || '';
  const priority = (req.query.priority as string) || '';
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.supportTickets.values());
  if (status) arr = arr.filter((t: any) => t.status === status);
  if (priority) arr = arr.filter((t: any) => t.priority === priority);
  arr = applySearch(arr, search, ['subject', 'description', 'user_id'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/support-tickets/:id', async (req: any, res) => {
  const t = store.supportTickets.get(req.params.id);
  if (!t) return sendError(res, 404, 'Ticket not found');
  return sendSuccess(res, t);
});
router.patch('/support-tickets/:id', async (req: any, res) => {
  const t = store.supportTickets.get(req.params.id);
  if (!t) return sendError(res, 404, 'Ticket not found');
  const { filtered } = filterWhitelist('support_tickets', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `Allowed: ${WHITELIST.support_tickets.join(',')}`);
  const before = { status: t.status, admin_reply: t.admin_reply };
  if (filtered.status !== undefined) t.status = filtered.status;
  if (filtered.priority !== undefined) t.priority = filtered.priority;
  if (filtered.admin_reply !== undefined) { t.admin_reply = filtered.admin_reply; t.adminReply = filtered.admin_reply; }
  if (filtered.adminReply !== undefined) { t.admin_reply = filtered.adminReply; t.adminReply = filtered.adminReply; }
  t.updated_at = nowIso(); t.updatedAt = nowIso();
  store.supportTickets.set(t.id, t);
  await addAuditLog(req, 'update', 'support_tickets', t.id, { before, after: filtered });
  try { const pool = getPool(); if (pool) await pool.query(`UPDATE support_tickets SET status=$1, admin_reply=$2, updated_at=now() WHERE id=$3`, [t.status, t.admin_reply || null, t.id]); } catch {}
  return sendSuccess(res, t);
});
router.delete('/support-tickets/:id', async (req: any, res) => {
  const t = store.supportTickets.get(req.params.id);
  if (!t) return sendError(res, 404, 'Ticket not found');
  store.supportTickets.delete(req.params.id);
  await addAuditLog(req, 'delete', 'support_tickets', req.params.id, {});
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM support_tickets WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Reviews
router.get('/reviews', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const technicianId = (req.query.technicianId as string) || '';
  let arr = Array.from(store.reviews.values());
  if (technicianId) arr = arr.filter((r: any) => r.technician_id === technicianId || r.technicianId === technicianId);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.delete('/reviews/:id', async (req: any, res) => {
  const r = store.reviews.get(req.params.id);
  if (!r) return sendError(res, 404, 'Review not found');
  store.reviews.delete(req.params.id);
  await addAuditLog(req, 'delete', 'reviews', req.params.id, {});
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM reviews WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});
router.patch('/reviews/:id', async (req: any, res) => {
  const r = store.reviews.get(req.params.id);
  if (!r) return sendError(res, 404, 'Review not found');
  const { filtered } = filterWhitelist('reviews', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `Allowed: ${WHITELIST.reviews.join(',')}`);
  if (filtered.rating !== undefined) r.rating = Number(filtered.rating);
  if (filtered.comment !== undefined) r.comment = filtered.comment;
  await addAuditLog(req, 'update', 'reviews', r.id, filtered);
  return sendSuccess(res, r);
});

// Appointments
router.get('/appointments', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const status = (req.query.status as string) || '';
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.appointments.values());
  if (status) arr = arr.filter((a: any) => a.status === status);
  arr = applySearch(arr, search, ['client_id', 'technician_id', 'service_type'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/appointments/:id', async (req: any, res) => {
  const a = store.appointments.get(req.params.id);
  if (!a) return sendError(res, 404, 'Appointment not found');
  return sendSuccess(res, a);
});
router.patch('/appointments/:id', async (req: any, res) => {
  const a = store.appointments.get(req.params.id);
  if (!a) return sendError(res, 404, 'Appointment not found');
  const { filtered } = filterWhitelist('appointments', req.body);
  if (!Object.keys(filtered).length) return sendError(res, 400, `Allowed: ${WHITELIST.appointments.join(',')}`);
  const map: any = { appointment_date: 'appointmentDate', appointment_time: 'appointmentTime', client_address: 'clientAddress' };
  for (const [k, v] of Object.entries(filtered)) {
    const camel = map[k] || k;
    (a as any)[k] = v; if (camel !== k) (a as any)[camel] = v;
  }
  a.updatedAt = nowIso(); a.updated_at = nowIso();
  store.appointments.set(a.id, a);
  await addAuditLog(req, 'update', 'appointments', a.id, filtered);
  return sendSuccess(res, a);
});
router.delete('/appointments/:id', async (req: any, res) => {
  const a = store.appointments.get(req.params.id);
  if (!a) return sendError(res, 404, 'Appointment not found');
  store.appointments.delete(req.params.id);
  await addAuditLog(req, 'delete', 'appointments', req.params.id, {});
  try { const pool = getPool(); if (pool) await pool.query('DELETE FROM appointments WHERE id=$1', [req.params.id]); } catch {}
  return sendSuccess(res, { deleted: req.params.id });
});

// Notifications
router.get('/notifications', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  const type = (req.query.type as string) || '';
  let arr = Array.from(store.notifications.values());
  if (type) arr = arr.filter((n: any) => n.type === type);
  arr = applySearch(arr, search, ['title', 'body', 'user_id'] as any);
  arr.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.delete('/notifications/:id', async (req: any, res) => {
  const n = store.notifications.get(req.params.id);
  if (!n) return sendError(res, 404, 'Notification not found');
  store.notifications.delete(req.params.id);
  await addAuditLog(req, 'delete', 'notifications', req.params.id, {});
  return sendSuccess(res, { deleted: req.params.id });
});

// Chat rooms & messages (read + moderate delete)
router.get('/chat-rooms', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const search = (req.query.search as string) || '';
  let arr = Array.from(store.chatRooms.values());
  arr = applySearch(arr, search, ['clientId', 'technicianId', 'requestId'] as any);
  arr.sort((a: any, b: any) => new Date(b.updatedAt || b.updated_at || 0).getTime() - new Date(a.updatedAt || a.updated_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/chat-rooms/:id/messages', async (req: any, res) => {
  const msgs = store.chatMessages.get(req.params.id) || [];
  const { page, limit } = parsePagination(req);
  const sorted = [...msgs].sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(sorted, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.delete('/chat-rooms/:id', async (req: any, res) => {
  const r = store.chatRooms.get(req.params.id);
  if (!r) return sendError(res, 404, 'Room not found');
  store.chatRooms.delete(req.params.id); store.chatMessages.delete(req.params.id);
  await addAuditLog(req, 'delete', 'chat_rooms', req.params.id, {});
  return sendSuccess(res, { deleted: req.params.id });
});
router.delete('/chat-messages/:roomId/:messageId', async (req: any, res) => {
  const msgs = store.chatMessages.get(req.params.roomId) || [];
  const idx = msgs.findIndex((m: any) => m.id === req.params.messageId);
  if (idx === -1) return sendError(res, 404, 'Message not found');
  msgs.splice(idx, 1);
  store.chatMessages.set(req.params.roomId, msgs);
  await addAuditLog(req, 'delete', 'chat_messages', req.params.messageId, { roomId: req.params.roomId });
  return sendSuccess(res, { deleted: req.params.messageId });
});

// Families & Family members
router.get('/families', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  let arr = Array.from(store.families.values());
  arr.sort((a: any, b: any) => new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.get('/family-members', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  let arr: any[] = [];
  for (const [uid, members] of store.familyMembers.entries()) for (const m of members) arr.push({ ...m, user_id: uid });
  arr.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});

// Search index
router.get('/search-index', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const entityType = (req.query.entityType as string) || '';
  let arr = Array.from(store.searchIndex.values());
  if (entityType) arr = arr.filter((s: any) => s.entity_type === entityType || s.entityType === entityType);
  const { data, total, totalPages } = paginate(arr, page, limit);
  return res.json({ success: true, data, total, page, limit, totalPages });
});
router.delete('/search-index/:key', async (req: any, res) => {
  const k = req.params.key;
  if (!store.searchIndex.has(k)) return sendError(res, 404, 'Not found');
  store.searchIndex.delete(k);
  await addAuditLog(req, 'delete', 'search_index', k, {});
  return sendSuccess(res, { deleted: k });
});

// ---------- Jobs / Cron Monitor ----------
router.get('/jobs', async (req: any, res) => {
  const jobs = listJobStatus();
  await addAuditLog(req, 'view', 'jobs', undefined, { count: jobs.length });
  return res.json({ success: true, data: jobs, total: jobs.length });
});

router.post('/jobs/:name/run', async (req: any, res) => {
  const name = req.params.name;
  if (!isJob(name)) return sendError(res, 400, `Unknown job ${name}`);
  try {
    const { getCronQueue } = require('../../jobs/queue');
    const queue = getCronQueue();
    if (queue) {
      await queue.add(name, {}, { delay: 0 });
      recordJobRun(name, 'queued');
      await addAuditLog(req, 'run', 'jobs', name, { mode: 'queue' });
      return sendSuccess(res, { queued: name, job: listJobStatus().find((j: any) => j.name === name) });
    }
  } catch {}
  const result = await executeJob(name);
  await addAuditLog(req, 'run', 'jobs', name, { mode: 'in-memory', detail: result.detail });
  return sendSuccess(res, { executed: name, detail: result.detail, job: listJobStatus().find((j: any) => j.name === name) });
});

// ---------- Storage Browser ----------
router.get('/storage/:bucket', async (req: any, res) => {
  const bucket = req.params.bucket;
  if (!ALLOWED_BUCKETS.includes(bucket as any)) return sendError(res, 400, `bucket must be one of ${ALLOWED_BUCKETS.join(',')}`);
  const { page, limit } = parsePagination(req);
  const files = await listStorageFiles(bucket);
  const publicBucket = bucket === 'profiles' || bucket === 'community_posts';
  const supabase = getSupabase();
  const withUrls = await Promise.all(
    files.map(async (f) => {
      let url: string | null = null;
      if (supabase) {
        if (publicBucket) url = `${env.STORAGE_CDN_BASE}/${bucket}/${f.name}`;
        else {
          try {
            const { data } = await supabase.storage.from(bucket).createSignedUrl(f.name, 3600);
            url = data?.signedUrl || null;
          } catch { url = null; }
        }
      } else {
        url = publicBucket ? `${env.STORAGE_CDN_BASE}/${bucket}/${f.name}` : `http://localhost:${env.PORT}/storage/${bucket}/${f.name}?token=mock-signed`;
      }
      return { ...f, bucket, url, public: publicBucket };
    })
  );
  const { data, total, totalPages } = paginate(withUrls, page, limit);
  await addAuditLog(req, 'view', 'storage', undefined, { bucket, total });
  return res.json({ success: true, data, total, page, limit, totalPages, bucket, public: publicBucket });
});

router.delete('/storage/:bucket/:path(*)', async (req: any, res) => {
  const bucket = req.params.bucket;
  const path = req.params.path as string;
  if (!ALLOWED_BUCKETS.includes(bucket as any)) return sendError(res, 400, 'Invalid bucket');
  const ok = await removeStorageFile(bucket, path);
  if (!ok) return sendError(res, 404, 'File not found');
  await addAuditLog(req, 'delete', 'storage', `${bucket}/${path}`, {});
  return sendSuccess(res, { deleted: `${bucket}/${path}` });
});

// ---------- AI Usage Log ----------
router.get('/ai-usage', async (req: any, res) => {
  const { page, limit } = parsePagination(req);
  const arr = [...store.aiUsage].reverse();
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const today = arr.filter((a: any) => (a.createdAt || '').startsWith(todayKey));
  const month = arr.filter((a: any) => (a.createdAt || '').startsWith(monthKey));
  const totals = {
    total: arr.length,
    today: today.length,
    month: month.length,
    mockToday: today.filter((a: any) => a.mock).length,
    mockMonth: month.filter((a: any) => a.mock).length,
  };
  const { data, total, totalPages } = paginate(arr, page, limit);
  await addAuditLog(req, 'view', 'ai_usage', undefined, { total });
  return res.json({ success: true, data, total, page, limit, totalPages, totals });
});

// ---------- Search index re-index (rebuild in-memory index from current data) ----------
router.post('/search/reindex', async (req: any, res) => {
  let built = 0;
  const set = (et: string, eid: string, title: string, description: string, governorate: string, specialty: string) => {
    if (!eid || !title) return;
    store.searchIndex.set(`${et}:${eid}`, { entity_type: et, entity_id: eid, title, description: description || '', governorate: governorate || '', specialty: specialty || '' });
    built++;
  };
  for (const u of store.users.values()) set('user', u.id, u.name || u.phone, '', u.governorate || '', '');
  for (const t of store.technicians.values()) set('technician', t.phone || t.id, t.full_name || t.fullName || t.name || t.phone, '', t.governorate || '', t.specialty || '');
  for (const r of store.serviceRequests.values()) set('service_request', r.id, r.title || '', r.description || '', r.userGovernorate || r.user_governorate || '', r.serviceType || r.service_type || '');
  try {
    const pool = getPool();
    if (pool) {
      const rows = await pool.query('SELECT entity_type, entity_id, title, description, governorate, specialty FROM search_index');
      for (const row of rows.rows) set(row.entity_type, row.entity_id, row.title, row.description, row.governorate, row.specialty);
    }
  } catch {}
  await addAuditLog(req, 'rebuild', 'search_index', undefined, { built });
  return sendSuccess(res, { rebuilt: built, total: store.searchIndex.size });
});

// ---------- Push Notifications (compose / broadcast) ----------
router.post('/push/send', async (req: any, res) => {
  const schema = z.object({
    target: z.enum(['all', 'userType', 'governorate', 'user']),
    userType: z.enum(['user', 'technician']).optional(),
    governorate: z.string().optional(),
    userId: z.string().optional(),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(1000),
    type: z.string().optional(),
    data: z.record(z.any()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid push data', parsed.error.errors);

  const pushType = parsed.data.userType || 'user';
  const gov = parsed.data.governorate || '';
  const recipients = new Map<string, { token: string; userType: string }>();
  if (parsed.data.target === 'user') {
    if (!parsed.data.userId) return sendError(res, 400, 'userId required for target=user');
    const u = store.users.get(parsed.data.userId);
    const t = store.technicians.get(parsed.data.userId);
    if (!u && !t) return sendError(res, 404, 'User not found');
    if (u?.fcmToken) recipients.set(parsed.data.userId, { token: u.fcmToken, userType: 'user' });
    if (t?.fcmToken) recipients.set(parsed.data.userId, { token: t.fcmToken, userType: 'technician' });
  } else if (parsed.data.target === 'all') {
    for (const u of store.users.values()) if (u.fcmToken) recipients.set(u.id, { token: u.fcmToken, userType: 'user' });
    for (const t of store.technicians.values()) if (t.fcmToken) recipients.set(t.id, { token: t.fcmToken, userType: 'technician' });
  } else if (parsed.data.target === 'userType') {
    const src = pushType === 'technician' ? store.technicians : store.users;
    for (const u of src.values()) {
      const id = (u as any).id || (u as any).phone;
      if (u.fcmToken && id) recipients.set(id, { token: u.fcmToken, userType: pushType });
    }
  } else if (parsed.data.target === 'governorate') {
    for (const u of store.users.values()) if (u.governorate === gov && u.fcmToken) recipients.set(u.id, { token: u.fcmToken, userType: 'user' });
    for (const t of store.technicians.values()) if (t.governorate === gov && t.fcmToken) recipients.set(t.id, { token: t.fcmToken, userType: 'technician' });
  }

  const now = nowIso();
  let created = 0;
  for (const [userId, r] of recipients.entries()) {
    const id = genId();
    store.notifications.set(id, {
      id,
      userId,
      userType: r.userType,
      title: parsed.data.title,
      body: parsed.data.body,
      type: parsed.data.type || 'admin_push',
      data: parsed.data.data || {},
      isRead: false,
      createdAt: now,
      created_at: now,
    });
    created++;
  }
  // If no fcm tokens exist, still notify sockets so clients receive a live broadcast
  const payload = { title: parsed.data.title, body: parsed.data.body };
  try {
    const { getIo } = require('../../socket');
    const io = getIo();
    if (io) io.of('/notifications').emit('admin:push', { ...payload, type: parsed.data.type || 'admin_push' });
  } catch {}
  const messaging = getMessaging();
  let fcmSent = 0;
  if (messaging) {
    if (parsed.data.target !== 'user') {
      try {
        const topic = parsed.data.target === 'all' ? 'all_users' : parsed.data.target === 'userType' ? `push_${pushType}` : `gov_${gov}`;
        const msg: any = { notification: payload, data: parsed.data.data ? Object.fromEntries(Object.entries(parsed.data.data).map(([k, v]) => [k, String(v)])) : undefined };
        if (topic) { msg.topic = topic; await messaging.send(msg); }
        fcmSent = topic ? created : 0;
      } catch (e: any) {
        console.warn('[admin-push] FCM topic failed', e.message);
        fcmSent = 0;
      }
    } else {
      for (const r of recipients.values()) {
        try {
          await messaging.send({ token: r.token, notification: payload, data: parsed.data.data ? Object.fromEntries(Object.entries(parsed.data.data).map(([k, v]) => [k, String(v)])) : undefined });
          fcmSent++;
        } catch { /* skip failed token */ }
      }
    }
  }
  await addAuditLog(req, 'create', 'push_notifications', undefined, { target: parsed.data.target, recipients: created, fcm: fcmSent, title: payload.title });
  return sendSuccess(res, { recipients: created, fcm: fcmSent, messaging: !!messaging, target: parsed.data.target });
});

export default router;
