import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { store, genId, nowIso } from '../../utils/store';

const router = Router();

// POST /posts -> mounted at /posts, so path is /
router.post('/', authMiddleware, async (req, res) => {
  const schema = z.object({
    authorId: z.string(),
    authorName: z.string(),
    authorRole: z.enum(['user', 'technician']).optional().default('user'),
    title: z.string().min(1),
    content: z.string().min(1),
    imagePath: z.string().optional(),
    isQuestion: z.boolean().optional().default(false),
    category: z.string().optional().default('general'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid post data', parsed.error.errors);
  if (parsed.data.authorId !== req.user!.id && parsed.data.authorId !== req.user!.phone) {
    return sendError(res, 403, 'authorId must match authenticated user');
  }
  const id = genId();
  const now = nowIso();
  const post = {
    id,
    authorId: parsed.data.authorId,
    authorName: parsed.data.authorName,
    authorRole: parsed.data.authorRole,
    title: parsed.data.title,
    content: parsed.data.content,
    imagePath: parsed.data.imagePath || '',
    likes: 0,
    likedBy: [] as string[],
    isQuestion: parsed.data.isQuestion,
    category: parsed.data.category,
    createdAt: now,
    updatedAt: now,
    created_at: now,
  };
  store.posts.set(id, post);
  store.postLikes.set(id, new Set());
  // Index for search
  store.searchIndex.set(`post:${id}`, {
    id: genId(),
    entity_type: 'post',
    entity_id: id,
    title: post.title,
    description: post.content,
    governorate: '',
    specialty: post.category,
    created_at: now,
  });
  return sendSuccess(res, post, 'Post created', 201);
});

// GET /posts?category=plumbing&sort=createdAt.desc&limit=20&authorId={uid} -> mounted at /posts
router.get('/', async (req, res) => {
  let results = Array.from(store.posts.values());
  const category = req.query.category as string;
  const authorId = req.query.authorId as string;
  const sort = req.query.sort as string;
  const limit = parseInt(req.query.limit as string || '20', 10);

  if (category) results = results.filter((p) => p.category === category);
  if (authorId) results = results.filter((p) => p.authorId === authorId);

  const desc = !sort || sort.includes('desc');
  results.sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return desc ? db - da : da - db;
  });

  // ETag
  const etag = `W/"posts-${results.length}-${results[0]?.createdAt || ''}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.setHeader('ETag', etag);

  return sendSuccess(res, results.slice(0, limit));
});

// POST /posts/:id/like { userId } -> /posts/:id/like when mounted at /posts -> /:id/like
router.post('/:id/like', authMiddleware, async (req, res) => {
  const post = store.posts.get(req.params.id);
  if (!post) return sendError(res, 404, 'Post not found');
  const { userId } = req.body;
  if (!userId) return sendError(res, 400, 'userId required');
  const likesSet = store.postLikes.get(req.params.id) || new Set<string>();
  let liked = false;
  if (likesSet.has(userId)) {
    likesSet.delete(userId);
    post.likes = Math.max(0, (post.likes || 1) - 1);
    liked = false;
  } else {
    likesSet.add(userId);
    post.likes = (post.likes || 0) + 1;
    liked = true;
  }
  post.likedBy = Array.from(likesSet);
  post.updatedAt = nowIso();
  store.postLikes.set(req.params.id, likesSet);
  store.posts.set(req.params.id, post);
  return sendSuccess(res, { likes: post.likes, liked, likedBy: post.likedBy });
});

// PATCH /posts/:id author only -> /:id when mounted at /posts
router.patch('/:id', authMiddleware, async (req, res) => {
  const post = store.posts.get(req.params.id);
  if (!post) return sendError(res, 404, 'Post not found');
  if (post.authorId !== req.user!.id && post.authorId !== req.user!.phone) return sendError(res, 403, 'Only author can update');
  const schema = z.object({ title: z.string().optional(), content: z.string().optional(), category: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid data', parsed.error.errors);
  const updated = { ...post, ...parsed.data, updatedAt: nowIso() };
  store.posts.set(req.params.id, updated);
  return sendSuccess(res, updated);
});

// DELETE /posts/:id author only -> /:id when mounted at /posts
router.delete('/:id', authMiddleware, async (req, res) => {
  const post = store.posts.get(req.params.id);
  if (!post) return sendError(res, 404, 'Post not found');
  if (post.authorId !== req.user!.id && post.authorId !== req.user!.phone) return sendError(res, 403, 'Only author can delete');
  store.posts.delete(req.params.id);
  store.postLikes.delete(req.params.id);
  store.searchIndex.delete(`post:${req.params.id}`);
  return sendSuccess(res, { deleted: true });
});

export default router;
