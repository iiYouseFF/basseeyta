import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

// GET /users/:uid/family-members
router.get('/users/:uid/family-members', authMiddleware, async (req, res) => {
  const uid = req.params.uid;
  // Owner check
  if (req.user!.id !== uid && req.user!.phone !== uid) {
    // Allow if same user? For dev relax
  }
  const members = store.familyMembers.get(uid) || [];
  return sendSuccess(res, members);
});

// POST /users/:uid/family-members
router.post('/users/:uid/family-members', authMiddleware, async (req, res) => {
  const uid = req.params.uid;
  const schema = z.object({
    memberName: z.string().min(1),
    memberPhone: z.string().min(1),
    relationship: z.string().optional(),
    role: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid member', parsed.error.errors);
  const id = genId();
  const member = {
    id,
    memberName: parsed.data.memberName,
    memberPhone: parsed.data.memberPhone,
    relationship: parsed.data.relationship || 'member',
    role: parsed.data.role || 'member',
    createdAt: nowIso(),
  };
  const list = store.familyMembers.get(uid) || [];
  list.push(member);
  store.familyMembers.set(uid, list);
  return sendSuccess(res, member, 'Member added', 201);
});

// DELETE /users/:uid/family-members/:id
router.delete('/users/:uid/family-members/:id', authMiddleware, async (req, res) => {
  const uid = req.params.uid;
  const list = store.familyMembers.get(uid) || [];
  const idx = list.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return sendError(res, 404, 'Member not found');
  list.splice(idx, 1);
  store.familyMembers.set(uid, list);
  return sendSuccess(res, { deleted: true });
});

// POST /families/join { phone, familyCode }
router.post('/families/join', authMiddleware, async (req, res) => {
  const schema = z.object({
    phone: z.string(),
    familyCode: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid data', parsed.error.errors);
  // Find family by code
  const family = store.families.get(parsed.data.familyCode);
  if (!family) {
    // Create mock family if not exists for dev
    const newFamily = {
      code: parsed.data.familyCode,
      members: [],
      invitees: [],
      createdAt: nowIso(),
    };
    store.families.set(parsed.data.familyCode, newFamily);
    return sendSuccess(res, { family: newFamily, members: [] });
  }
  // Add member via phone lookup
  const member = { phone: parsed.data.phone, joinedAt: nowIso() };
  family.members = family.members || [];
  if (!family.members.find((m: any) => m.phone === member.phone)) {
    family.members.push(member);
    store.families.set(parsed.data.familyCode, family);
  }
  return sendSuccess(res, { family, members: family.members });
});

// GET /families/:code
router.get('/families/:code', authMiddleware, async (req, res) => {
  const family = store.families.get(req.params.code);
  if (!family) return sendError(res, 404, 'Family not found');
  return sendSuccess(res, { family, members: family.members || [], invitees: family.invitees || [] });
});

export default router;
