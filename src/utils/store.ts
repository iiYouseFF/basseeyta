import crypto from 'crypto';

// In-memory stores for dev/fallback when DB not available
// Will be replaced by real DB via pg/supabase when configured

export const store = {
  users: new Map<string, any>(),
  usersByPhone: new Map<string, string>(), // normalized phone -> user id
  technicians: new Map<string, any>(), // phone -> technician
  serviceRequests: new Map<string, any>(),
  offers: new Map<string, any>(),
  chatRooms: new Map<string, any>(),
  chatMessages: new Map<string, any[]>(), // roomId -> messages
  paymentCards: new Map<string, any>(),
  paymentLogs: new Map<string, any>(),
  transactions: new Map<string, any>(),
  instapay: new Map<string, any>(),
  posts: new Map<string, any>(),
  postLikes: new Map<string, Set<string>>(), // postId -> set of userIds
  searchIndex: new Map<string, any>(), // key: entityType:entityId
  notifications: new Map<string, any>(),
  supportTickets: new Map<string, any>(),
  reviews: new Map<string, any>(),
  appointments: new Map<string, any>(),
  familyMembers: new Map<string, any[]>(), // uid -> members
  families: new Map<string, any>(), // code -> family
  verifications: new Map<string, any>(), // userId -> verification
  promoCodes: new Map<string, any>(), // code -> promo
  promoById: new Map<string, any>(),
  admins: new Map<string, any>(), // id -> admin
  adminsByEmail: new Map<string, string>(), // email lower -> id
  adminAuditLogs: [] as any[], // ordered list
  aiUsage: [] as any[], // AI assistant call log (id, userId, governorate, query, reply, mock, createdAt)
  jobRuns: {} as Record<string, any>, // job name -> { lastRunAt, lastStatus, runs, lastDetail }
};

export function genId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Seed promo codes
(function seedPromos() {
  const promos = [
    {
      id: genId(),
      code: 'SAVE20',
      discount_type: 'percentage',
      discount_value: 20,
      min_order_amount: 100,
      max_uses: 100,
      used_count: 0,
      valid_from: new Date(Date.now() - 86400000).toISOString(),
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
      is_active: true,
      created_at: nowIso(),
    },
    {
      id: genId(),
      code: 'FIXED50',
      discount_type: 'fixed',
      discount_value: 50,
      min_order_amount: 200,
      max_uses: 50,
      used_count: 0,
      valid_from: new Date(Date.now() - 86400000).toISOString(),
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
      is_active: true,
      created_at: nowIso(),
    },
    {
      id: genId(),
      code: 'EXPIRED10',
      discount_type: 'percentage',
      discount_value: 10,
      min_order_amount: 0,
      max_uses: 10,
      used_count: 10,
      valid_from: new Date(Date.now() - 30 * 86400000).toISOString(),
      valid_until: new Date(Date.now() - 86400000).toISOString(),
      is_active: true,
      created_at: nowIso(),
    },
  ];
  for (const p of promos) {
    store.promoCodes.set(p.code, p);
    store.promoById.set(p.id, p);
  }
})();

// Seed superadmin — email: admin@basseeyta.com, password: basseytaAdmin123
(function seedAdmin() {
  const bcrypt = require('bcryptjs');
  const email = 'admin@basseeyta.com';
  const lower = email.toLowerCase();
  if (store.adminsByEmail.has(lower)) return;
  const id = genId();
  const hash = bcrypt.hashSync('basseytaAdmin123', 10);
  const admin = {
    id,
    email,
    password_hash: hash,
    name: 'Super Admin',
    is_superadmin: true,
    is_active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    created_at: nowIso(),
  };
  store.admins.set(id, admin);
  store.adminsByEmail.set(lower, id);
})();
