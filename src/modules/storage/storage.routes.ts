import { Router } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { upload } from '../../middleware/upload';
import { getSupabase } from '../../config/supabase';
import { env } from '../../config/env';

const router = Router();

const ALLOWED_BUCKETS = ['profiles', 'account_verification', 'request', 'task_images', 'community_posts'] as const;

// In-memory fallback storage: bucket/path -> Buffer + mimetype
const memoryStorage = new Map<string, { buffer: Buffer; mimetype: string; originalName: string }>();

// ---- Helpers reused by admin Storage Browser ----
export async function listStorageFiles(bucket: string): Promise<any[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list('', { limit: 500 });
      if (!error && data) {
        return data.map((f: any) => ({
          name: f.name,
          id: f.id || null,
          size: f.metadata?.size ?? null,
          mimetype: f.metadata?.mimetype || null,
          updatedAt: f.updated_at || null,
        }));
      }
    } catch (e: any) {
      console.warn('[storage] supabase list failed', e.message);
    }
  }
  const prefix = `${bucket}/`;
  const out: any[] = [];
  for (const [key, rec] of memoryStorage.entries()) {
    if (key.startsWith(prefix)) {
      out.push({ name: key.slice(prefix.length), size: rec.buffer.length, mimetype: rec.mimetype, updatedAt: null });
    }
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function removeStorageFile(bucket: string, path: string): Promise<boolean> {
  const fullKey = `${bucket}/${path}`;
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (!error) return true;
      console.warn('[storage] supabase remove failed', error.message);
    } catch {}
  }
  if (memoryStorage.has(fullKey)) {
    memoryStorage.delete(fullKey);
    return true;
  }
  return false;
}

export { ALLOWED_BUCKETS };

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const bucket = req.body.bucket as string;
  const documentId = req.body.documentId as string;
  const file = req.file;

  if (!bucket || !ALLOWED_BUCKETS.includes(bucket as any)) {
    return sendError(res, 400, `bucket must be one of ${ALLOWED_BUCKETS.join(',')}`);
  }
  if (!documentId) return sendError(res, 400, 'documentId required');
  if (!file) return sendError(res, 400, 'file required');

  const ext = file.originalname.split('.').pop() || 'jpg';
  const path = `${documentId}/${Date.now()}.${ext}`;
  const fullKey = `${bucket}/${path}`;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });
      if (error) throw error;
      const isPublic = bucket === 'profiles' || bucket === 'community_posts';
      if (isPublic) {
        const url = `${env.STORAGE_CDN_BASE}/${bucket}/${path}`;
        return sendSuccess(res, { url, path, bucket });
      } else {
        const { data, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        if (signedErr) throw signedErr;
        return sendSuccess(res, { url: data.signedUrl, path, bucket });
      }
    } catch (e: any) {
      console.warn('[storage] supabase upload failed, fallback to memory', e.message);
    }
  }

  // Fallback memory
  memoryStorage.set(fullKey, { buffer: file.buffer, mimetype: file.mimetype, originalName: file.originalname });
  const isPublic = bucket === 'profiles' || bucket === 'community_posts';
  const url = isPublic
    ? `${env.STORAGE_CDN_BASE}/${bucket}/${path}`
    : `http://localhost:${env.PORT}/storage/${bucket}/${path}?token=mock-signed`;

  // Also store for GET fallback
  return sendSuccess(res, { url, path, bucket });
});

router.get('/:bucket/:path(*)', async (req, res) => {
  const bucket = req.params.bucket;
  const path = req.params.path as string;
  if (!ALLOWED_BUCKETS.includes(bucket as any)) return sendError(res, 400, 'Invalid bucket');
  const fullKey = `${bucket}/${path}`;

  const supabase = getSupabase();
  if (supabase) {
    const isPublic = bucket === 'profiles' || bucket === 'community_posts';
    if (isPublic) {
      return res.redirect(302, `${env.STORAGE_CDN_BASE}/${bucket}/${path}`);
    } else {
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        if (!error && data?.signedUrl) return res.redirect(302, data.signedUrl);
      } catch {}
    }
  }

  const mem = memoryStorage.get(fullKey);
  if (mem) {
    res.setHeader('Content-Type', mem.mimetype);
    return res.send(mem.buffer);
  }
  return sendError(res, 404, 'File not found');
});

router.delete('/:bucket/:path(*)', authMiddleware, async (req, res) => {
  const bucket = req.params.bucket;
  const path = req.params.path as string;
  const fullKey = `${bucket}/${path}`;
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (!error) return sendSuccess(res, { deleted: true });
    } catch {}
  }
  if (memoryStorage.has(fullKey)) {
    memoryStorage.delete(fullKey);
    return sendSuccess(res, { deleted: true });
  }
  return sendError(res, 404, 'File not found');
});

export default router;
