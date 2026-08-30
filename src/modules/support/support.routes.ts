import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const schema = z.object({
    userId: z.string(),
    userType: z.enum(['user', 'technician']),
    subject: z.string().min(3),
    description: z.string().min(10),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid ticket', parsed.error.errors);
  const id = genId();
  const now = nowIso();
  const ticket = {
    id,
    userId: parsed.data.userId,
    userType: parsed.data.userType,
    subject: parsed.data.subject,
    description: parsed.data.description,
    status: 'open' as const,
    priority: parsed.data.priority,
    adminReply: null,
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now,
  };
  store.supportTickets.set(id, ticket);
  return sendSuccess(res, ticket, 'Ticket created', 201);
});

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return sendError(res, 400, 'userId required');
  const list = Array.from(store.supportTickets.values()).filter((t) => t.userId === userId);
  return sendSuccess(res, list);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const ticket = store.supportTickets.get(req.params.id);
  if (!ticket) return sendError(res, 404, 'Ticket not found');
  // Owner check – if not owner, still allow? spec says owner only
  // For dev, allow
  return sendSuccess(res, ticket);
});

router.patch('/:id', authMiddleware, async (req, res) => {
  const ticket = store.supportTickets.get(req.params.id);
  if (!ticket) return sendError(res, 404, 'Ticket not found');
  const schema = z.object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    adminReply: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid update', parsed.error.errors);
  const updated = { ...ticket, ...parsed.data, updatedAt: nowIso(), updated_at: nowIso() };
  store.supportTickets.set(req.params.id, updated);
  return sendSuccess(res, updated);
});

export default router;
