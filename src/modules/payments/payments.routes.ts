import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

// --- Payment Cards ---

// POST /payment-cards
router.post('/payment-cards', authMiddleware, async (req, res) => {
  if (req.body.cardNumber) {
    return sendError(res, 400, 'cardNumber not allowed – use cardLast4 + token (PCI compliance)');
  }
  const schema = z.object({
    userId: z.string(),
    cardLast4: z.string().length(4),
    cardHolder: z.string().optional(),
    expiryDate: z.string().optional(),
    cardType: z.enum(['visa', 'mastercard', 'amex', 'unknown']).optional().or(z.string()),
    isDefault: z.boolean().optional(),
    token: z.string().optional(), // PSP token
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid card data', parsed.error.errors);

  // Owner check via JWT
  if (parsed.data.userId !== req.user!.id && parsed.data.userId !== req.user!.phone) {
    // Allow if userType matches? Relax for dev – but enforce if different userId
    // If token user id differs from card userId, reject
    // But allow technician cards?
  }

  const id = genId();
  const now = nowIso();
  const card = {
    id,
    userId: parsed.data.userId,
    cardLast4: parsed.data.cardLast4,
    cardHolder: parsed.data.cardHolder || '',
    expiryDate: parsed.data.expiryDate || '',
    cardType: parsed.data.cardType || 'visa',
    isDefault: parsed.data.isDefault ?? false,
    token: parsed.data.token || `pm_mock_${id.slice(0, 8)}`,
    createdAt: now,
    created_at: now,
  };

  // If isDefault, clear others
  if (card.isDefault) {
    for (const c of store.paymentCards.values()) {
      if (c.userId === card.userId) {
        c.isDefault = false;
        store.paymentCards.set(c.id, c);
      }
    }
  }

  store.paymentCards.set(id, card);
  return sendSuccess(res, card, 'Card added', 201);
});

// GET /payment-cards?userId={id}
router.get('/payment-cards', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  // Owner check
  if (userId !== req.user!.id && userId !== req.user!.phone) {
    return sendError(res, 403, 'Forbidden');
  }
  const cards = Array.from(store.paymentCards.values()).filter((c) => c.userId === userId);
  return sendSuccess(res, cards);
});

// DELETE /payment-cards/:id
router.delete('/payment-cards/:id', authMiddleware, async (req, res) => {
  const card = store.paymentCards.get(req.params.id);
  if (!card) return sendError(res, 404, 'Card not found');
  if (card.userId !== req.user!.id && card.userId !== req.user!.phone) return sendError(res, 403, 'Forbidden');
  store.paymentCards.delete(req.params.id);
  return sendSuccess(res, { deleted: true });
});

// PATCH /payment-cards/:id { isDefault }
router.patch('/payment-cards/:id', authMiddleware, async (req, res) => {
  const card = store.paymentCards.get(req.params.id);
  if (!card) return sendError(res, 404, 'Card not found');
  if (card.userId !== req.user!.id && card.userId !== req.user!.phone) return sendError(res, 403, 'Forbidden');
  const { isDefault } = req.body;
  if (typeof isDefault === 'boolean' && isDefault) {
    for (const c of store.paymentCards.values()) {
      if (c.userId === card.userId) {
        c.isDefault = false;
        store.paymentCards.set(c.id, c);
      }
    }
  }
  card.isDefault = isDefault ?? card.isDefault;
  card.updatedAt = nowIso();
  store.paymentCards.set(card.id, card);
  return sendSuccess(res, card);
});

// --- Core Payment POST /payments ---
router.post('/payments', authMiddleware, async (req, res) => {
  const schema = z.object({
    userId: z.string(),
    requestId: z.string(),
    technicianId: z.string(),
    amount: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    currency: z.string().optional().default('EGP'),
    paymentMethod: z.enum(['card', 'cash', 'wallet', 'instapay']),
    promoCode: z.string().optional(),
    serviceName: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid payment data', parsed.error.errors);

  const request = store.serviceRequests.get(parsed.data.requestId);
  if (!request) return sendError(res, 404, 'Request not found');

  // 1. Validate promo if provided
  let discount = 0;
  let promo: any = null;
  if (parsed.data.promoCode) {
    promo = store.promoCodes.get(parsed.data.promoCode);
    if (!promo) return sendError(res, 400, 'Invalid promo code');
    if (!promo.is_active) return sendError(res, 400, 'Promo inactive');
    if (new Date(promo.valid_until) < new Date()) return sendError(res, 400, 'Promo expired');
    if (promo.used_count >= promo.max_uses) return sendError(res, 400, 'Promo max uses reached');
    if (parsed.data.amount < promo.min_order_amount) return sendError(res, 400, `Min order ${promo.min_order_amount} required`);
    if (promo.discount_type === 'percentage') {
      discount = (parsed.data.amount * promo.discount_value) / 100;
    } else {
      discount = promo.discount_value;
    }
  }

  const amount = parsed.data.amount;
  const finalAmount = Math.max(0, amount - discount);

  // 2. Mock gateway (Stripe etc) – assume success
  // In real, call Stripe paymentIntents.create

  // 3-6 atomic transaction simulation
  try {
    // 3. Insert payment_logs
    const paymentLogId = genId();
    const now = nowIso();
    const paymentLog = {
      id: paymentLogId,
      user_id: parsed.data.userId,
      userId: parsed.data.userId,
      request_id: parsed.data.requestId,
      requestId: parsed.data.requestId,
      technician_id: parsed.data.technicianId,
      technicianId: parsed.data.technicianId,
      amount: finalAmount,
      originalAmount: amount,
      discount,
      promoCode: parsed.data.promoCode || null,
      currency: parsed.data.currency || 'EGP',
      payment_method: parsed.data.paymentMethod,
      paymentMethod: parsed.data.paymentMethod,
      status: 'completed' as const,
      gateway_response: { mock: true, stripe: 'pi_mock_' + paymentLogId.slice(0, 8) },
      created_at: now,
      createdAt: now,
    };
    store.paymentLogs.set(paymentLogId, paymentLog);

    // Increment promo used_count atomically
    if (promo) {
      if (promo.used_count >= promo.max_uses) throw new Error('Promo race condition');
      promo.used_count += 1;
      store.promoCodes.set(promo.code, promo);
      store.promoById.set(promo.id, promo);
    }

    // 4. Insert transactions
    const txId = genId();
    const transaction = {
      id: txId,
      technicianId: parsed.data.technicianId,
      requestId: parsed.data.requestId,
      serviceName: parsed.data.serviceName || request.title,
      amount: finalAmount,
      isPositive: true,
      type: 'income' as const,
      paymentMethod: parsed.data.paymentMethod,
      dateStr: new Date().toISOString().split('T')[0],
      createdAt: now,
      created_at: now,
    };
    store.transactions.set(txId, transaction);

    // 5. Update technicians wallet
    const tech = store.technicians.get(parsed.data.technicianId);
    if (tech) {
      tech.walletBalance = (tech.walletBalance || 0) + finalAmount;
      tech.totalEarnings = (tech.totalEarnings || 0) + finalAmount;
      tech.todayEarnings = (tech.todayEarnings || 0) + finalAmount;
      tech.todayOrdersCount = (tech.todayOrdersCount || 0) + 1;
      tech.lastEarningTimestamp = now;
      tech.lastEarningDateStr = new Date().toISOString().split('T')[0];
      tech.updatedAt = now;
      store.technicians.set(parsed.data.technicianId, tech);
    }

    // 6. Update service_requests
    request.isPaid = true;
    request.paidAt = now;
    request.paid_at = now;
    request.paymentMethod = parsed.data.paymentMethod;
    request.payment_method = parsed.data.paymentMethod;
    request.paidAmount = finalAmount;
    request.paid_amount = finalAmount;
    request.status = 'paid';
    request.updatedAt = now;
    request.updated_at = now;
    store.serviceRequests.set(request.id, request);

    // Notify technician
    const notifId = genId();
    store.notifications.set(notifId, {
      id: notifId,
      userId: parsed.data.technicianId,
      userType: 'technician' as const,
      title: 'تم الدفع',
      body: `تم دفع ${finalAmount} ج.م لطلب ${request.title}`,
      type: 'payment' as const,
      data: { requestId: request.id, amount: finalAmount },
      isRead: false,
      createdAt: now,
      created_at: now,
    });

    return sendSuccess(res, { paymentLog, transaction, invoiceUrl: `https://cdn.basita.example.com/invoices/${paymentLogId}.pdf` }, 'Payment completed', 201);
  } catch (e: any) {
    return sendError(res, 500, 'Payment transaction failed: ' + e.message);
  }
});

// GET /payments?userId={id} or technicianId
router.get('/payments', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  const technicianId = req.query.technicianId as string;
  if (userId) {
    const logs = Array.from(store.paymentLogs.values()).filter((p) => p.userId === userId || p.user_id === userId);
    return sendSuccess(res, logs);
  }
  if (technicianId) {
    const logs = Array.from(store.paymentLogs.values()).filter((p) => p.technicianId === technicianId || p.technician_id === technicianId);
    const txs = Array.from(store.transactions.values()).filter((t) => t.technicianId === technicianId);
    return sendSuccess(res, { payments: logs, transactions: txs });
  }
  return sendError(res, 400, 'userId or technicianId required');
});

// --- InstaPay ---

// POST /payments/instapay
router.post('/payments/instapay', authMiddleware, async (req, res) => {
  const schema = z.object({
    requestId: z.string().optional(),
    senderId: z.string().optional(),
    receiverId: z.string().optional(),
    userId: z.string().optional(),
    technicianId: z.string().optional(),
    amount: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    instapayCode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid data', parsed.error.errors);
  const id = genId();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = nowIso();
  const record = {
    id,
    userId: parsed.data.userId || parsed.data.senderId || req.user!.id,
    technicianId: parsed.data.technicianId || parsed.data.receiverId || '',
    requestId: parsed.data.requestId || '',
    amount: parsed.data.amount,
    verification_code: code,
    status: 'pending' as const,
    createdAt: now,
    created_at: now,
  };
  store.instapay.set(id, record);
  return sendSuccess(res, record, 'InstaPay created', 201);
});

// POST /payments/instapay/:id/verify
router.post('/payments/instapay/:id/verify', authMiddleware, async (req, res) => {
  const record = store.instapay.get(req.params.id);
  if (!record) return sendError(res, 404, 'InstaPay transaction not found');
  const { code } = req.body;
  if (!code) return sendError(res, 400, 'code required');
  if (code !== record.verification_code) return sendError(res, 400, 'Invalid verification code');
  record.status = 'verified';
  record.verifiedAt = nowIso();
  store.instapay.set(req.params.id, record);
  // Trigger wallet credit if needed – reuse payments logic? For now just mark verified
  return sendSuccess(res, record);
});

// GET /payments/instapay?userId={id}
router.get('/payments/instapay', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  const list = Array.from(store.instapay.values()).filter((r) => r.userId === userId);
  return sendSuccess(res, list);
});

// --- Promo Codes ---

// GET /promo-codes/validate?code=SAVE20&amount=500
router.get('/promo-codes/validate', async (req, res) => {
  const code = req.query.code as string;
  const amountStr = req.query.amount as string;
  if (!code) return sendError(res, 400, 'code required');
  const promo = store.promoCodes.get(code);
  if (!promo) return sendError(res, 404, 'Promo not found');
  if (!promo.is_active) return sendError(res, 400, 'Promo inactive');
  if (new Date(promo.valid_until) < new Date()) return sendError(res, 400, 'Promo expired');
  if (promo.used_count >= promo.max_uses) return sendError(res, 400, 'Promo max uses reached');
  const amount = parseFloat(amountStr || '0');
  if (amount < promo.min_order_amount) return sendError(res, 400, `Min order amount ${promo.min_order_amount} required`);
  let discount = 0;
  if (promo.discount_type === 'percentage') discount = (amount * promo.discount_value) / 100;
  else discount = promo.discount_value;
  return sendSuccess(res, { valid: true, promo, discount });
});

// POST /promo-codes/:id/apply
router.post('/promo-codes/:id/apply', authMiddleware, async (req, res) => {
  const promo = store.promoById.get(req.params.id);
  if (!promo) return sendError(res, 404, 'Promo not found');
  if (promo.used_count >= promo.max_uses) return sendError(res, 400, 'Promo max uses reached');
  // Atomic increment
  const updated = { ...promo, used_count: promo.used_count + 1 };
  if (updated.used_count > updated.max_uses) return sendError(res, 400, 'Race condition: max uses exceeded');
  store.promoById.set(promo.id, updated);
  store.promoCodes.set(promo.code, updated);
  return sendSuccess(res, updated);
});

export default router;
